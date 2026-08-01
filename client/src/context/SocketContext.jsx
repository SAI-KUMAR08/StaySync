import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { getSocketOrigin } from "../config/api.js";

const SocketContext = createContext();

let globalSocket = null;
// Guards concurrent lazy init: the module-level import is async, so two effects
// (e.g. React StrictMode double-invoke) share one pending init instead of
// creating two io() instances.
let globalSocketInit = null;

async function getOrCreateSocket(origin) {
  if (!globalSocket) {
    if (!globalSocketInit) {
      globalSocketInit = import("socket.io-client").then(({ io }) => {
        globalSocket = io(origin, {
          // Send the current access token on every (re)connect attempt so the server
          // can authenticate the socket. Re-read each time to pick up refreshed tokens.
          auth: (cb) => cb({ token: localStorage.getItem("token") || "" }),
          withCredentials: true,
          autoConnect: false,
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 1500,
          reconnectionDelayMax: 8000,
          // Vercel serverless doesn't support WebSocket — use polling as primary, fallback to WS only locally
          transports: window.location.hostname.includes("vercel.app")
            ? ["polling"]
            : ["websocket", "polling"],
        });
        return globalSocket;
      });
    }
    await globalSocketInit;
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
      globalSocketInit = null;
      setSocket(null);
      return undefined;
    }

    const origin = getSocketOrigin();
    if (!origin) {
      console.warn("[Hostel Manager] Cannot connect socket: empty origin. Set VITE_API_URL.");
      setSocket(null);
      return undefined;
    }

    let s = null;
    let disposed = false;

    // Provider-managed listeners — every one registered here is removed in the
    // cleanup below so a torn-down effect never leaves stale handlers on a
    // reused global socket.
    const onConnect = () => {
      s.emit("join_hostel", hostelId);
    };
    const onConnectError = (err) => {
      // Auth rejection / network failure. socket.io keeps retrying (up to
      // reconnectionAttempts) and each attempt re-reads the latest token, so a
      // mid-session refresh heals itself on the next attempt.
      console.warn("[Hostel Manager] Socket connection error:", err?.message);
    };
    const onDisconnect = (reason) => {
      console.log(`[Hostel Manager] Socket disconnected: ${reason}`);
    };

    // socket.io-client is lazy-loaded so it lands in its own chunk, fetched
    // only once a logged-in user has a hostelId.
    getOrCreateSocket(origin).then((socket) => {
      if (disposed) return;
      s = socket;
      s.on("connect", onConnect);
      s.on("connect_error", onConnectError);
      s.on("disconnect", onDisconnect);
      if (!s.connected) s.connect();
      else onConnect();
      setSocket(s);
    });

    return () => {
      disposed = true;
      // Remove exactly the listeners this effect registered.
      if (s) {
        s.off("connect", onConnect);
        s.off("connect_error", onConnectError);
        s.off("disconnect", onDisconnect);
      }
    };
  }, [user?.hostelId, loading]);

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
