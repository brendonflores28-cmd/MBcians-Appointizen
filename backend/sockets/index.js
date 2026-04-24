const { Server } = require('socket.io');
const { isAllowedOrigin, parseAllowedOrigins } = require('../utils/runtime');
const { verifyAuthToken } = require('../utils/jwt');

let io = null;

function initSocketServer(server) {
  const allowedOrigins = parseAllowedOrigins();

  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }

        callback(new Error('Socket origin not allowed.'));
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication token missing.'));
      }

      socket.user = verifyAuthToken(token);
      return next();
    } catch (error) {
      return next(new Error('Authentication failed.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.sub;
    const role = socket.user?.role;

    if (userId) {
      socket.join(`user:${userId}`);
    }

    if (role) {
      socket.join(`role:${role}`);
    }

    socket.on('notifications:markRead', (notificationId) => {
      socket.emit('notifications:read', { notificationId });
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = {
  initSocketServer,
  getIO,
};
