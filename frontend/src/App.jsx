import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState([]);
  const socketRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:3000');

    socketRef.current.on('user-joined', (data) => {
      console.log('User joined:', data.userId);
      setPeers(prev => [...prev, data.userId]);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const handleJoinRoom = async () => {
    if (!roomId) {
      alert('Please enter a room ID');
      return;
    }

    // Get user media (video + audio)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 3840 },  // 4K
          height: { ideal: 2160 }
        },
        audio: true
      });

      videoRef.current.srcObject = stream;
      socketRef.current.emit('join-room', roomId);
      setJoined(true);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      alert('Could not access camera/mic');
    }
  };

  return (
    <div className="app">
      <h1>4K Streaming App</h1>
      
      {!joined ? (
        <div className="join-section">
          <input
            type="text"
            placeholder="Enter room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={handleJoinRoom}>Join Room</button>
        </div>
      ) : (
        <div className="stream-section">
          <video ref={videoRef} autoPlay muted style={{ width: '100%' }} />
          <p>Room: {roomId} | Peers: {peers.length}</p>
        </div>
      )}
    </div>
  );
}