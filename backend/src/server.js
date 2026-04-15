require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const aadhaarRoutes = require("./routes/aadhaar");
const ipfsRoutes    = require("./routes/ipfs");
const statusRoutes  = require("./routes/status");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Middleware ───────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: "Too many requests" } });
app.use("/api/", limiter);

// ── Routes ────────────────────────────────────────────────────
app.use("/api/aadhaar", aadhaarRoutes);
app.use("/api/ipfs",    ipfsRoutes);
app.use("/api/status",  statusRoutes);

// ── Health Check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), service: "widow-pension-backend" });
});

// ── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent || res.writableEnded) {
    console.warn("Cannot send error response: response already finished or destroyed.");
    return next(err);
  }
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Widow Pension Backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Aadhaar API: http://localhost:${PORT}/api/aadhaar`);
  console.log(`   IPFS API: http://localhost:${PORT}/api/ipfs\n`);
});
