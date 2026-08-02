const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const users = {};       // username -> socket.id
const userSockets = {}; // username -> socket.id (reference)
const friendRequests = {}; // username -> array of senders
const userFriends = {};    // username -> array of friends

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.addEventListener('registerUser', (username) => {
        if (!username) return;
        users[username] = socket.id;
        userSockets[username] = socket.id;
        if (!friendRequests[username]) friendRequests[username] = [];
        if (!userFriends[username]) userFriends[username] = [];
        broadcastUserData();
    });

    socket.on('sendFriendRequest', ({ from, to }) => {
        if (friendRequests[to] && !friendRequests[to].includes(from) && !userFriends[to].includes(from)) {
            friendRequests[to].push(from);
            sendUserDataToUser(to);
        }
    });

    socket.on('acceptFriendRequest', ({ me, friend }) => {
        if (userFriends[me] && !userFriends[me].includes(friend)) userFriends[me].push(friend);
        if (userFriends[friend] && !userFriends[friend].includes(me)) userFriends[friend].push(me);
        
        // Remove from requests
        friendRequests[me] = friendRequests[me].filter(u => u !== friend);
        
        sendUserDataToUser(me);
        sendUserDataToUser(friend);
    });

    socket.on('rejectFriendRequest', ({ me, friend }) => {
        if (friendRequests[me]) {
            friendRequests[me] = friendRequests[me].filter(u => u !== friend);
            sendUserDataToUser(me);
        }
    });

    socket.on('globalMessage', (data) => {
        io.emit('receiveGlobalMessage', data);
    });

    // FIXED Private Message Handler
    socket.on('privateMessage', (data) => {
        const targetSid = userSockets[data.to];
        if (targetSid) {
            io.to(targetSid).emit('receivePrivateMessage', data);
        }
    });

    socket.on('disconnect', () => {
        for (let username in users) {
            if (users[username] === socket.id) {
                delete users[username];
                delete userSockets[username];
                break;
            }
        }
        broadcastUserData();
        console.log('A user disconnected:', socket.id);
    });
});

function sendUserDataToUser(username) {
    const sid = userSockets[username];
    if (sid) {
        io.to(sid).emit('updateUserData', {
            onlineUsers: Object.keys(users),
            requests: friendRequests[username] || [],
            friends: userFriends[username] || []
        });
    }
}

function broadcastUserData() {
    Object.keys(userSockets).forEach(u => {
        sendUserDataToUser(u);
    });
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));