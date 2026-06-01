const { Server } = require('socket.io');

let io;
// userId (string) -> socketId
const userSockets = new Map();

function init(httpServer) {
  io = new Server(httpServer);

  io.on('connection', (socket) => {
    socket.on('register', (userId) => {
      const id = parseInt(userId, 10);
      if (!id || id <= 0) return;
      // Only allow registration if this socket doesn't already own a different userId
      for (const [uid, sid] of userSockets.entries()) {
        if (sid === socket.id && uid !== String(id)) return;
      }
      userSockets.set(String(id), socket.id);
    });

    socket.on('disconnect', () => {
      for (const [uid, sid] of userSockets.entries()) {
        if (sid === socket.id) {
          userSockets.delete(uid);
          break;
        }
      }
    });
  });

  return io;
}

function emitToUser(userId, event, data) {
  const socketId = userSockets.get(String(userId));
  if (socketId && io) {
    io.to(socketId).emit(event, data);
  }
}

module.exports = { init, emitToUser };
