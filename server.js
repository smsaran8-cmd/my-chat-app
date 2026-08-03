const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Local / Fallback Mongo setup
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/perfectchat";
let isDbConnected = false;

mongoose.connect(MONGO_URI)
    .then(() => {
        isDbConnected = true;
        console.log("📦 Connected to MongoDB successfully");
    })
    .catch(err => {
        console.log("⚠️ Running without MongoDB (In-Memory Fallback Active):", err.message);
    });

// Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    friends: [String],
    requests: [String]
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: String,
    recipient: { type: String, default: 'public' },
    type: String,
    content: String,
    time: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// In-Memory Backup
let memoryUsers = {};
let memoryMessages = [];
let onlineUsers = {};

io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    // LOGIN / REGISTER / GUEST LOGIN
    socket.on('loginUser', async ({ username, password, isRegister, isGuest }) => {
        try {
            if (isGuest) {
                const guestName = username || ("Guest_" + Math.floor(Math.random() * 8999 + 1000));
                onlineUsers[socket.id] = guestName;
                socket.join(guestName);
                socket.emit('authSuccess', { username: guestName, isGuest: true });
                broadcastOnlineUsers();
                sendUserData(socket, guestName);
                return;
            }

            if (isDbConnected) {
                let user = await User.findOne({ username });
                if (isRegister) {
                    if (user) return socket.emit('authError', 'Username already exists!');
                    user = new User({ username, password, friends: [], requests: [] });
                    await user.save();
                } else {
                    if (!user || user.password !== password) {
                        return socket.emit('authError', 'Invalid username or password!');
                    }
                }
            } else {
                // In-Memory fallback if DB is not available
                if (isRegister) {
                    if (memoryUsers[username]) return socket.emit('authError', 'Username already exists!');
                    memoryUsers[username] = { password, friends: [], requests: [] };
                } else {
                    if (!memoryUsers[username] || memoryUsers[username].password !== password) {
                        return socket.emit('authError', 'Invalid username or password!');
                    }
                }
            }

            onlineUsers[socket.id] = username;
            socket.join(username);
            socket.emit('authSuccess', { username, isGuest: false });
            broadcastOnlineUsers();
            sendUserData(socket, username);
        } catch (e) {
            console.log("Auth Error:", e);
            socket.emit('authError', 'Authentication failed. Try Continuing as Guest!');
        }
    });

    // LOAD HISTORY
    socket.on('loadHistory', async ({ currentUser, targetUser }) => {
        try {
            let history = [];
            if (isDbConnected) {
                let query = targetUser === 'public' 
                    ? { recipient: 'public' }
                    : { $or: [
                        { sender: currentUser, recipient: targetUser },
                        { sender: targetUser, recipient: currentUser }
                      ]};
                history = await Message.find(query).sort({ timestamp: 1 }).limit(100);
            } else {
                history = memoryMessages.filter(m => {
                    if (targetUser === 'public') return m.recipient === 'public';
                    return (m.sender === currentUser && m.recipient === targetUser) ||
                           (m.sender === targetUser && m.recipient === currentUser);
                });
            }
            socket.emit('chatHistory', history);
        } catch (e) { console.log(e); }
    });

    // SEND MESSAGE
    socket.on('sendMessage', async (data) => {
        try {
            const { sender, recipient, type, content, time } = data;
            const newMsg = { sender, recipient, type, content, time, timestamp: new Date() };

            if (isDbConnected) {
                const dbMsg = new Message(newMsg);
                await dbMsg.save();
            } else {
                memoryMessages.push(newMsg);
            }

            if (recipient === 'public') {
                io.emit('receiveMessage', newMsg);
            } else {
                io.to(recipient).emit('receiveMessage', newMsg);
                io.to(sender).emit('receiveMessage', newMsg);
            }
        } catch (e) { console.log(e); }
    });

    // FRIEND SYSTEM
    socket.on('sendFriendRequest', async ({ sender, recipient }) => {
        try {
            if (isDbConnected) {
                let target = await User.findOne({ username: recipient });
                if (target && !target.requests.includes(sender) && !target.friends.includes(sender)) {
                    target.requests.push(sender);
                    await target.save();
                    io.to(recipient).emit('friendRequestReceived', { sender });
                }
            }
        } catch (e) { console.log(e); }
    });

    socket.on('acceptFriendRequest', async ({ currentUser, friendName }) => {
        try {
            if (isDbConnected) {
                let user = await User.findOne({ username: currentUser });
                let friend = await User.findOne({ username: friendName });
                if (user && friend) {
                    user.requests = user.requests.filter(r => r !== friendName);
                    if (!user.friends.includes(friendName)) user.friends.push(friendName);
                    if (!friend.friends.includes(currentUser)) friend.friends.push(currentUser);
                    await user.save();
                    await friend.save();
                    sendUserData(socket, currentUser);
                }
            }
        } catch (e) { console.log(e); }
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        broadcastOnlineUsers();
    });
});

async function sendUserData(socket, username) {
    try {
        if (isDbConnected) {
            let user = await User.findOne({ username });
            if (user) socket.emit('userData', { friends: user.friends, requests: user.requests });
        } else {
            socket.emit('userData', { friends: [], requests: [] });
        }
    } catch (e) { console.log(e); }
}

function broadcastOnlineUsers() {
    const list = Object.values(onlineUsers).map(username => ({ username }));
    io.emit('updateOnlineList', list);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));