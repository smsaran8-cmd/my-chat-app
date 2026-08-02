const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let chatHistory = [];
let onlineUsers = {}; // Stores socket.id -> { username, level, status }

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Send history on connect
    socket.emit('loadHistory', chatHistory);

    // Register User
    socket.on('registerUser', (data) => {
        const username = typeof data === 'string' ? data : data.username;
        onlineUsers[socket.id] = {
            id: socket.id,
            username: username || 'Guest',
            level: Math.floor(Math.random() * 50) + 1,
            status: 'Online & Chatting 🎈'
        };

        // Notify all users about new join
        const joinMsg = {
            type: 'system',
            content: `<b>${onlineUsers[socket.id].username}</b> has joined the room`,
            time: getCurrentTime()
        };
        chatHistory.push(joinMsg);
        io.emit('receiveGlobalMessage', joinMsg);

        // Update Online Users List to Everyone
        io.emit('updateOnlineList', Object.values(onlineUsers));
    });

    // Handle Messages
    socket.on('globalMessage', (data) => {
        const msgData = {
            ...data,
            senderId: socket.id,
            time: getCurrentTime()
        };
        chatHistory.push(msgData);
        if (chatHistory.length > 150) chatHistory.shift();

        io.emit('receiveGlobalMessage', msgData);
    });

    // Handle Private Message Request
    socket.on('sendPrivateMsg', (data) => {
        io.to(data.targetSocketId).emit('receivePrivateMsg', {
            sender: onlineUsers[socket.id]?.username || 'User',
            senderId: socket.id,
            content: data.content,
            time: getCurrentTime()
        });
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
        if (onlineUsers[socket.id]) {
            const leaveMsg = {
                type: 'system',
                content: `<b>${onlineUsers[socket.id].username}</b> has left the room`,
                time: getCurrentTime()
            };
            chatHistory.push(leaveMsg);
            io.emit('receiveGlobalMessage', leaveMsg);

            delete onlineUsers[socket.id];
            io.emit('updateOnlineList', Object.values(onlineUsers));
        }
    });
});

function getCurrentTime() {
    const d = new Date();
    return `${d.getHours()}:${d.getMinutes() < 10 ? '0' : ''}${d.getMinutes()}`;
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));