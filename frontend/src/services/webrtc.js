// ICE servers for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

export class WebRTCService {
  constructor(socket) {
    this.socket = socket;
    this.peerConnections = new Map(); // Map of peerId -> RTCPeerConnection
    this.localStream = null;
    this.onRemoteStream = null;
    this.onPeerDisconnected = null;
  }

  // Get local media stream
  async getLocalStream(video = true, audio = true) {
    try {
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        ideo: { cursor: 'always', displaySurface: 'monitor' },
        audio: false
    });
      console.log('✅ Local stream acquired');
      return this.localStream;
    } catch (err) {
      console.error('❌ Error getting media devices:', err);
      throw err;
    }
  }

  // Create peer connection for a specific peer
  createPeerConnection(peerId) {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`❄️  ICE candidate for ${peerId}`);
        this.socket.emit('ice-candidate', {
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`📹 Remote track received from ${peerId}`);
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, event.streams[0]);
      }
    };

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${peerId}: ${peerConnection.connectionState}`);
      if (peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed') {
        this.peerConnections.delete(peerId);
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(peerId);
        }
      }
    };

    this.peerConnections.set(peerId, peerConnection);
    return peerConnection;
  }

  // Initiate call (create offer)
  async initiateCall(peerId) {
    console.log(`📞 Initiating call with ${peerId}`);

    if (this.peerConnections.has(peerId)) {
      console.warn(`⚠️  Already connected to ${peerId}`);
      return;
    }

    const peerConnection = this.createPeerConnection(peerId);

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await peerConnection.setLocalDescription(offer);
      console.log(`📤 Sending offer to ${peerId}`);

      this.socket.emit('offer', {
        to: peerId,
        offer: offer
      });
    } catch (err) {
      console.error('❌ Error creating offer:', err);
      this.peerConnections.delete(peerId);
    }
  }

  // Handle incoming offer
  async handleOffer(peerId, offer) {
    console.log(`📥 Received offer from ${peerId}`);

    if (this.peerConnections.has(peerId)) {
      console.warn(`⚠️  Already connected to ${peerId}`);
      return;
    }

    const peerConnection = this.createPeerConnection(peerId);

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await peerConnection.setLocalDescription(answer);
      console.log(`📨 Sending answer to ${peerId}`);

      this.socket.emit('answer', {
        to: peerId,
        answer: answer
      });
    } catch (err) {
      console.error('❌ Error handling offer:', err);
      this.peerConnections.delete(peerId);
    }
  }

  // Handle incoming answer
  async handleAnswer(peerId, answer) {
    console.log(`✅ Received answer from ${peerId}`);

    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      console.error(`❌ No peer connection for ${peerId}`);
      return;
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`🔗 Connection established with ${peerId}`);
    } catch (err) {
      console.error('❌ Error setting remote description:', err);
    }
  }

  // Handle incoming ICE candidate
  async handleIceCandidate(peerId, candidate) {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      console.error(`❌ No peer connection for ${peerId}`);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`❌ Error adding ICE candidate from ${peerId}:`, err);
    }
  }

  // Close peer connection
  closePeerConnection(peerId) {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
      console.log(`🚪 Closed connection with ${peerId}`);
    }
  }

  // Close all connections
  closeAllConnections() {
    for (const [peerId, pc] of this.peerConnections.entries()) {
      pc.close();
    }
    this.peerConnections.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    console.log('🛑 All connections closed');
  }
}
