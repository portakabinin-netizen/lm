// Enforce Indian Standard Time (IST) for the entire backend
process.env.TZ = 'Asia/Kolkata';

// Auto-free port 5001 if occupied (silent — no output)
try { const { execSync } = require('child_process'); const m = execSync('netstat -ano').toString().match(/0\.0\.0\.0:5001\s+\S+\s+LISTENING\s+(\d+)/); if (m) execSync(`taskkill /PID ${m[1]} /F`); } catch (e) { }

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const helmet = require("helmet");
require("dotenv").config();

// ---------- Import Routers ----------
const authRouter = require("./routes/authRouterNew");
const setting = require("./routes/settingRouter");
const uploadRouter = require("./routes/uploadRouter");
const UserCorpRouter = require("./routes/UserCorpRouter");
const FinanceRouter = require("./routes/FinanceRouter");
const dbConnector = require("./utils/dbConnector");
const path = require("path");

const app = express();

// ---------- Middleware ----------
app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------- MongoDB with Retry logic ----------
const connectDB = async () => {
  try {
    await dbConnector.getMainConnection();
  } catch (err) {
    console.error("❌ Main Database connection failed. Retrying in 5s...");
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// ---------- HTTP + Socket.IO ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use((req, res, next) => { req.io = io; next(); });

io.on("connection", (socket) => {

  socket.on("joinRoom", (dbName) => {
    if (dbName) {
      socket.join(dbName);
    }
  });

  // 🚀 INSTANT DB READ OVER SOCKET FOR ACTIVE ATTENDANCE
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

  socket.on("disconnect", () => { });
});

// ---------- Health Route ----------
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 Nex API is active",
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

// ---------- 🏥 Request Logging (DEBUG)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    if (req.headers['x-tenant-id']) console.log(`   └─ x-tenant-id: ${req.headers['x-tenant-id']}`);
    next();
});

// ---------- API Routes ----------
app.use("/api/auth", authRouter);
app.use("/api/setting", setting);
app.use("/api/service", UserCorpRouter);
app.use("/api/finance", FinanceRouter);

// 🚀 LEGACY DASHBOARD ADAPTER ROUTES
app.use("/api/payment", require("./routes/paymentRouter"));
app.use("/api/staff", require("./routes/staffRouter"));

// 🛡️ GUARD ALERTNESS MONITORING
app.use("/api/monitoring", require("./routes/monitoringRouter"));

// Secure Uploads (Tenant Aware)
const authMiddleware = require("./middleware/authMiddleware");
const tenantMiddleware = require("./middleware/tenantMiddleware");
const UserCorpController = require("./controller/UserCorpController");

app.use("/api/upload", authMiddleware, tenantMiddleware, uploadRouter);

// 🚀 LEGACY SUPPORT: Redirect old /readEmails to the new unified sync
app.post("/api/readEmails", authMiddleware, tenantMiddleware, UserCorpController.manageLeads.readInbox);

// ---------- 🔬 DIAGNOSTIC ROUTE (Temp — remove after debugging) ----------
app.get("/api/debug/active-staff", authMiddleware, tenantMiddleware, async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const userMaster = require("./models/userMaster");
    const { Attendance, Employees } = req.tenantModels;

    console.log("🔬 [DIAG] Models:", !!Attendance, !!Employees);

    const active = await Attendance.find({
      $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }, { dutyEnd: "" }]
    }).lean();
    console.log("🔬 [DIAG] Active records:", active.length);
    if (active.length === 0) return res.json({ success: true, step: "STEP1", active: 0 });

    const employeeIds = active.map(a => a.employeeId).filter(id => id && mongoose.Types.ObjectId.isValid(String(id)));
    console.log("🔬 [DIAG] Employee IDs:", employeeIds.length);

    const emps = await Employees.find({ _id: { $in: employeeIds } }).select("name").lean();
    console.log("🔬 [DIAG] Emps:", emps.length);

    let users = [];
    try { users = await userMaster.find({ _id: { $in: employeeIds } }).select("userDisplayName").lean(); } catch (e) { console.log("🔬 [DIAG] userMaster failed:", e.message); }
    console.log("🔬 [DIAG] Users:", users.length);

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
    console.error("🔬 [DIAG] CRASH:", err.message, err.stack);
    res.status(500).json({ success: false, message: err.message, stack: err.stack });
  }
});

// ---------- 404 Handler ----------
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ---------- Global Error Handler ----------
app.use((err, req, res, next) => {
  const statusCode = err.name === "ValidationError" ? 400 : (err.status || 500);
  console.error(`🔥 [Error] ${err.message}`);
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🖇️ App running on port->${PORT} & Started at: ${new Date().toLocaleString()}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use. Kill the existing process and restart.`);
    process.exit(1);
  } else {
    throw err;
  }
});
