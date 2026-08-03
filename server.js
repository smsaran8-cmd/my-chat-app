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

// MongoDB Connection (Fallback to in-memory if URI not provided)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://demo:demo123@cluster0.mongodb.net/perfectchat?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("📦 Connected to MongoDB successfully"))
    .catch(err => console.log("⚠️ MongoDB connection error, using fallback or check URI:", err.message));

// Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    friends: [String],
    requests: [String] // Incoming friend requests
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: String,
    recipient: { type: String, default: 'public' }, // 'public' or specific username for private chat
    type: String,
    content: String,
    time: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

let onlineUsers = {}; // socket.id -> username

io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    // Register User session
    socket.on('loginUser', async ({ username, password, isRegister }) => {
        try {
            let user = await User.findOne({ username });
            if (isRegister) {
                if (user) {
                    socket.emit('authError', 'Username already exists!');
                    return;
                }
                user = new User({ username, password, friends: [], requests: [] });
                await user.save();
            } else {
                if (!user || user.password !== password) {
                    socket.emit('authError', 'Invalid username or password!');
                    return;
                }
            }

            onlineUsers[socket.id] = username;
            socket.join(username); // Personal room for private notifications
            
            socket.emit('authSuccess', username);
            broadcastOnlineUsers();
            sendUserData(socket, username);
        } catch (e) {
            socket.emit('authError', 'Server error during authentication.');
        }
    });

    // Load Chat History (Public or Private)
    socket.on('loadHistory', async ({ currentUser, targetUser }) => {
        try {
            let query = targetUser === 'public' 
                ? { recipient: 'public' }
                : { $or: [
                    { sender: currentUser, recipient: targetUser },
                    { sender: targetUser, recipient: currentUser }
                  ]};
            
            const history = await Message.find(query).sort({ timestamp: 1 }).limit(100);
            socket.emit('chatHistory', history);
        } catch (e) {
            console.log('Error loading history:', e);
        }
    });

    // Send Message (Public or Private)
    socket.on('sendMessage', async (data) => {
        try {
            const { sender, recipient, type, content, time } = data;
            const newMsg = new Message({ sender, recipient, type, content, time });
            await newMsg.save();

            if (recipient === 'public') {
                io.emit('receiveMessage', newMsg);
            } else {
                // Send to recipient and sender
                io.to(recipient).emit('receiveMessage', newMsg);
                io.to(sender).emit('receiveMessage', newMsg);
            }
        } catch (e) {
            console.log('Error saving message:', e);
        }
    });

    // Friend Request Handling
    socket.on('sendFriendRequest', async ({ sender, recipient }) => {
        try {
            let target = await User.findOne({ username: recipient });
            if (target && !target.requests.includes(sender) && !target.friends.includes(sender)) {
                target.requests.push(sender);
                await target.save();
                io.to(recipient).emit('friendRequestReceived', { sender });
            }
        } catch (e) { console.log(e); }
    });

    socket.on('acceptFriendRequest', async ({ currentUser, friendName }) => {
        try {
            let user = await User.findOne({ username: currentUser });
            let friend = await User.findOne({ username: friendName });

            if (user && friend) {
                user.requests = user.requests.filter(r => r !== friendName);
                if (!user.friends.includes(friendName)) user.friends.push(friendName);
                if (!friend.friends.includes(currentUser)) friend.friends.push(currentUser);

                await user.save();
                await friend.save();

                sendUserData(socket, currentUser);
                // Also update friend if online
                const friendSocketId = Object.keys(onlineUsers).find(key => onlineUsers[key] === friendName);
                if (friendSocketId) {
                    const fSocket = io.sockets.sockets.get(friendSocketId);
                    if (fSocket) sendUserData(fSocket, friendName);
                }
            }
        } catch (e) { console.log(e); }
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        broadcastOnlineUsers();
        console.log('🔌 User disconnected:', socket.id);
    });
});

async function sendUserData(socket, username) {
    try {
        let user = await User.findOne({ username });
        if (user) {
            socket.emit('userData', { friends: user.friends, requests: user.requests });
        }
    } catch (e) { console.log(e); }
}

function broadcastOnlineUsers() {
    const list = Object.values(onlineUsers).map(username => ({ username }));
    io.emit('updateOnlineList', list);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));