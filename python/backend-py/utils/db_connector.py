"""
🔌 Database Connector (v2.2 – Optimised Multi-Tenant)
Python equivalent of utils/dbConnector.js using Motor (async MongoDB driver).

Key design:
  • get_main_connection() – singleton Motor client pointed at mainDatabase
  • get_tenant_connection() – per-tenant Motor AsyncIOMotorDatabase, cached + idle-evicted
  • Idle reaper runs via APScheduler BackgroundScheduler (threading) every 5 minutes
"""

import os
import time
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "")

# ── Connection options (mirrors SHARED_OPTS in dbConnector.js) ─────────────────
SHARED_OPTS = {
    "maxPoolSize": 8,
    "minPoolSize": 2,
    "serverSelectionTimeoutMS": 5000,
    "socketTimeoutMS": 30_000,
    "connectTimeoutMS": 10_000,
    "heartbeatFrequencyMS": 20_000,
}

# ── Connection registry ────────────────────────────────────────────────────────
# { dbName: { "client": AsyncIOMotorClient, "db": AsyncIOMotorDatabase, "lastUsed": float } }
_tenant_connections: dict = {}

IDLE_CLOSE_SECONDS = 30 * 60  # 30 minutes

# ── Main connection (singleton) ────────────────────────────────────────────────
_main_client: AsyncIOMotorClient | None = None
_main_db = None


def _build_uri(db_name: str) -> str:
    """Swap database name in the MONGO_URI."""
    import re
    if not MONGO_URI:
        raise RuntimeError("MONGO_URI not set in environment")
    return re.sub(r"/[^/?]+(?=\?|$)", f"/{db_name}", MONGO_URI)


class DBConnector:
    def __init__(self):
        self._scheduler = BackgroundScheduler()
        self._scheduler.add_job(
            self._sync_reap_idle_connections,
            "interval",
            minutes=5,
            id="idle_reaper",
        )
        self._scheduler.start()

    def _sync_reap_idle_connections(self):
        """Runs in BackgroundScheduler thread — closes idle tenant connections."""
        now = time.time()
        stale = [k for k, v in _tenant_connections.items()
                 if now - v["lastUsed"] > IDLE_CLOSE_SECONDS]
        for db_name in stale:
            entry = _tenant_connections.pop(db_name, None)
            if entry:
                try:
                    entry["client"].close()
                    print(f"[dbConnector] Closed idle tenant connection: {db_name}")
                except Exception:
                    pass

    # ── Main Connection ────────────────────────────────────────────────────────
    async def get_main_connection(self):
        """Returns the Motor AsyncIOMotorDatabase for mainDatabase (singleton)."""
        global _main_client, _main_db
        if _main_db is not None:
            return _main_db

        uri = _build_uri("mainDatabase")
        _main_client = AsyncIOMotorClient(uri, **SHARED_OPTS)
        _main_db = _main_client["mainDatabase"]
        # Ping to verify connection
        await _main_client.admin.command("ping")
        return _main_db

    # ── Tenant Connection ──────────────────────────────────────────────────────
    async def get_tenant_connection(self, db_name: str):
        """Returns a Motor AsyncIOMotorDatabase for the given tenant db_name."""
        entry = _tenant_connections.get(db_name)
        if entry:
            # Simple liveness check: Motor keeps its own pool
            entry["lastUsed"] = time.time()
            return entry["db"]

        uri = _build_uri(db_name)
        client = AsyncIOMotorClient(uri, **SHARED_OPTS)
        db = client[db_name]
        # Verify
        await client.admin.command("ping")
        _tenant_connections[db_name] = {
            "client": client,
            "db": db,
            "lastUsed": time.time(),
        }
        return db

    def active_connections(self) -> int:
        return len(_tenant_connections)


db_connector = DBConnector()
