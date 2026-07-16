import React, { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { getSocketOrigin } from "../config/api.js";

const SocketContext = createContext();

let globalSocket = null;

function getOrCreateSocket(origin) {
  if (!globalSocket) {
    globalSocket = io(origin, {
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      transports: ["websocket", "polling"],
    });
  }
  return globalSocket;
}


export const SocketProvider = ({ children }) => {
  const { user, loading } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (loading) return undefined;

    const hostelId = user?.hostelId;
    if (!hostelId) {
      if (globalSocket) {
        globalSocket.removeAllListeners();
        globalSocket.disconnect();
        globalSocket = null;
      }
      setSocket(null);
      return undefined;
    }

    const origin = getSocketOrigin();
    if (!origin) {
      console.warn("[Hostel Manager] Cannot connect socket: empty origin. Set VITE_API_URL.");
      setSocket(null);
      return undefined;
    }

    const s = getOrCreateSocket(origin);

    const onConnect = () => {
      s.emit("join_hostel", hostelId);
    };

    s.on("connect", onConnect);
    if (!s.connected) s.connect();
    else onConnect();

    setSocket(s);

    return () => {
      s.off("connect", onConnect);
    };
  }, [user?.hostelId, loading]);

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
