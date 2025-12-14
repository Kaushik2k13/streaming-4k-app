import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { WebRTCService } from './services/webrtc';
import { RoomLobby } from './components/RoomLobby';
import './App.css';

function App() {
  const [roomId, setRoomId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  const socketRef = useRef(null);
  const webrtcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());

  // Initialize socket
  useEffect(() => {
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
    socketRef.current = io(BACKEND_URL);

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to signaling server');
    });

    socketRef.current.on('peers-in-room', async (peerIds) => {
      console.log('📍 Peers in room:', peerIds);
      setPeers(peerIds);

      // Initiate calls to all existing peers
      for (const peerId of peerIds) {
        await webrtcRef.current.initiateCall(peerId);
      }
    });

    socketRef.current.on('new-peer', async (data) => {
      console.log('👤 New peer joined:', data.peerId);
      setPeers(prev => [...prev, data.peerId]);
    });

    socketRef.current.on('offer', async (data) => {
      await webrtcRef.current.handleOffer(data.from, data.offer);
    });

    socketRef.current.on('answer', async (data) => {
      await webrtcRef.current.handleAnswer(data.from, data.answer);
    });

    socketRef.current.on('ice-candidate', async (data) => {
      await webrtcRef.current.handleIceCandidate(data.from, data.candidate);
    });

    socketRef.current.on('peer-disconnected', (data) => {
      console.log('❌ Peer disconnected:', data.peerId);
      setPeers(prev => prev.filter(id => id !== data.peerId));
      setRemoteStreams(prev => {
        const updated = new Map(prev);
        updated.delete(data.peerId);
        return updated;
      });
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Initialize WebRTC service
  useEffect(() => {
    webrtcRef.current = new WebRTCService(socketRef.current);

    webrtcRef.current.onRemoteStream = (peerId, stream) => {
      console.log('📹 Remote stream from:', peerId);
      setRemoteStreams(prev => new Map(prev).set(peerId, stream));

      if (remoteVideoRefs.current.has(peerId)) {
        remoteVideoRefs.current.get(peerId).srcObject = stream;
      }
    };

    webrtcRef.current.onPeerDisconnected = (peerId) => {
      setPeers(prev => prev.filter(id => id !== peerId));
      setRemoteStreams(prev => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });
    };
  }, []);

  const handleJoinRoom = async (newRoomId) => {
    try {
      // Get screen stream
      const localStream = await webrtcRef.current.getLocalStream(true, false);
      localVideoRef.current.srcObject = localStream;

      // Join room
      socketRef.current.emit('join-room', newRoomId);
      socketRef.current.emit('start-streaming', newRoomId);

      setRoomId(newRoomId);
      setJoined(true);
    } catch (err) {
      alert('Could not access screen: ' + err.message);
    }
  };

  const handleLeaveRoom = () => {
    if (roomId) {
      socketRef.current.emit('stop-streaming', roomId);
    }
    webrtcRef.current.closeAllConnections();
    setJoined(false);
    setRoomId(null);
    setPeers([]);
    setRemoteStreams(new Map());
  };

  if (!joined) {
    return (
      <RoomLobby
        socket={socketRef.current}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  return (
    <div className="app">
      <h1>🎥 4K Streaming Room</h1>

      <div className="stream-container">
        <div className="video-grid">
          <div className="video-wrapper local">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="video"
            />
            <div className="video-label">You (Sharing)</div>
          </div>

          {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
            <div key={peerId} className="video-wrapper remote">
              <video
                ref={(el) => {
                  if (el) remoteVideoRefs.current.set(peerId, el);
                }}
                autoPlay
                playsInline
                className="video"
              />
              <div className="video-label">Peer: {peerId.slice(0, 8)}</div>
            </div>
          ))}
        </div>

        <div className="room-info">
          <p>📍 Room: <strong>{roomId}</strong></p>
          <p>👥 Viewers: <strong>{peers.length}</strong></p>
          <p>📹 Active Streams: <strong>{remoteStreams.size}</strong></p>
        </div>

        <div className="action-buttons">
          <button className="leave-btn" onClick={handleLeaveRoom}>
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
