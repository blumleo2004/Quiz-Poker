const { logGameEvent, logError } = require('../utils/logger');

// In-memory storage for sessions (in a real app, use Redis or DB)
const sessions = new Map();

const authMiddleware = (socket, next) => {
    const token = socket.handshake.auth.token;

    if (token && sessions.has(token)) {
        const session = sessions.get(token);
        socket.user = session;
        // Update socket ID in session
        session.socketId = socket.id;
        logGameEvent('PLAYER_RECONNECTED', { socketId: socket.id, name: session.name, token });
        return next();
    }

    // If no token or invalid, we allow connection but they are "guest" until they join
    // The joinGame event will handle creating the session
    next();
};

const createSession = (name, role, socketId) => {
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const session = {
        token,
        name,
        role,
        socketId,
        createdAt: Date.now()
    };
    sessions.set(token, session);
    return session;
};

const getSession = (token) => {
    return sessions.get(token);
}

module.exports = {
    authMiddleware,
    createSession,
    getSession,
    sessions // Exported for debugging/cleanup if needed
};
