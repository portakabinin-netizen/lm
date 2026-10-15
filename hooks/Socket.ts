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
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on("connect", () => { console.log(`📡 Connected to socket at ${socketUrl}`); });
    socket.on("connect_error", (err) => { console.warn(`⚠️ Socket connection retry (${socketUrl}): ${err.message}`); });
    socket.on("disconnect", (reason) => { console.log(`🔌 Disconnected from socket: ${reason}`); });
  }
  return socket;
};

export const joinTenantRoom = (dbName: string) => {
  const s = getSocket();
  if (dbName) {
    s.emit("joinRoom", dbName.trim());
  }
};

export const leaveTenantRoom = (dbName: string) => {
  const s = getSocket();
  if (dbName) {
    s.emit("leaveRoom", dbName.trim());
  }
};

export const switchTenantRoom = (
  previousDbName?: string | null,
  newDbName?: string | null,
  corpInfo?: { corporateName?: string | null; corporatePAN?: string | null }
) => {
  const s = getSocket();
  if (previousDbName && previousDbName !== newDbName) {
    s.emit("leaveRoom", previousDbName.trim());
  }
  if (newDbName) {
    s.emit("switch-corporate", {
      dbName: newDbName.trim(),
      previousDbName: previousDbName ? previousDbName.trim() : undefined,
      corporateName: corpInfo?.corporateName ?? undefined,
      corporatePAN: corpInfo?.corporatePAN ?? undefined,
    });
    s.emit("joinRoom", newDbName.trim());
  }
};

