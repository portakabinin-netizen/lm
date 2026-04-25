const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const helmet = require("helmet");
require("dotenv").config();

// ---------- Import Routers ----------
const authRouter = require("./routes/authRouterNew");
// const pdfRouter = require("./routes/generatePDF");
// const pdfRouter = require("./routes/generatePDF");
//const orderflows     = require("./routes/orderflows");
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
  console.log("📡 Connecting to Main Database...");
  try {
    await dbConnector.getMainConnection();
    console.log("✅ Main Database Connected [mainDatabase]");
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

  socket.on("disconnect", () => {});
});

// ---------- Health Route ----------
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 LeadManager API is active [v1.0.1-salesbook]",
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

// ---------- API Routes ----------
app.use("/api/auth", authRouter);
app.use("/api/setting", setting);
app.use("/api/service", UserCorpRouter);
app.use("/api/finance", FinanceRouter);

// Secure Uploads (Tenant Aware)
const authMiddleware = require("./middleware/authMiddleware");
const tenantMiddleware = require("./middleware/tenantMiddleware");
const UserCorpController = require("./controller/UserCorpController");

app.use("/api/upload", authMiddleware, tenantMiddleware, uploadRouter);

// 🚀 LEGACY SUPPORT: Redirect old /readEmails to the new unified sync
app.post("/api/readEmails", authMiddleware, tenantMiddleware, UserCorpController.manageLeads.readInbox);

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
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});