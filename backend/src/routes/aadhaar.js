// ============================================================
//  Aadhaar eKYC Simulation API
//  In production: replace with UIDAI sandbox API calls.
//  For demo: validates format, returns mock verified data.
// ============================================================

const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();

// Simulated Aadhaar database (for demo)
const MOCK_AADHAAR_DB = {
  "234567890123": { name: "Sunita Devi",     dob: "1965-04-12", gender: "F", state: "Uttar Pradesh", district: "Lucknow",    verified: true },
  "345678901234": { name: "Meera Bai",       dob: "1958-07-23", gender: "F", state: "Rajasthan",     district: "Jaipur",     verified: true },
  "456789012345": { name: "Kamla Sharma",    dob: "1971-11-05", gender: "F", state: "Gujarat",       district: "Vadodara",   verified: true },
  "567890123456": { name: "Radha Kumari",    dob: "1962-03-18", gender: "F", state: "Bihar",         district: "Patna",      verified: true },
  "678901234567": { name: "Savitri Pandey",  dob: "1969-09-30", gender: "F", state: "Madhya Pradesh",district: "Bhopal",     verified: true },
  "789012345678": { name: "Geeta Mishra",    dob: "1955-12-08", gender: "F", state: "Maharashtra",   district: "Pune",       verified: true },
  "111111111111": { name: "Test Applicant",  dob: "1970-01-01", gender: "F", state: "Delhi",         district: "New Delhi",  verified: true },
};

// ── Utility ──────────────────────────────────────────────────
function validateAadhaarFormat(num) {
  // 12 digits, first digit cannot be 0 or 1
  return /^[2-9][0-9]{11}$/.test(num);
}

function hashAadhaar(aadhaarNumber) {
  return "0x" + crypto.createHash("sha256").update(aadhaarNumber + "PENSION_SALT_2024").digest("hex");
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

// ── Step 1: Request OTP ───────────────────────────────────────
// POST /api/aadhaar/request-otp
router.post("/request-otp", (req, res) => {
  const { aadhaarNumber } = req.body;

  if (!aadhaarNumber) {
    return res.status(400).json({ success: false, error: "Aadhaar number is required" });
  }

  const cleaned = aadhaarNumber.replace(/\s/g, "");

  if (!validateAadhaarFormat(cleaned)) {
    return res.status(400).json({ success: false, error: "Invalid Aadhaar number format. Must be 12 digits." });
  }

  // Simulate OTP generation
  const otp = generateOTP();
  const key = `${cleaned}`;

  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    attempts: 0
  });

  // In production, UIDAI sends OTP to registered mobile
  // For demo: return OTP in response (NEVER do this in production)
  console.log(`[Aadhaar Sim] OTP for ${cleaned.slice(0,4)}****${cleaned.slice(-4)}: ${otp}`);

  res.json({
    success: true,
    message: "OTP sent to registered mobile number",
    // DEMO ONLY — remove in production:
    demoOTP: otp,
    maskedMobile: "XXXXXX" + (Math.floor(1000 + Math.random() * 9000)).toString()
  });
});

// ── Step 2: Verify OTP and get eKYC data ─────────────────────
// POST /api/aadhaar/verify-otp
router.post("/verify-otp", (req, res) => {
  const { aadhaarNumber, otp } = req.body;

  if (!aadhaarNumber || !otp) {
    return res.status(400).json({ success: false, error: "Aadhaar number and OTP are required" });
  }

  const cleaned = aadhaarNumber.replace(/\s/g, "");

  if (!validateAadhaarFormat(cleaned)) {
    return res.status(400).json({ success: false, error: "Invalid Aadhaar number format" });
  }

  const stored = otpStore.get(cleaned);

  if (!stored) {
    return res.status(400).json({ success: false, error: "OTP not found. Please request a new OTP." });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(cleaned);
    return res.status(400).json({ success: false, error: "OTP expired. Please request a new OTP." });
  }

  stored.attempts++;
  if (stored.attempts > 3) {
    otpStore.delete(cleaned);
    return res.status(429).json({ success: false, error: "Too many failed attempts. Request a new OTP." });
  }

  if (stored.otp !== otp) {
    return res.status(400).json({ success: false, error: `Invalid OTP. ${3 - stored.attempts} attempts remaining.` });
  }

  // OTP correct — fetch mock eKYC data
  otpStore.delete(cleaned);

  const personData = MOCK_AADHAAR_DB[cleaned];
  if (!personData) {
    // For demo: generate generic data for any valid Aadhaar
    const genericData = {
      name: "Verified Applicant",
      dob: "1968-06-15",
      gender: "F",
      state: "India",
      district: "Unknown",
      verified: true
    };
    const aadhaarHash = hashAadhaar(cleaned);
    return res.json({
      success: true,
      verified: true,
      aadhaarHash,
      kyc: { ...genericData, maskedAadhaar: cleaned.slice(0, 4) + "XXXX" + cleaned.slice(-4) }
    });
  }

  const aadhaarHash = hashAadhaar(cleaned);

  res.json({
    success: true,
    verified: true,
    aadhaarHash,
    kyc: {
      ...personData,
      maskedAadhaar: cleaned.slice(0, 4) + "XXXX" + cleaned.slice(-4)
    }
  });
});

// ── Check Aadhaar registration (proxy for contract check) ────
// GET /api/aadhaar/check/:hash
router.get("/check/:hash", (req, res) => {
  // Frontend can also call the contract directly; this is a convenience endpoint
  const { hash } = req.params;
  if (!hash || hash.length !== 66) {
    return res.status(400).json({ success: false, error: "Invalid hash format" });
  }
  res.json({ success: true, hash, message: "Use contract isAadhaarRegistered() for authoritative check" });
});

module.exports = router;
