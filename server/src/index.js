import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initCronJobs } from "./services/cronService.js";
import { isOriginAllowed } from "./utils/corsOrigins.js";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin));
    },
    credentials: true,
  },
});

// Setup Socket channels based on hostelId
io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on("join_hostel", (hostelId) => {
    for (const room of socket.rooms) {
      if (room.startsWith("hostel_")) {
        socket.leave(room);
        console.log(`🏠 Socket ${socket.id} left ${room}`);
      }
    }
    socket.join(`hostel_${hostelId}`);
    console.log(`🏠 Socket ${socket.id} joined hostel_${hostelId}`);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// Attach io to app so controllers can use it
app.set("io", io);

// Connect to Database
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      initCronJobs();
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });

// Restart nodemon
