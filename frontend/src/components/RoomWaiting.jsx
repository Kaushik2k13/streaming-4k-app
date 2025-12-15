import './RoomWaiting.css';

export function RoomWaiting({ roomId, onStartShare, socket, peerCount }) {
  return (
    <div className="waiting-screen">
      <div className="waiting-content">
        <h2>👋 Welcome to {roomId}</h2>
        <p>Ready to share your screen?</p>

        <div className="action-section">
          <button className="btn btn-primary" onClick={onStartShare}>
            🎬 Start Sharing Screen
          </button>
        </div>

        <div className="info-section">
          <p>👥 Peers: {peerCount}</p>
          <p>📡 {socket?.connected ? '✅ Connected' : '❌ Disconnected'}</p>
        </div>
      </div>
    </div>
  );
}