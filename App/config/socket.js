const { Server } = require('socket.io');

let io;
// userId (string) -> socketId
const userSockets = new Map();

function init(httpServer) {
  io = new Server(httpServer);

  io.on('connection', (socket) => {
    socket.on('register', (userId) => {
      userSockets.set(String(userId), socket.id);
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
