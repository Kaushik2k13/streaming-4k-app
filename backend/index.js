const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Serve static files (if needed)
app.use(express.static('public'));

// Basic health check
app.get('/', (req, res) => {
  res.send('4K Streaming Server is running');
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.broadcast.to(roomId).emit('user-joined', { userId: socket.id });
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('signal', (data) => {
    socket.to(data.to).emit('signal', {
      from: socket.id,
      data: data.data
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});