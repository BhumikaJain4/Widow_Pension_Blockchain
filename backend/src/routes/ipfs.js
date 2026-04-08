// ============================================================
//  IPFS Document Upload Route
//  Uses kubo-rpc-client to connect to a local IPFS node.
//  Run: npx kubo daemon  (or Docker)
// ============================================================

const express = require("express");
const multer  = require("multer");
const crypto  = require("crypto");
const router  = express.Router();

// Multer — memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg","image/png","image/webp","application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, WebP, and PDF files are allowed"));
  }
});

// IPFS client factory — lazy init so server starts even without IPFS daemon
let ipfsClient = null;
async function getIPFS() {
  if (ipfsClient) return ipfsClient;
  try {
    const { create } = await import("kubo-rpc-client");
    ipfsClient = create({
      host:     process.env.IPFS_HOST     || "localhost",
      port:     parseInt(process.env.IPFS_PORT || "5001"),
      protocol: process.env.IPFS_PROTOCOL || "http"
    });
    return ipfsClient;
  } catch (err) {
    console.error("IPFS client init failed:", err.message);
    return null;
  }
}

// ── POST /api/ipfs/upload — upload a single document ─────────
router.post("/upload", upload.single("document"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file provided" });
  }

  const { docType = "general", applicationId = "pending" } = req.body;

  // Compute SHA-256 hash of the file (to be stored on-chain)
  const sha256 = "0x" + crypto.createHash("sha256").update(req.file.buffer).digest("hex");

  try {
    const ipfs = await getIPFS();

    if (!ipfs) {
      // Fallback: return a simulated CID for demo when IPFS daemon isn't running
      const mockCID = "Qm" + crypto.randomBytes(22).toString("hex").slice(0, 44);
      console.log(`[IPFS] Daemon not available. Simulated CID: ${mockCID}`);
      return res.json({
        success: true,
        simulated: true,
        cid: mockCID,
        sha256Hash: sha256,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        docType,
        applicationId,
        ipfsUrl: `https://ipfs.io/ipfs/${mockCID}`
      });
    }

    // Upload to IPFS
    const result = await ipfs.add(req.file.buffer, { pin: true });
    const cid = result.cid.toString();

    console.log(`[IPFS] Uploaded: ${req.file.originalname} → CID: ${cid}`);

    res.json({
      success: true,
      simulated: false,
      cid,
      sha256Hash: sha256,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      docType,
      applicationId,
      ipfsUrl: `http://localhost:8080/ipfs/${cid}`
    });

  } catch (err) {
    console.error("[IPFS] Upload error:", err.message);
    // Return simulated CID if IPFS fails (dev mode)
    const mockCID = "Qm" + crypto.randomBytes(22).toString("hex").slice(0, 44);
    res.json({
      success: true,
      simulated: true,
      cid: mockCID,
      sha256Hash: sha256,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      docType,
      applicationId,
      ipfsUrl: `https://ipfs.io/ipfs/${mockCID}`
    });
  }
});

// ── POST /api/ipfs/upload-multiple — upload document bundle ──
router.post("/upload-multiple", upload.array("documents", 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: "No files provided" });
  }

  const results = [];
  const ipfs = await getIPFS();

  for (const file of req.files) {
    const sha256 = "0x" + crypto.createHash("sha256").update(file.buffer).digest("hex");

    if (!ipfs) {
      const mockCID = "Qm" + crypto.randomBytes(22).toString("hex").slice(0, 44);
      results.push({ success: true, simulated: true, cid: mockCID, sha256Hash: sha256, fileName: file.originalname, fileSize: file.size });
      continue;
    }

    try {
      const result = await ipfs.add(file.buffer, { pin: true });
      results.push({ success: true, simulated: false, cid: result.cid.toString(), sha256Hash: sha256, fileName: file.originalname, fileSize: file.size });
    } catch (err) {
      const mockCID = "Qm" + crypto.randomBytes(22).toString("hex").slice(0, 44);
      results.push({ success: true, simulated: true, cid: mockCID, sha256Hash: sha256, fileName: file.originalname, fileSize: file.size, error: err.message });
    }
  }

  res.json({ success: true, files: results });
});

// ── GET /api/ipfs/status ──────────────────────────────────────
router.get("/status", async (req, res) => {
  try {
    const ipfs = await getIPFS();
    if (!ipfs) return res.json({ connected: false, message: "IPFS daemon not reachable" });
    const version = await ipfs.version();
    res.json({ connected: true, version: version.version });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

module.exports = router;
