const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      'https://streaming-4k-app.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173'
    ],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Track all rooms and their metadata
const rooms = new Map();

app.get('/', (req, res) => {
  res.send('4K Streaming Signaling Server is running');
});

// API endpoint to get all active rooms
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([roomId, data]) => ({
    roomId,
    peerCount: data.peers.size,
    createdAt: data.createdAt,
    isStreaming: data.isStreaming
  }));
  res.json(roomList);
});

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Send initial room list to new user
  socket.emit('rooms-list', Array.from(rooms.entries()).map(([roomId, data]) => ({
    roomId,
    peerCount: data.peers.size,
    createdAt: data.createdAt,
    isStreaming: data.isStreaming
  })));

  // User joins a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        peers: new Set(),
        createdAt: new Date(),
        isStreaming: false
      });
    }

    const roomData = rooms.get(roomId);
    roomData.peers.add(socket.id);

    // Get list of other peers in room
    const otherPeers = Array.from(roomData.peers).filter(id => id !== socket.id);
    socket.emit('peers-in-room', otherPeers);

    // Notify everyone in room of new peer
    socket.broadcast.to(roomId).emit('new-peer', { peerId: socket.id });

    // Broadcast updated room list to ALL connected clients
    io.emit('rooms-list', Array.from(rooms.entries()).map(([id, data]) => ({
      roomId: id,
      peerCount: data.peers.size,
      createdAt: data.createdAt,
      isStreaming: data.isStreaming
    })));

    console.log(`📍 Room ${roomId}: ${roomData.peers.size} peers`);
  });

  // User starts streaming (sharing screen)
  socket.on('start-streaming', (roomId) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).isStreaming = true;

      // Broadcast updated room list
      io.emit('rooms-list', Array.from(rooms.entries()).map(([id, data]) => ({
        roomId: id,
        peerCount: data.peers.size,
        createdAt: data.createdAt,
        isStreaming: data.isStreaming
      })));
    }
  });

  // User stops streaming
  socket.on('stop-streaming', (roomId) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).isStreaming = false;

      // Broadcast updated room list
      io.emit('rooms-list', Array.from(rooms.entries()).map(([id, data]) => ({
        roomId: id,
        peerCount: data.peers.size,
        createdAt: data.createdAt,
        isStreaming: data.isStreaming
      })));
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    const { to, offer } = data;
    console.log(`📤 Offer from ${socket.id} to ${to}`);
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', (data) => {
    const { to, answer } = data;
    console.log(`📥 Answer from ${socket.id} to ${to}`);
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    console.log(`❄️  ICE candidate from ${socket.id} to ${to}`);
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // User disconnects
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);

    // Remove from all rooms
    for (const [roomId, roomData] of rooms.entries()) {
      if (roomData.peers.has(socket.id)) {
        roomData.peers.delete(socket.id);
        io.to(roomId).emit('peer-disconnected', { peerId: socket.id });

        // Delete room if empty
        if (roomData.peers.size === 0) {
          rooms.delete(roomId);
        }
      }
    }

    // Broadcast updated room list
    io.emit('rooms-list', Array.from(rooms.entries()).map(([id, data]) => ({
      roomId: id,
      peerCount: data.peers.size,
      createdAt: data.createdAt,
      isStreaming: data.isStreaming
    })));
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling Server running on http://localhost:${PORT}`);
});