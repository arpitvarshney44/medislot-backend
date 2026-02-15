/**
 * WebRTC Signaling & Session Management
 * Uses Socket.IO for real-time signaling between doctor and patient
 */

const activeSessions = new Map(); // sessionId -> { doctor, patient, startTime, status }

const setupWebRTC = (io) => {
    const videoNamespace = io.of('/video');

    videoNamespace.on('connection', (socket) => {
        console.log(`📹 Video socket connected: ${socket.id}`);

        // Join a consultation room
        socket.on('join-room', ({ sessionId, userId, role }) => {
            socket.join(sessionId);
            socket.userId = userId;
            socket.role = role;
            socket.sessionId = sessionId;

            // Track session
            if (!activeSessions.has(sessionId)) {
                activeSessions.set(sessionId, {
                    participants: {},
                    startTime: null,
                    status: 'waiting',
                    createdAt: new Date(),
                });
            }

            const session = activeSessions.get(sessionId);
            session.participants[role] = { userId, socketId: socket.id, joinedAt: new Date() };

            // Notify other participant
            socket.to(sessionId).emit('user-joined', { userId, role });

            // If both participants are in, start the session
            if (session.participants.doctor && session.participants.patient) {
                session.status = 'active';
                session.startTime = new Date();
                videoNamespace.to(sessionId).emit('session-started', {
                    sessionId,
                    startTime: session.startTime,
                });
            }

            console.log(`👤 ${role} joined room ${sessionId}`);
        });

        // WebRTC Signaling: Offer
        socket.on('offer', ({ sessionId, offer }) => {
            socket.to(sessionId).emit('offer', { offer, from: socket.userId });
        });

        // WebRTC Signaling: Answer
        socket.on('answer', ({ sessionId, answer }) => {
            socket.to(sessionId).emit('answer', { answer, from: socket.userId });
        });

        // WebRTC Signaling: ICE Candidate
        socket.on('ice-candidate', ({ sessionId, candidate }) => {
            socket.to(sessionId).emit('ice-candidate', { candidate, from: socket.userId });
        });

        // Toggle audio/video
        socket.on('media-toggle', ({ sessionId, type, enabled }) => {
            socket.to(sessionId).emit('media-toggle', { userId: socket.userId, type, enabled });
        });

        // In-call chat message
        socket.on('chat-message', ({ sessionId, message }) => {
            videoNamespace.to(sessionId).emit('chat-message', {
                from: socket.userId,
                role: socket.role,
                message,
                timestamp: new Date(),
            });
        });

        // End call
        socket.on('end-call', ({ sessionId }) => {
            const session = activeSessions.get(sessionId);
            if (session) {
                session.status = 'ended';
                session.endTime = new Date();
                session.duration = session.startTime
                    ? Math.round((session.endTime - session.startTime) / 1000)
                    : 0;

                videoNamespace.to(sessionId).emit('call-ended', {
                    sessionId,
                    duration: session.duration,
                    endedBy: socket.role,
                });

                // Cleanup after 30 seconds
                setTimeout(() => activeSessions.delete(sessionId), 30000);
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            if (socket.sessionId) {
                const session = activeSessions.get(socket.sessionId);
                if (session && session.status === 'active') {
                    socket.to(socket.sessionId).emit('user-disconnected', {
                        userId: socket.userId,
                        role: socket.role,
                    });
                }
            }
            console.log(`📹 Video socket disconnected: ${socket.id}`);
        });
    });

    // Session timeout checker (auto-end after configured time)
    const SESSION_TIMEOUT = parseInt(process.env.VIDEO_SESSION_TIMEOUT) || 30 * 60 * 1000; // 30 min default

    setInterval(() => {
        const now = Date.now();
        for (const [sessionId, session] of activeSessions) {
            if (session.status === 'active' && session.startTime) {
                const elapsed = now - session.startTime.getTime();
                if (elapsed >= SESSION_TIMEOUT) {
                    session.status = 'timeout';
                    session.endTime = new Date();
                    session.duration = Math.round(elapsed / 1000);
                    videoNamespace.to(sessionId).emit('session-timeout', {
                        sessionId,
                        duration: session.duration,
                        message: 'Consultation time limit reached',
                    });
                }
            }
            // Cleanup stale waiting sessions (older than 15 min)
            if (session.status === 'waiting' && now - session.createdAt.getTime() > 15 * 60 * 1000) {
                activeSessions.delete(sessionId);
            }
        }
    }, 60000); // Check every minute

    return { activeSessions };
};

const getSessionInfo = (sessionId) => activeSessions.get(sessionId) || null;

module.exports = { setupWebRTC, getSessionInfo };
