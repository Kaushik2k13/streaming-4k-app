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

// Track active rooms and peers
const rooms = {};

app.get('/', (req, res) => {
  res.send('4K Streaming Signaling Server is running');
});

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Join room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(socket.id);

    // Notify others in room
    const otherPeers = rooms[roomId].filter(id => id !== socket.id);
    socket.emit('peers-in-room', otherPeers);
    socket.broadcast.to(roomId).emit('new-peer', { peerId: socket.id });

    console.log(`📍 Room ${roomId}: ${rooms[roomId].length} peers`);
  });

  // SDP Offer
  socket.on('offer', (data) => {
    const { to, offer } = data;
    console.log(`📤 Offer from ${socket.id} to ${to}`);
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  // SDP Answer
  socket.on('answer', (data) => {
    const { to, answer } = data;
    console.log(`📥 Answer from ${socket.id} to ${to}`);
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  // ICE Candidate
  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    console.log(`❄️  ICE candidate from ${socket.id} to ${to}`);
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);

    // Remove from all rooms
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      io.to(roomId).emit('peer-disconnected', { peerId: socket.id });

      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling Server running on http://localhost:${PORT}`);
});
