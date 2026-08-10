import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initCronJobs } from "./services/cronService.js";
import { isOriginAllowed } from "./utils/corsOrigins.js";
import { verifyAccessToken } from "./utils/tokens.js";
import { Hostel } from "./models/index.js";

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

// Require a valid access token to connect. Socket sessions are scoped to the
// authenticated user — no unauthenticated socket can join a hostel room.
io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.slice(7)
        : null);

    if (!token) return next(new Error("Authentication required"));

    const decoded = verifyAccessToken(token);
    const userId = decoded.userId || decoded.sub;
    if (
      !userId ||
      !decoded.role ||
      !["owner", "tenant"].includes(decoded.role) ||
      !decoded.ownerId
    ) {
      return next(new Error("Invalid token"));
    }

    socket.user = {
      id: userId,
      role: decoded.role,
      email: decoded.email,
      ownerId: decoded.ownerId,
      hostelId: decoded.hostelId,
      tokenExp: decoded.exp,
      token,
    };
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

// Setup Socket channels based on hostelId
io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on("join_hostel", async (hostelId) => {
    // Only allow a socket to join a hostel it is actually scoped to.
    if (!hostelId || !mongoose.isValidObjectId(hostelId)) return;

    const user = socket.user;
    if (!user) return;

    // Re-verify the access token is still valid before joining — the handshake
    // may have happened long ago and the token could have since expired or been
    // signed out. Reject silently (no error emitted) if it is no longer valid.
    if (user.token) {
      try {
        verifyAccessToken(user.token);
      } catch {
        return;
      }
    } else if (user.tokenExp && user.tokenExp * 1000 <= Date.now()) {
      return;
    }

    let allowed = false;
    if (user.role === "owner") {
      allowed = !!(await Hostel.exists({ _id: hostelId, ownerId: user.ownerId, isActive: true }));
    } else if (user.role === "tenant") {
      allowed = !!user.hostelId && String(user.hostelId) === String(hostelId);
    }
    if (!allowed) return;

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

// Start listening on PORT immediately so Railway / cloud provider healthchecks pass
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  connectDB()
    .then(() => {
      initCronJobs();
    })
    .catch((err) => {
      console.error("Failed to connect to MongoDB:", err);
    });
});
