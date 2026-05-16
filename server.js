const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { ExpressPeerServer } = require("peer");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const peerServer = ExpressPeerServer(server, {
  path: "/"
});

app.use("/peerjs", peerServer);

const rooms = {};

io.on("connection", socket => {
  socket.on("join-room", data => {
    const { room, peerId, name, deviceId } = data;

    socket.join(room);
    socket.data.room = room;
    socket.data.peerId = peerId;
    socket.data.name = name;

    if (!rooms[room]) rooms[room] = [];

    socket.emit("users-in-room", rooms[room]);

    rooms[room].push({
      socketId: socket.id,
      peerId,
      name,
      deviceId
    });

    socket.to(room).emit("user-joined", {
      peerId,
      name,
      deviceId
    });
  });

  socket.on("talking-start", data => {
    socket.to(data.room).emit("user-talking", {
      name: data.name
    });
  });

  socket.on("talking-stop", data => {
    socket.to(data.room).emit("user-stopped-talking", {
      name: data.name
    });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    const peerId = socket.data.peerId;

    if (!room || !rooms[room]) return;

    rooms[room] = rooms[room].filter(u => u.socketId !== socket.id);

    socket.to(room).emit("user-left", peerId);
  });
});

server.listen(PORT, () => {
  console.log("Servidor listo en puerto " + PORT);
});