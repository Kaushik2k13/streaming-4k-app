import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { WebRTCService } from './services/webrtc';
import './App.css';

function App() {
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  const socketRef = useRef(null);
  const webrtcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());

  // Initialize socket and WebRTC
  useEffect(() => {
    socketRef.current = io('http://localhost:3000');

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
      // New peer will initiate call to us
    });

    socketRef.current.on('offer', async (data) => {
      console.log('📥 Offer from:', data.from);
      await webrtcRef.current.handleOffer(data.from, data.offer);
    });

    socketRef.current.on('answer', async (data) => {
      console.log('✅ Answer from:', data.from);
      await webrtcRef.current.handleAnswer(data.from, data.answer);
    });

    socketRef.current.on('ice-candidate', async (data) => {
      console.log('❄️  ICE candidate from:', data.from);
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
      console.log('🚪 Peer disconnected:', peerId);
      setPeers(prev => prev.filter(id => id !== peerId));
      setRemoteStreams(prev => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });
    };
  }, []);

  const handleJoinRoom = async () => {
    if (!roomId.trim()) {
      alert('Please enter a room ID');
      return;
    }

    try {
      // Get local stream
      const localStream = await webrtcRef.current.getLocalStream(true, true);
      localVideoRef.current.srcObject = localStream;

      // Join room
      socketRef.current.emit('join-room', roomId);
      setJoined(true);
    } catch (err) {
      alert('Could not access camera/mic: ' + err.message);
    }
  };

  const handleLeaveRoom = () => {
    webrtcRef.current.closeAllConnections();
    setJoined(false);
    setPeers([]);
    setRemoteStreams(new Map());
  };

  return (
    <div className="app">
      <h1>🎥 4K Streaming App</h1>

      {!joined ? (
        <div className="join-container">
          <div className="join-section">
            <input
              type="text"
              placeholder="Enter room ID (e.g., room1)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
            />
            <button onClick={handleJoinRoom}>Join Room</button>
          </div>
        </div>
      ) : (
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
              <div className="video-label">You (Local)</div>
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
            <p>👥 Peers: <strong>{peers.length}</strong></p>
            <p>📹 Active Streams: <strong>{remoteStreams.size}</strong></p>
          </div>

          <button className="leave-btn" onClick={handleLeaveRoom}>
            Leave Room
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
