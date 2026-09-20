const https = require("https");
const crypto = require("crypto");

/**
 * 🛰️ Realtime Hybrid Broadcaster
 * Seamlessly supports both persistent server hosting (Socket.IO)
 * and serverless hosting (Vercel, AWS Lambda) via Pusher Channels.
 */

const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
const PUSHER_KEY = process.env.PUSHER_KEY || process.env.EXPO_PUBLIC_PUSHER_KEY;
const PUSHER_SECRET = process.env.PUSHER_SECRET;
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || process.env.EXPO_PUBLIC_PUSHER_CLUSTER || "ap2";

/**
 * Clean channel name for Pusher compliance [a-zA-Z0-9_\-=@,.;]
 */
function sanitizeChannelName(name) {
  if (!name) return "global";
  return String(name).trim().replace(/[^a-zA-Z0-9_\-=@,.;]/g, "_");
}

/**
 * Triggers a real-time event to Pusher over lightweight HTTPS without external npm dependencies.
 */
async function triggerPusherEvent(channel, event, data) {
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      const cleanChannel = sanitizeChannelName(channel);
      const payloadString = typeof data === "string" ? data : JSON.stringify(data);
      const postBody = JSON.stringify({
        name: event,
        channels: [cleanChannel],
        data: payloadString,
      });

      const bodyMd5 = crypto.createHash("md5").update(postBody, "utf8").digest("hex");
      const authTimestamp = Math.floor(Date.now() / 1000);
      const path = `/apps/${PUSHER_APP_ID}/events`;
      const query = `auth_key=${PUSHER_KEY}&auth_timestamp=${authTimestamp}&auth_version=1.0&body_md5=${bodyMd5}`;
      const signString = `POST\n${path}\n${query}`;
      const authSignature = crypto.createHmac("sha256", PUSHER_SECRET).update(signString).digest("hex");

      const requestPath = `${path}?${query}&auth_signature=${authSignature}`;
      const host = `api-${PUSHER_CLUSTER}.pusher.com`;

      const req = https.request(
        {
          host,
          port: 443,
          path: requestPath,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postBody),
          },
          timeout: 3500,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        }
      );

      req.on("error", (err) => {
        console.warn(`[HybridBroadcaster] Pusher error for "${event}":`, err.message);
        resolve(false);
      });

      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });

      req.write(postBody);
      req.end();
    } catch (e) {
      console.warn(`[HybridBroadcaster] Pusher trigger exception:`, e.message);
      resolve(false);
    }
  });
}

/**
 * Creates a dual-compatible broadcaster object that wraps Socket.IO
 * and mirrors events to Pusher for serverless runtime.
 */
function createHybridBroadcaster(socketIo) {
  return {
    to: (room) => ({
      emit: (event, payload) => {
        // 1. Emit to Socket.IO if in stateful server mode
        try {
          if (socketIo && typeof socketIo.to === "function") {
            socketIo.to(room).emit(event, payload);
          }
        } catch {}

        // 2. Dual-broadcast to Pusher channel for serverless clients
        if (room) {
          triggerPusherEvent(room, event, payload);
        }
      },
    }),
    emit: (event, payload) => {
      try {
        if (socketIo && typeof socketIo.emit === "function") {
          socketIo.emit(event, payload);
        }
      } catch {}
      triggerPusherEvent("global", event, payload);
    },
    // Retain full underlying Socket.IO methods
    on: (...args) => socketIo && socketIo.on && socketIo.on(...args),
    use: (...args) => socketIo && socketIo.use && socketIo.use(...args),
    sockets: socketIo ? socketIo.sockets : null,
  };
}

module.exports = {
  triggerPusherEvent,
  createHybridBroadcaster,
};
