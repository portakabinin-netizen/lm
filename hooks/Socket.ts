// hooks/socket.ts
import { io, Socket } from "socket.io-client";
import api_url from "../backend/routes/base_url";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(api_url, {
      autoConnect: true,
      transports: ["websocket"], // Expo Go compatible
    });

    socket.on("connect", () => console.log("✅ Socket connected:", socket?.id));
    socket.on("disconnect", () => console.log("❌ Socket disconnected"));
  }
  return socket;
};
