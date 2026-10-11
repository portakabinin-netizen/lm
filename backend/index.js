// Enforce Indian Standard Time (IST) for the entire backend
process.env.TZ = 'Asia/Kolkata';

// Auto-free port 5001 if occupied (silent — no output)
try {
  const { execSync } = require('child_process');
  const m = execSync('netstat -ano').toString().match(/0\.0\.0\.0:5001\s+\S+\s+LISTENING\s+(\d+)/);
  if (m) execSync(`taskkill /PID ${m[1]} /F`);
} catch (e) {}

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const helmet = require("helmet");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();

// ---------- Import Routers (GitLabBackEnd Architecture) ----------
const authRouter = require("./routes/authRouterNew");
const setting = require("./routes/settingRouter");
const uploadRouter = require("./routes/uploadRouter");
const UserCorpRouter = require("./routes/UserCorpRouter");
const FinanceRouter = require("./routes/FinanceRouter");
const dbConnector = require("./utils/dbConnector");
const WorkerLocation = require("./models/WorkerLocation");
const authMiddleware = require("./middleware/authMiddleware");
const tenantMiddleware = require("./middleware/tenantMiddleware");
const UserCorpController = require("./controller/UserCorpController");

const app = express();

// Disable CSP so inline scripts and Socket.io in admin dashboard run smoothly
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------- Real-Time Monitoring State ----------
let liveSocketConnections = 0;
let dbStatusString = "Connecting";
const LOG_BUFFER_SIZE = 200;
const logBuffer = []; // recent logs, replayed to dashboards that open later

// Save exact server startup time
const serverStartedAt = Date.now();
const serverStartTime = new Date(serverStartedAt).toLocaleString('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});

// ---------- Corporate Multi-Tenant State ----------
const KNOWN_CORPORATES = {
  "41414546483437393441": { name: "portakabin.in", pan: "AAEFH4794A" },
  "41455750433838343445": { name: "Resident's HN347", pan: "AEWPC8844E" },
  "41444c50503539303542": { name: "Pratham Services", pan: "ADLPP5905B" },
  "41414443543830373245": { name: "Team Security and HR Solutions Pvt Ltd", pan: "AADCT8072F" },
};

let activeCorporate = {
  dbName: "41414546483437393441",
  name: "portakabin.in",
  pan: "AAEFH4794A"
};

const NAME_TO_DB = {
  "portakabin.in": "41414546483437393441",
  "portakabin": "41414546483437393441",
  "resident's hn347": "41455750433838343445",
  "residents hn347": "41455750433838343445",
  "resident": "41455750433838343445",
  "pratham services": "41444c50503539303542",
  "pratham": "41444c50503539303542",
  "team security and hr solutions pvt ltd": "41414443543830373245",
  "team security and hr solutions": "41414443543830373245",
  "team security": "41414443543830373245",
  "aaefh4794a": "41414546483437393441",
  "aewpc8844e": "41455750433838343445",
  "adlpp5905b": "41444c50503539303542",
  "aadct8072f": "41414443543830373245",
};

function setActiveCorporate(dbName, name = "", pan = "") {
  if (!dbName || typeof dbName !== "string") return;
  const cleanDb = dbName.trim();
  if (cleanDb === "undefined" || cleanDb === "null" || cleanDb === "" || cleanDb === "[object Object]") return;

  const mappedDb = NAME_TO_DB[cleanDb.toLowerCase()] || cleanDb;
  const known = KNOWN_CORPORATES[mappedDb] || KNOWN_CORPORATES[cleanDb];
  const newName = name || known?.name || (cleanDb.includes(" ") ? cleanDb : activeCorporate.name);
  const newPan = pan || known?.pan || activeCorporate.pan;
  const finalDb = known ? mappedDb : cleanDb;

  const changed = activeCorporate.dbName !== finalDb || activeCorporate.name !== newName;
  activeCorporate = {
    dbName: finalDb,
    name: newName,
    pan: newPan
  };
  if (changed && global.ioInstance) {
    global.ioInstance.emit("corporate-update", activeCorporate);
    console.log(`🏢 Active corporate database: ${activeCorporate.name} (${activeCorporate.pan || "N/A"}) [DB: ${activeCorporate.dbName}]`);
  }
}
global.setActiveCorporate = setActiveCorporate;

function setDbStatus(status) {
  dbStatusString = status;
  if (global.ioInstance) {
    global.ioInstance.emit("status-sync", { dbStatus: dbStatusString, corporate: activeCorporate });
  }
}

// ---------- MongoDB Connection with Retry ----------
mongoose.connection.on("connected", () => setDbStatus("Connected"));
mongoose.connection.on("disconnected", () => setDbStatus("Disconnected"));
mongoose.connection.on("reconnected", () => setDbStatus("Connected"));

const connectDB = async () => {
  try {
    await dbConnector.getMainConnection();
    setDbStatus("Connected");
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    setDbStatus("Disconnected");
    console.error("❌ Main Database connection failed. Retrying in 5s...", err.message);
    setTimeout(connectDB, 5000);
  }
};
connectDB();

// ---------- HTTP + Socket.IO + Pusher Hybrid Realtime ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
global.ioInstance = io;

const { createHybridBroadcaster } = require("./utils/realtimeBroadcaster");
const hybridIo = createHybridBroadcaster(io);

app.use((req, res, next) => {
  req.io = hybridIo;
  const tenantId = req.headers["x-tenant-id"] || req.headers["x-db-name"] || req.headers["x-dbname"] || req.query?.dbName;
  if (tenantId && tenantId !== activeCorporate.dbName) {
    setActiveCorporate(tenantId);
  }
  next();
});

// ---------- Console Logging Interceptor ----------
const originalLog = console.log;
const originalError = console.error;

function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch (e) {
      return String(arg);
    }
  }
  return String(arg);
}

function pushLog(type, args) {
  const entry = {
    type,
    time: new Date().toLocaleTimeString("en-IN"),
    message: args.map(formatArg).join(" ")
  };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  if (global.ioInstance) {
    for (const [id, s] of global.ioInstance.sockets.sockets) {
      if (s.isDashboard) {
        s.emit("console-log", entry);
      }
    }
  }
}

console.log = function (...args) {
  originalLog.apply(console, args);
  pushLog("INFO", args);
};

console.error = function (...args) {
  originalError.apply(console, args);
  pushLog("ERROR", args);
};

// ---------- Socket.IO Logics ----------
let activeDashboardSockets = 0;

io.on("connection", (socket) => {
  const jwt = require("jsonwebtoken");
  const token = socket.handshake.query?.token || socket.handshake.auth?.token;
  let isCorpAdmin = false;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_key_hibiz");
      if (decoded && (decoded.userRole === "CorpAdmin" || decoded.role === "CorpAdmin")) {
        isCorpAdmin = true;
        socket.corpAdminUser = decoded;
      }
    } catch (e) {}
  }

  const isDashboard =
    Boolean(socket.handshake && socket.handshake.query && socket.handshake.query.client === 'dashboard') ||
    Boolean(socket.handshake && socket.handshake.headers && socket.handshake.headers.referer && (socket.handshake.headers.referer.includes('serverAdmin') || socket.handshake.headers.referer.includes('admin-dashboard')));

  if (isDashboard) {
    if (!isCorpAdmin) {
      socket.emit("auth-required", { message: "CorpAdmin authentication required" });
      originalLog(`🔒 Dashboard connection rejected for unauthenticated socket: ${socket.id}`);
      return;
    }
    socket.isDashboard = true;
    activeDashboardSockets++;
    originalLog(`🛡️ CorpAdmin Dashboard connected (${socket.corpAdminUser?.userDisplayName || socket.id})`);
  }

  liveSocketConnections++;
  if (socket.isDashboard) {
    socket.emit("init-data", {
      startedAt: serverStartedAt,
      startTime: serverStartTime,
      dbStatus: dbStatusString,
      activeCorporate: activeCorporate,
      liveSockets: liveSocketConnections,
      logs: logBuffer
    });
  }
  io.emit("metrics-update", { liveSockets: liveSocketConnections });

  const clientLabel = socket.isDashboard ? 'CorpAdmin Dashboard' : 'Mobile App / Client';
  originalLog(`⚡ Client connected [${clientLabel}]: ${socket.id}`);

  // Mobile App room subscription by corporate tenant dbName
  socket.on("joinRoom", (dbName) => {
    if (dbName && typeof dbName === "string") {
      socket.join(dbName.trim());
      setActiveCorporate(dbName.trim());
      originalLog(`📡 Client ${socket.id} joined corporate room: ${dbName.trim()}`);
    }
  });

  socket.on("switch-corporate", (data) => {
    if (data?.dbName) {
      setActiveCorporate(data.dbName, data.corporateName, data.corporatePAN);
    }
  });

  socket.on("register-dashboard", () => {
    if (socket.corpAdminUser && !socket.isDashboard) {
      socket.isDashboard = true;
      activeDashboardSockets++;
    }
  });

  // 🚀 INSTANT DB READ OVER SOCKET FOR ACTIVE ATTENDANCE (from GitLabBackEnd)
  socket.on("attendance:get_active", async (data, ack) => {
    try {
      const { employeeId, dbName } = data || {};
      if (!employeeId || !dbName) {
        const errRes = { success: false, message: "employeeId and dbName required" };
        if (typeof ack === "function") ack(errRes);
        return socket.emit("attendance:active_response", errRes);
      }

      const tenantConnection = await dbConnector.getTenantConnection(dbName);
      const { Attendance, Employees } = require("./models/TenantModels").getTenantModels(tenantConnection);

      const queryId = mongoose.Types.ObjectId.isValid(employeeId)
        ? new mongoose.Types.ObjectId(employeeId)
        : employeeId;

      const userMaster = require("./models/userMaster");
      let userDoc = await userMaster.findById(queryId).lean().catch(() => null);
      let employeeDoc = await Employees.findById(queryId).lean().catch(() => null);

      if (userDoc && !employeeDoc) {
        const mob = (userDoc.mobile || userDoc.userMobile || userDoc.username || "").replace(/\D/g, "").slice(-10);
        const searchOr = [];
        if (userDoc._id) searchOr.push({ user_id: userDoc._id });
        if (userDoc.employee_id && mongoose.Types.ObjectId.isValid(String(userDoc.employee_id))) searchOr.push({ _id: userDoc.employee_id });
        if (mob && mob.length === 10) searchOr.push({ mobile: new RegExp(mob + "$") });
        if (userDoc.email || userDoc.userEmail) searchOr.push({ email: userDoc.email || userDoc.userEmail });
        if (searchOr.length > 0) {
          employeeDoc = await Employees.findOne({ $or: searchOr }).lean().catch(() => null);
        }
      } else if (employeeDoc && !userDoc) {
        const mob = (employeeDoc.mobile || "").replace(/\D/g, "").slice(-10);
        const searchOr = [];
        if (employeeDoc.user_id && mongoose.Types.ObjectId.isValid(String(employeeDoc.user_id))) searchOr.push({ _id: employeeDoc.user_id });
        if (employeeDoc._id) searchOr.push({ employee_id: employeeDoc._id });
        if (mob && mob.length === 10) searchOr.push({ userMobile: new RegExp(mob + "$") });
        if (employeeDoc.email) searchOr.push({ userEmail: employeeDoc.email });
        if (searchOr.length > 0) {
          userDoc = await userMaster.findOne({ $or: searchOr }).lean().catch(() => null);
        }
      }

      const linkedIds = [queryId];
      if (userDoc?._id) linkedIds.push(userDoc._id);
      if (employeeDoc?._id) linkedIds.push(employeeDoc._id);
      if (employeeDoc?.user_id && mongoose.Types.ObjectId.isValid(String(employeeDoc.user_id))) {
        linkedIds.push(new mongoose.Types.ObjectId(employeeDoc.user_id));
      }
      if (userDoc?.employee_id && mongoose.Types.ObjectId.isValid(String(userDoc.employee_id))) {
        linkedIds.push(new mongoose.Types.ObjectId(userDoc.employee_id));
      }
      const uniqueLinkedIds = Array.from(new Set(linkedIds.map((id) => String(id))))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      const active = await Attendance.findOne({
        employeeId: { $in: uniqueLinkedIds },
        status: "Present",
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      })
        .sort({ dutyStart: -1 })
        .lean();

      const result = { success: true, employeeId, data: active || null };
      if (typeof ack === "function") ack(result);
      socket.emit("attendance:active_response", result);
    } catch (err) {
      console.error("❌ Socket attendance:get_active error:", err.message);
      const errRes = { success: false, message: err.message };
      if (typeof ack === "function") ack(errRes);
      socket.emit("attendance:active_response", errRes);
    }
  });

  socket.on("attendance:get_active_staff", async (data, ack) => {
    try {
      const { dbName } = data || {};
      if (!dbName) {
        const errRes = { success: false, message: "dbName required" };
        if (typeof ack === "function") ack(errRes);
        return socket.emit("attendance:active_staff_response", errRes);
      }

      const tenantConnection = await dbConnector.getTenantConnection(dbName);
      const { Attendance } = require("./models/TenantModels").getTenantModels(tenantConnection);

      const active = await Attendance.find({
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      }).lean();

      const result = { success: true, data: active || [] };
      if (typeof ack === "function") ack(result);
      socket.emit("attendance:active_staff_response", result);
    } catch (err) {
      console.error("❌ Socket attendance:get_active_staff error:", err.message);
      const errRes = { success: false, message: err.message };
      if (typeof ack === "function") ack(errRes);
      socket.emit("attendance:active_staff_response", errRes);
    }
  });

  // 🚀 HIGH-PERFORMANCE REAL-TIME WORKER LOCATION TRACKING (from GitLabBackEnd)
  socket.on("update_location", async (data, ack) => {
    try {
      const {
        workerId,
        latitude,
        longitude,
        batteryLevel = null,
        speed = null,
        heading = null,
        accuracy = null,
        timestamp,
      } = data || {};

      if (!workerId || latitude === undefined || longitude === undefined || isNaN(Number(latitude)) || isNaN(Number(longitude))) {
        const errRes = { success: false, message: "Valid workerId, latitude, and longitude are required" };
        if (typeof ack === "function") ack(errRes);
        return;
      }

      const numLat = Number(latitude);
      const numLng = Number(longitude);

      // Upsert worker coordinates in MongoDB with 2dsphere index
      const updated = await WorkerLocation.findOneAndUpdate(
        { workerId: String(workerId) },
        {
          location: {
            type: "Point",
            coordinates: [numLng, numLat], // [Longitude, Latitude]
          },
          batteryLevel: batteryLevel !== null && !isNaN(Number(batteryLevel)) ? Number(batteryLevel) : null,
          speed: speed !== null && !isNaN(Number(speed)) ? Number(speed) : null,
          heading: heading !== null && !isNaN(Number(heading)) ? Number(heading) : null,
          accuracy: accuracy !== null && !isNaN(Number(accuracy)) ? Number(accuracy) : null,
          lastUpdated: timestamp ? new Date(timestamp) : new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const payload = {
        workerId: String(workerId),
        latitude: numLat,
        longitude: numLng,
        batteryLevel: updated.batteryLevel,
        speed: updated.speed,
        heading: updated.heading,
        accuracy: updated.accuracy,
        lastUpdated: updated.lastUpdated,
      };

      // Broadcast update to dashboard and all other connected clients
      socket.broadcast.emit("live_location_update", payload);

      if (typeof ack === "function") {
        ack({ success: true, data: payload });
      }
    } catch (err) {
      console.error("❌ Database update_location error:", err.message);
      if (typeof ack === "function") {
        ack({ success: false, message: err.message });
      }
    }
  });

  // 🛡️ ULTRA-FAST GEOFENCE VERIFICATION (using 2dsphere $geoWithin / $near)
  socket.on("check_geofence", async (data, ack) => {
    try {
      const { workerId, siteLongitude, siteLatitude, radiusMeters = 200 } = data || {};

      if (!workerId || siteLongitude === undefined || siteLatitude === undefined) {
        const errRes = { success: false, message: "workerId, siteLongitude, and siteLatitude required" };
        if (typeof ack === "function") ack(errRes);
        return socket.emit("geofence_status", errRes);
      }

      const isInside = await WorkerLocation.isWorkerInsideCircle(
        workerId,
        siteLongitude,
        siteLatitude,
        Number(radiusMeters)
      );

      const result = {
        success: true,
        workerId: String(workerId),
        inside: isInside,
        radiusMeters: Number(radiusMeters),
        checkedAt: new Date(),
      };

      if (typeof ack === "function") ack(result);
      socket.emit("geofence_status", result);
    } catch (err) {
      console.error("❌ Geofence check error:", err.message);
      const errRes = { success: false, message: err.message };
      if (typeof ack === "function") ack(errRes);
      socket.emit("geofence_status", errRes);
    }
  });

  socket.on("disconnect", () => {
    if (socket.isDashboard) {
      activeDashboardSockets = Math.max(0, activeDashboardSockets - 1);
    }
    liveSocketConnections = Math.max(0, liveSocketConnections - 1);
    io.emit("metrics-update", { liveSockets: liveSocketConnections });
    const clientLabel = socket.isDashboard ? 'Admin Dashboard' : 'Mobile App / Client';
    originalLog(`❌ Client disconnected [${clientLabel}]: ${socket.id}`);
  });
});

// ---------- Server Admin Dashboard & Auth Routes ----------
const serverAdminHtmlPath = path.join(__dirname, "serverAdmin.html");
const legacyDashboardHtmlPath = path.join(__dirname, "admin_dashboard.html");

app.post("/api/auth/server-admin/login", async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password) {
      return res.status(400).json({ success: false, message: "Mobile and password required" });
    }
    const cleanMobile = String(mobile).replace(/\D/g, "").slice(-10);
    const userMaster = require("./models/userMaster");
    const user = await userMaster.findOne({ userMobile: cleanMobile, userActive: true });
    if (!user || !user.userPassword) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    const bcrypt = require("bcryptjs");
    const isMatch = await bcrypt.compare(password, user.userPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (user.userRole !== "CorpAdmin") {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Only CorpAdmin users are authorized to access the Server Dashboard."
      });
    }
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      {
        userId: String(user._id),
        userRole: user.userRole,
        userDisplayName: user.userDisplayName,
        userMobile: user.userMobile,
        isServerAdmin: true
      },
      process.env.JWT_SECRET || "fallback_secret_key_hibiz",
      { expiresIn: "30d" }
    );
    return res.json({
      success: true,
      token,
      user: {
        name: user.userDisplayName,
        mobile: user.userMobile,
        role: user.userRole
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/auth/server-admin/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.body?.token;
    if (!token) return res.status(401).json({ success: false, message: "No token provided" });
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_key_hibiz");
    if (!decoded || (decoded.userRole !== "CorpAdmin" && decoded.role !== "CorpAdmin")) {
      return res.status(403).json({ success: false, message: "Unauthorized: CorpAdmin role required" });
    }
    return res.json({ success: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ success: false, message: "Token expired or invalid" });
  }
});

app.get(["/serverAdmin.html", "/serverAdmin", "/admin-dashboard"], (req, res) => {
  if (fs.existsSync(serverAdminHtmlPath)) {
    res.sendFile(serverAdminHtmlPath);
  } else if (fs.existsSync(legacyDashboardHtmlPath)) {
    res.sendFile(legacyDashboardHtmlPath);
  } else {
    res.status(404).send("<h1>Server Admin file not found</h1>");
  }
});

// ---------- Static & Upload Routes ----------
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/upload", authMiddleware, tenantMiddleware, uploadRouter);

// ---------- API Routes (GitLabBackEnd architecture) ----------
app.use("/api/auth", authRouter);
app.use("/api/setting", setting);
app.use("/api/service", UserCorpRouter);
app.use("/service", UserCorpRouter); // 🚀 Smooth alias for direct /service route calls
app.use("/api/finance", FinanceRouter);
app.use("/finance", FinanceRouter);

// 🚀 LEGACY DASHBOARD ADAPTER ROUTES
app.use("/api/payment", require("./routes/paymentRouter"));
app.use("/api/staff", require("./routes/staffRouter"));

// 🛡️ GUARD ALERTNESS MONITORING
app.use("/api/monitoring", require("./routes/monitoringRouter"));

// 🚀 LEGACY SUPPORT: Redirect old /readEmails to unified sync
app.post("/api/readEmails", authMiddleware, tenantMiddleware, UserCorpController.manageLeads.readInbox);

// 🔍 DIAGNOSTIC ROUTE
app.get("/api/debug/active-staff", authMiddleware, tenantMiddleware, async (req, res) => {
  try {
    const userMaster = require("./models/userMaster");
    const { Attendance, Employees } = req.tenantModels;

    const active = await Attendance.find({
      $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }, { dutyEnd: "" }]
    }).lean();
    if (active.length === 0) return res.json({ success: true, step: "STEP1", active: 0 });

    const employeeIds = active.map(a => a.employeeId).filter(id => id && mongoose.Types.ObjectId.isValid(String(id)));
    const emps = await Employees.find({ _id: { $in: employeeIds } }).select("name").lean();

    let users = [];
    try { users = await userMaster.find({ _id: { $in: employeeIds } }).select("userDisplayName").lean(); } catch (e) {}

    const data = active.map(a => {
      const targetId = String(a.employeeId?._id || a.employeeId);
      const emp = emps.find(e => String(e._id) === targetId);
      const user = users.find(u => String(u._id) === targetId);
      return {
        id: a._id,
        employeeId: targetId,
        dutyEnd: a.dutyEnd,
        lat: a.location?.lat,
        long: a.location?.long,
        name: emp?.name || user?.userDisplayName || "Unknown"
      };
    });

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, stack: err.stack });
  }
});

// Optional routes if present
try { app.use("/api/product", require("./routes/productsRouter")); } catch (e) {}
try { app.use("/api/pdf-generate", require("./routes/generatePDF")); } catch (e) {}
try { app.use("/api/orderflows", require("./routes/orderflows")); } catch (e) {}

// ---------- Default & Health Route ----------
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 LeadManager API is active",
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

// ---------- Global 404 Handler ----------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ---------- Centralized Error Handling ----------
app.use((err, req, res, next) => {
  const statusCode = err.name === 'ValidationError' ? 400 : (err.status || 500);
  console.error(`[Error] ${err.message}`);
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ---------- Start Server Using Server Instance ----------
const PORT = process.env.PORT || 5001;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server successfully listening on port ${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use. Kill the existing process and restart.`);
    process.exit(1);
  } else {
    throw err;
  }
});

module.exports = app;
module.exports.server = server;
