const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const cloudinary = require('cloudinary').v2;
const helmet = require("helmet");
require("dotenv").config();

// ---------- Import Routers ----------
const authRouter = require("./routes/authRouterNew");
const serviceRouter = require("./routes/serviceRouter");
const productsRouter = require("./routes/productsRouter");
// const pdfRouter = require("./routes/generatePDF");
//const orderflows     = require("./routes/orderflows");
const setting = require("./routes/settingRouter");
const salesBookRouter = require("./routes/salesBookRouter");
const uploadRouter = require("./routes/uploadRouter");
const paymentRouter = require("./routes/paymentRouter");
const staffRouter   = require("./routes/staffRouter");
const path = require("path");

const app = express();

// ---------- Cloudinary ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------- Middleware ----------
app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------- MongoDB with Retry logic ----------
const connectWithRetry = () => {
  console.log("MongoDB connection attempt...");
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB 🖇️ connected successfully"))
    .catch((err) => {
      console.error("❌ MongoDB connection error:", err.message);
      console.log("Retrying in 5 seconds...");
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

// Handle mongoose disconnection
mongoose.connection.on("disconnected", () => {
  console.log("❌ MongoDB disconnected! Attempting to reconnect...");
  connectWithRetry();
});

// ---------- HTTP + Socket.IO ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use((req, res, next) => { req.io = io; next(); });

io.on("connection", (socket) => {
  console.log(`⚡ Socket connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`❌ Socket disconnected: ${socket.id}`));
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
app.use("/api/service", serviceRouter);
app.use("/api/product", productsRouter);
// app.use("/api/pdf-generate", pdfRouter);
//app.use("/api/orderflows",   orderflows);
app.use("/api/setting", setting);
app.use("/api/salesbook", salesBookRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/staff",   staffRouter);

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
  console.log(`🚀 Server running on port ${PORT}`);
});