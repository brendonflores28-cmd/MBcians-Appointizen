import { io } from 'socket.io-client';
import { APP_CONFIG } from '../config.js';

let socketInstance = null;

export function connectSocket(token, handlers = {}) {
  if (socketInstance) {
    socketInstance.disconnect();
  }

  socketInstance = io(APP_CONFIG.SOCKET_URL || undefined, {
    transports: ['websocket', 'polling'],
    timeout: 10000,
    reconnection: true,
    reconnectionAttempts: 10,
    auth: {
      token,
    },
  });

  Object.entries(handlers).forEach(([eventName, handler]) => {
    socketInstance.on(eventName, handler);
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
