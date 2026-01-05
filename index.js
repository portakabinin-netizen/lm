const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const cloudinary = require('cloudinary').v2;
const helmet = require("helmet"); // Added for security headers
require("dotenv").config();

// ---------- Import Routers ----------
const authRouter = require("./routes/authRouterNew");
const serviceRouter = require("./routes/serviceRouter");
const productsRouter = require("./routes/productsRouter");
const pdfRouter = require("./routes/generatePDF");
const orderflows = require("./routes/orderflows");

const app = express();

// ---------- Cloudinary Configuration ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------- Middleware Stack ----------
app.use(helmet()); // Basic security headers
app.use(cors({ origin: "*" })); // Configure more strictly for production
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ---------- MongoDB Connection ----------
// Removed deprecated options: useNewUrlParser and useUnifiedTopology are now defaults in v6+
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB 🖇️ connected successfully with 📲"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1); // Exit if DB connection fails
  });

// ---------- Create HTTP + Socket Server ----------
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Attach io to req object so controllers can use it
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ---------- Socket.IO Logic ----------
io.on("connection", (socket) => {
  console.log(`⚡ Socket connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`❌ Socket disconnected: ${socket.id}`));
});

// ---------- API Routes ----------
app.use("/api/auth", authRouter);
app.use("/api/service", serviceRouter);
app.use("/api/product", productsRouter);
app.use("/api/pdf-generate", pdfRouter);
app.use("/api/orderflows", orderflows);

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
  console.error(`🔥 [Error] ${err.message}`);
  
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ---------- Start Server ----------

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  
}); 

//const PORT = process.env.PORT || 3000;
//server.listen(PORT, "0.0.0.0", () => {});