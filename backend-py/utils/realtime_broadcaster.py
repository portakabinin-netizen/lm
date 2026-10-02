"""
🛰️ Realtime Hybrid Broadcaster
Python equivalent of utils/realtimeBroadcaster.js
Wraps python-socketio and mirrors events to Pusher Channels via plain HTTPS.
"""

import os
import hashlib
import hmac
import json
import time
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

PUSHER_APP_ID = os.getenv("PUSHER_APP_ID")
PUSHER_KEY = os.getenv("PUSHER_KEY") or os.getenv("EXPO_PUBLIC_PUSHER_KEY")
PUSHER_SECRET = os.getenv("PUSHER_SECRET")
PUSHER_CLUSTER = os.getenv("PUSHER_CLUSTER") or os.getenv("EXPO_PUBLIC_PUSHER_CLUSTER") or "ap2"


def _sanitize_channel(name: str) -> str:
    import re
    if not name:
        return "global"
    return re.sub(r"[^a-zA-Z0-9_\-=@,.;]", "_", str(name).strip())


async def trigger_pusher_event(channel: str, event: str, data) -> bool:
    """Send a real-time event to Pusher over HTTPS (no Pusher SDK dependency)."""
    if not all([PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET]):
        return False

    try:
        clean_channel = _sanitize_channel(channel)
        payload_string = data if isinstance(data, str) else json.dumps(data)
        post_body = json.dumps({
            "name": event,
            "channels": [clean_channel],
            "data": payload_string,
        })

        body_md5 = hashlib.md5(post_body.encode()).hexdigest()
        auth_timestamp = int(time.time())
        path = f"/apps/{PUSHER_APP_ID}/events"
        query = (
            f"auth_key={PUSHER_KEY}"
            f"&auth_timestamp={auth_timestamp}"
            f"&auth_version=1.0"
            f"&body_md5={body_md5}"
        )
        sign_string = f"POST\n{path}\n{query}"
        auth_signature = hmac.new(
            PUSHER_SECRET.encode(), sign_string.encode(), "sha256"
        ).hexdigest()

        request_path = f"{path}?{query}&auth_signature={auth_signature}"
        host = f"api-{PUSHER_CLUSTER}.pusher.com"

        async with httpx.AsyncClient(timeout=3.5) as client:
            resp = await client.post(
                f"https://{host}{request_path}",
                content=post_body.encode(),
                headers={"Content-Type": "application/json"},
            )
            return 200 <= resp.status_code < 300
    except Exception as e:
        print(f"[HybridBroadcaster] Pusher error for '{event}': {e}")
        return False


def create_hybrid_broadcaster(socket_io):
    """
    Returns a dict-like broadcaster that wraps python-socketio and
    mirrors events to Pusher for serverless runtime.
    """

    class HybridBroadcaster:
        def to(self, room: str):
            class RoomEmitter:
                async def emit(self, event: str, payload):
                    try:
                        if socket_io:
                            await socket_io.emit(event, payload, room=room)
                    except Exception:
                        pass
                    if room:
                        asyncio.create_task(trigger_pusher_event(room, event, payload))

            return RoomEmitter()

        async def emit(self, event: str, payload):
            try:
                if socket_io:
                    await socket_io.emit(event, payload)
            except Exception:
                pass
            asyncio.create_task(trigger_pusher_event("global", event, payload))

        def on(self, *args, **kwargs):
            if socket_io and hasattr(socket_io, "on"):
                return socket_io.on(*args, **kwargs)

    return HybridBroadcaster()
