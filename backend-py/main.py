# Enforce Indian Standard Time
import os
import sys

# Force UTF-8 output on Windows (avoids UnicodeEncodeError for emoji in logs)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

os.environ.setdefault("TZ", "Asia/Kolkata")

from dotenv import load_dotenv
load_dotenv()

import asyncio
import socketio
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from routes.auth_router import router as auth_router
from routes.setting_router import router as setting_router
from routes.user_corp_router import router as user_corp_router
from routes.finance_router import router as finance_router
from routes.payment_router import router as payment_router
from routes.staff_router import router as staff_router
from routes.monitoring_router import router as monitoring_router
from routes.upload_router import router as upload_router
from utils.db_connector import db_connector
from utils.realtime_broadcaster import create_hybrid_broadcaster

# ---------- Rate Limiter ----------
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

# ---------- FastAPI App ----------
app = FastAPI(title="Nex API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Gzip Compression ----------
app.add_middleware(GZipMiddleware, minimum_size=512)

# ---------- Static Files ----------
uploads_path = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_path, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")

# ---------- Request Logging (dev only) ----------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    if os.getenv("NODE_ENV") != "production":
        print(f"[{__import__('datetime').datetime.now().isoformat()}] {request.method} {request.url.path}")
        if request.headers.get("x-tenant-id"):
            print(f"   └─ x-tenant-id: {request.headers['x-tenant-id']}")
    return await call_next(request)

# ---------- Socket.IO Setup ----------
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    compression=True,
    ping_timeout=30000,
    ping_interval=25000,
    transports=["websocket", "polling"],
)
hybrid_io = create_hybrid_broadcaster(sio)

# Attach io to app state
app.state.io = hybrid_io

@sio.event
async def connect(sid, environ):
    pass

@sio.event
async def joinRoom(sid, db_name):
    if db_name:
        await sio.enter_room(sid, db_name)

@sio.event
async def attendance_get_active(sid, data):
    """🚀 Instant DB read over Socket for active attendance"""
    from models.worker_location import get_worker_location_model
    from utils.db_connector import db_connector
    from bson import ObjectId
    import pymongo

    try:
        employee_id = data.get("employeeId") if data else None
        db_name = data.get("dbName") if data else None

        if not employee_id or not db_name:
            err = {"success": False, "message": "employeeId and dbName required"}
            await sio.emit("attendance:active_response", err, to=sid)
            return

        tenant_conn = await db_connector.get_tenant_connection(db_name)
        from models.tenant_models import get_tenant_models
        models = get_tenant_models(tenant_conn)

        query_id = ObjectId(employee_id) if ObjectId.is_valid(employee_id) else employee_id

        active = await models["Attendance"].find_one({
            "employeeId": {"$in": [query_id]},
            "status": "Present",
            "$or": [{"dutyEnd": {"$exists": False}}, {"dutyEnd": None}]
        }, sort=[("dutyStart", -1)])

        if active:
            active["_id"] = str(active["_id"])

        result = {"success": True, "employeeId": employee_id, "data": active}
        await sio.emit("attendance:active_response", result, to=sid)
    except Exception as e:
        print(f"❌ Socket attendance:get_active error: {e}")
        err = {"success": False, "message": str(e)}
        await sio.emit("attendance:active_response", err, to=sid)

@sio.event
async def attendance_get_active_staff(sid, data):
    """Get all active staff attendance"""
    try:
        db_name = data.get("dbName") if data else None
        if not db_name:
            err = {"success": False, "message": "dbName required"}
            await sio.emit("attendance:active_staff_response", err, to=sid)
            return

        tenant_conn = await db_connector.get_tenant_connection(db_name)
        from models.tenant_models import get_tenant_models
        models = get_tenant_models(tenant_conn)

        cursor = models["Attendance"].find({
            "$or": [{"dutyEnd": {"$exists": False}}, {"dutyEnd": None}]
        })
        active = await cursor.to_list(length=None)
        for a in active:
            a["_id"] = str(a["_id"])

        result = {"success": True, "data": active}
        await sio.emit("attendance:active_staff_response", result, to=sid)
    except Exception as e:
        err = {"success": False, "message": str(e)}
        await sio.emit("attendance:active_staff_response", err, to=sid)

# Socket last update tracker per socket
_last_location_update: dict = {}

@sio.event
async def update_location(sid, data):
    """🚀 High-performance real-time worker location tracking"""
    import time
    from utils.db_connector import db_connector

    try:
        worker_id = data.get("workerId") if data else None
        latitude = data.get("latitude")
        longitude = data.get("longitude")
        battery_level = data.get("batteryLevel")
        speed = data.get("speed")
        heading = data.get("heading")
        accuracy = data.get("accuracy")
        timestamp = data.get("timestamp")

        if not worker_id or latitude is None or longitude is None:
            await sio.emit("error", {"success": False, "message": "Valid workerId, latitude, and longitude required"}, to=sid)
            return

        # Rate-limit location updates to once per 3 seconds
        now = time.time() * 1000
        last = _last_location_update.get(sid, 0)
        if now - last < 3000:
            await sio.emit("update_location_ack", {"success": True, "throttled": True}, to=sid)
            return
        _last_location_update[sid] = now

        num_lat = float(latitude)
        num_lng = float(longitude)

        main_conn = await db_connector.get_main_connection()
        from models.worker_location import get_worker_location_model
        WorkerLocation = get_worker_location_model(main_conn)

        from datetime import datetime
        last_updated = datetime.fromisoformat(timestamp) if timestamp else datetime.now()

        updated = await WorkerLocation.find_one_and_update(
            {"workerId": str(worker_id)},
            {"$set": {
                "location": {"type": "Point", "coordinates": [num_lng, num_lat]},
                "batteryLevel": float(battery_level) if battery_level is not None else None,
                "speed": float(speed) if speed is not None else None,
                "heading": float(heading) if heading is not None else None,
                "accuracy": float(accuracy) if accuracy is not None else None,
                "lastUpdated": last_updated,
            }},
            upsert=True,
            return_document=True
        )

        payload = {
            "workerId": str(worker_id),
            "latitude": num_lat,
            "longitude": num_lng,
            "batteryLevel": updated.get("batteryLevel") if updated else None,
            "speed": updated.get("speed") if updated else None,
            "heading": updated.get("heading") if updated else None,
            "accuracy": updated.get("accuracy") if updated else None,
            "lastUpdated": str(updated.get("lastUpdated")) if updated else None,
        }

        await sio.emit("live_location_update", payload, skip_sid=sid)
        await sio.emit("update_location_ack", {"success": True, "data": payload}, to=sid)
    except Exception as e:
        print(f"❌ Socket update_location error: {e}")
        await sio.emit("update_location_ack", {"success": False, "message": str(e)}, to=sid)

@sio.event
async def check_geofence(sid, data):
    """🛡️ Ultra-fast geofence verification"""
    try:
        worker_id = data.get("workerId") if data else None
        site_lng = data.get("siteLongitude")
        site_lat = data.get("siteLatitude")
        radius = float(data.get("radiusMeters", 200))

        if not worker_id or site_lng is None or site_lat is None:
            err = {"success": False, "message": "workerId, siteLongitude, and siteLatitude required"}
            await sio.emit("geofence_status", err, to=sid)
            return

        main_conn = await db_connector.get_main_connection()
        from models.worker_location import get_worker_location_model
        WorkerLocation = get_worker_location_model(main_conn)

        earth_radius = 6378100
        radius_radians = radius / earth_radius
        match = await WorkerLocation.find_one({
            "workerId": str(worker_id),
            "location": {
                "$geoWithin": {
                    "$centerSphere": [[float(site_lng), float(site_lat)], radius_radians]
                }
            }
        })

        from datetime import datetime
        result = {
            "success": True,
            "workerId": str(worker_id),
            "inside": match is not None,
            "radiusMeters": radius,
            "checkedAt": datetime.now().isoformat(),
        }
        await sio.emit("geofence_status", result, to=sid)
    except Exception as e:
        print(f"❌ Geofence check error: {e}")
        await sio.emit("geofence_status", {"success": False, "message": str(e)}, to=sid)

@sio.event
async def disconnect(sid):
    _last_location_update.pop(sid, None)
    print(f"🔌 [Socket.IO] Client {sid} disconnected")

# ---------- Routes ----------
app.include_router(auth_router, prefix="/api/auth")
app.include_router(setting_router, prefix="/api/setting")
app.include_router(user_corp_router, prefix="/api/service")
app.include_router(user_corp_router, prefix="/service")
app.include_router(finance_router, prefix="/api/finance")
app.include_router(finance_router, prefix="/finance")
app.include_router(payment_router, prefix="/api/payment")
app.include_router(staff_router, prefix="/api/staff")
app.include_router(monitoring_router, prefix="/api/monitoring")
app.include_router(upload_router, prefix="/api/upload")

# ---------- Health Routes ----------
@app.get("/")
async def root():
    import time
    return JSONResponse({
        "success": True,
        "message": "🚀 Nex API is active",
        "uptime": time.process_time(),
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    })

@app.get("/health")
async def health():
    import time
    return JSONResponse({
        "status": "ok",
        "uptime": int(time.time()),
        "tenantConnections": db_connector.active_connections(),
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    })

# ---------- 404 Handler ----------
@app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"success": False, "message": f"Route {request.url.path} not found"}
    )

# ---------- Global Error Handler ----------
@app.exception_handler(Exception)
async def global_error(request: Request, exc: Exception):
    print(f"🔥 [Error] {exc}")
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": str(exc)}
    )

# ---------- Startup: Connect DB ----------
@app.on_event("startup")
async def startup():
    try:
        await db_connector.get_main_connection()
        print("[OK] Main Database connected")
    except Exception as e:
        print(f"[WARN] Main Database connection failed at startup: {e}")
        print("[INFO] Server will still start - DB will retry on first request")

# ---------- ASGI app with Socket.IO ----------
combined_app = socketio.ASGIApp(sio, other_asgi_app=app)

if __name__ == "__main__":
    PORT = int(os.getenv("PORT", 5001))
    uvicorn.run("main:combined_app", host="0.0.0.0", port=PORT, reload=True)
