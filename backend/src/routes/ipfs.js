const express = require("express");
const router = express.Router();
const multer = require("multer");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  endpoint: "https://s3.filebase.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.FILEBASE_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

// POST /api/ipfs/upload
router.post("/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const { originalname, buffer, mimetype } = req.file;
    const applicantId = req.body.applicantId || "unknown";
    const docType = req.body.docType || "document";

    // Compute SHA-256 hash for on-chain anchoring
    const sha256Hash = "0x" + crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    const key = `${applicantId}/${docType}_${Date.now()}_${originalname}`;

    // Upload to Filebase (which stores on IPFS under the hood)
    await s3.send(new PutObjectCommand({
      Bucket: process.env.FILEBASE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    }));

    // Filebase returns the IPFS CID in the object metadata
    const head = await s3.send(new HeadObjectCommand({
      Bucket: process.env.FILEBASE_BUCKET,
      Key: key,
    }));

    const cid = head.Metadata["cid"];

    res.json({
      success: true,
      cid,
      sha256Hash,
      url: `https://ipfs.filebase.io/ipfs/${cid}`,
      fileName: originalname,
    });

  } catch (err) {
    console.error("IPFS upload error:", err.message);
    if (res.headersSent || res.writableEnded) {
      console.warn("Cannot send upload error response: response already finished or destroyed.");
      return;
    }
    res.status(500).json({ error: "IPFS upload failed", details: err.message });
  }
});

// GET /api/ipfs/status — test connectivity
router.get("/status", async (req, res) => {
  try {
    const { ListBucketsCommand } = require("@aws-sdk/client-s3");
    await s3.send(new ListBucketsCommand({}));
    res.json({ connected: true, service: "Filebase" });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

module.exports = router;