const express = require("express");
const router  = express.Router();

router.get("/", (req, res) => {
  res.json({
    service: "Widow Pension DApp Backend",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      aadhaar: {
        "POST /api/aadhaar/request-otp": "Send OTP to Aadhaar registered mobile",
        "POST /api/aadhaar/verify-otp":  "Verify OTP and get eKYC data + hash"
      },
      ipfs: {
        "POST /api/ipfs/upload":          "Upload a single document",
        "POST /api/ipfs/upload-multiple": "Upload multiple documents",
        "GET  /api/ipfs/status":          "Check IPFS daemon connectivity"
      }
    }
  });
});

module.exports = router;
