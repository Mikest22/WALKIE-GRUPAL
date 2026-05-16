const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { ExpressPeerServer } = require("peer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const peerServer = ExpressPeerServer(server, {
  path: "/peerjs"
});

app.use("/peerjs", peerServer);

let rooms = {};

io.on("connection", socket => {
  socket.on("join-room", ({ room, peerId, name }) => {
    socket.join(room);

    if (!rooms[room]) rooms[room] = [];

    socket.emit("existing-users", rooms[room]);

    rooms[room].push({
      socketId: socket.id,
      peerId,
      name
    });

    socket.to(room).emit("user-connected", {
      peerId,
      name
    });

    socket.on("disconnect", () => {
      rooms[room] = rooms[room].filter(user => user.socketId !== socket.id);
      socket.to(room).emit("user-disconnected", peerId);
    });
  });
});

server.listen(PORT, () => {
  console.log("Servidor iniciado en puerto " + PORT);
});