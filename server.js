const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

// 1. Root folder-la irundhu HTML static-a serve panna:
app.use(express.static(__dirname));

// 2. Main page GET request-ukku index.html-a direct-ah anuppa:
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let activeUsers = [];

io.on('connection', (socket) => {
  socket.on('userJoined', (data) => {
    socket.userData = data;
    activeUsers.push(data);
    io.emit('updateUsers', activeUsers);
  });

  socket.on('chatMessage', (data) => {
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    if (socket.userData) {
      activeUsers = activeUsers.filter(u => u.name !== socket.userData.name);
      io.emit('updateUsers', activeUsers);
    }
  });
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));