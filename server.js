const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-Memory Data Storage
const users = {}; // socketId -> username
const userSockets = {}; // username -> socketId
const friendRequests = {}; // username -> array of requests from users
const userFriends = {}; // username -> array of friend usernames

io.on('connection', (socket) => {
  
  socket.on('registerUser', (username) => {
    users[socket.id] = username;
    userSockets[username] = socket.id;

    if (!friendRequests[username]) friendRequests[username] = [];
    if (!userFriends[username]) userFriends[username] = [];

    broadcastUserData();
  });

  // Friend Request Handlers
  socket.on('sendFriendRequest', ({ from, to }) => {
    if (friendRequests[to] && !friendRequests[to].includes(from)) {
      friendRequests[to].push(from);
      if (userSockets[to]) {
        sendUserDataToUser(to);
      }
    }
  });

  socket.on('acceptFriendRequest', ({ me, friend }) => {
    // Add to each other's friend lists
    if (!userFriends[me].includes(friend)) userFriends[me].push(friend);
    if (!userFriends[friend]) userFriends[friend] = [];
    if (!userFriends[friend].includes(me)) userFriends[friend].push(me);

    // Remove from request list
    friendRequests[me] = friendRequests[me].filter(r => r !== friend);

    sendUserDataToUser(me);
    if (userSockets[friend]) sendUserDataToUser(friend);
  });

  socket.on('rejectFriendRequest', ({ me, friend }) => {
    friendRequests[me] = friendRequests[me].filter(r => r !== friend);
    sendUserDataToUser(me);
  });

  // Messaging Handlers
  socket.on('globalMessage', (data) => {
    io.emit('receiveGlobalMessage', data);
  });

  socket.on('privateMessage', ({ sender, to, text }) => {
    const targetSocketId = userSockets[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit('receivePrivateMessage', { sender, text });
    }
  });

  socket.on('disconnect', () => {
    const username = users[socket.id];
    if (username) {
      delete userSockets[username];
      delete users[socket.id];
      broadcastUserData();
    }
  });

  function sendUserDataToUser(username) {
    const sId = userSockets[username];
    if (sId) {
      io.to(sId).emit('updateUserData', {
        onlineUsers: Object.values(users),
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
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));