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

// Get list of all active rooms
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

  // Send initial room list
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
    const otherPeers = Array.from(roomData.peers).filter(id =
