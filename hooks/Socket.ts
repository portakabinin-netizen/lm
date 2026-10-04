// hooks/socket.ts
import { io, Socket } from "socket.io-client";
import api_url from "../backend/routes/base_url";
import { appService } from "@/UtilServices/appHelper";

let socket: Socket | null = null;
let currentSocketUrl: string = '';

export const getSocket = (): Socket => {
  const baseURL = appService.httpClient.defaults.baseURL || api_url;
  const socketUrl = baseURL.replace(/\/api\/?$/, '').replace(/\/$/, '');

  if (!socket || currentSocketUrl !== socketUrl) {
    if (socket) {
      console.log(`🔌 Switching socket from ${currentSocketUrl} to ${socketUrl}`);
      socket.disconnect();
    }
    currentSocketUrl = socketUrl;
    socket = io(socketUrl, {
      autoConnect: true,
      transports: ["polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 60000,
    });

    socket.on("connect", () => { console.log(`📡 Connected to socket at ${socketUrl}`); });
    socket.on("connect_error", (err) => { console.error(`❌ Socket connection error: ${err.message}`); });
    socket.on("disconnect", (reason) => { console.log(`🔌 Disconnected from socket: ${reason}`); });
  }
  return socket;
};

export const joinTenantRoom = (dbName: string) => {
  const s = getSocket();
  if (dbName) {
    s.emit("joinRoom", dbName);
  }
};
