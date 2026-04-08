# 🏛️ IGNWPS — Blockchain Widow Pension Portal
### Indira Gandhi National Widow Pension Scheme — Blockchain Administration

> **IBC07 | CSE 542 | Prof. Sanjay Chaudhary**  
> Full-stack DApp: React + Node.js + Hardhat + IPFS + MetaMask

---

## 🏗️ Architecture Overview

```
widow-pension-dapp/
├── contracts/          ← 6 Solidity contracts + Hardhat
│   ├── RoleAccess.sol
│   ├── SchemeConfig.sol
│   ├── AuditLog.sol
│   ├── IPFSVerifier.sol
│   ├── FundManager.sol
│   ├── PensionRegistry.sol
│   ├── hardhat.config.js
│   ├── package.json
│   └── scripts/deploy.js
├── backend/            ← Express.js API
│   ├── src/
│   │   ├── server.js
│   │   └── routes/
│   │       ├── aadhaar.js   ← OTP simulation + eKYC
│   │       └── ipfs.js      ← IPFS upload + hashing
│   ├── package.json
│   └── .env
└── frontend/           ← React app
    ├── src/
    │   ├── App.jsx
    │   ├── context/Web3Context.jsx
    │   ├── pages/
    │   │   ├── Home.jsx
    │   │   ├── ApplyPage.jsx
    │   │   ├── StatusPage.jsx
    │   │   ├── ValidatorDashboard.jsx
    │   │   └── AdminPanel.jsx
    │   ├── components/Navbar.jsx
    │   └── config/contracts.js
    └── package.json
```

---

## 🚀 Quick Start (Step-by-Step)

### Prerequisites
- **Node.js** v18+ (`node --version`)
- **MetaMask** browser extension installed
- **VS Code** (recommended)

---

### Step 1 — Install & Compile Contracts

```bash
cd contracts
npm install
npx hardhat compile
```

You should see `Compiled 6 Solidity files successfully`.

---

### Step 2 — Start Local Blockchain

Open a **new terminal** and keep it running:

```bash
cd contracts
npx hardhat node
```

You'll see 10 test accounts with private keys. **Copy these for MetaMask import.**

```
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)  ← ADMIN
Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)  ← VALIDATOR 1
Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (10000 ETH)  ← VALIDATOR 2
Account #3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (10000 ETH)  ← VALIDATOR 3
Account #4: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (10000 ETH)  ← TREASURY
Account #5: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (10000 ETH)  ← APPLICANT
```

---

### Step 3 — Deploy Contracts

Open **another terminal**:

```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

This will:
1. Deploy all 6 contracts in the correct order
2. Grant roles to validators
3. Fund the treasury with 10 ETH
4. Write `deployment.json` to both `backend/src/config/` and `frontend/src/config/`

---

### Step 4 — Start the Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on **http://localhost:5000**

(Optional) Start IPFS daemon for real document storage:
```bash
# Install IPFS: https://docs.ipfs.tech/install/
ipfs daemon
```
Without IPFS, the backend auto-generates simulated CIDs for demo.

---

### Step 5 — Start the Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs on **http://localhost:3000**

---

### Step 6 — Configure MetaMask

1. Open MetaMask → **Add Network**:
   - Network Name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency: `ETH`

2. Import accounts using private keys from Step 2 (shown in `npx hardhat node` output):
   - **Account #0** → Admin wallet
   - **Account #1** → Validator 1
   - **Account #5** → Applicant wallet

---

## 🎯 Demo Walkthrough

### As an Applicant (Account #5):
1. Open http://localhost:3000 → Connect MetaMask (Account #5)
2. Click **Apply Now**
3. Enter demo Aadhaar: `456789012345` → Send OTP → Use shown OTP
4. Upload any files for documents (3 required)
5. Review and Submit → Confirm MetaMask transaction
6. Note your Application ID

### As a Validator (Account #1, #2, or #3):
1. Switch MetaMask to Validator account
2. Go to **Validator** tab
3. Select the pending application
4. Click **Begin Review** (FCFS enforced)
5. Vote Approve or Reject
6. Repeat with 2 more validator accounts until threshold (3/3) is met

### As Admin (Account #0):
1. Switch to Account #0
2. Go to **Admin** tab
3. Manage roles, deposit funds, add schemes

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/aadhaar/request-otp` | Send OTP (simulated) |
| POST | `/api/aadhaar/verify-otp` | Verify OTP → returns aadhaarHash |
| POST | `/api/ipfs/upload` | Upload document → IPFS CID |
| GET  | `/api/ipfs/status` | Check IPFS daemon |
| GET  | `/api/status` | Backend health |

### Demo Aadhaar Numbers:
| Number | Name |
|--------|------|
| `234567890123` | Sunita Devi |
| `345678901234` | Meera Bai |
| `456789012345` | Kamla Sharma |
| `567890123456` | Radha Kumari |
| `111111111111` | Test Applicant |

---

## 🔗 Smart Contract Flow

```
Deploy Order:
1. RoleAccess        → shared authority
2. SchemeConfig      → pension scheme config
3. AuditLog          → immutable event log
4. IPFSVerifier      → document hash anchoring
5. FundManager       → treasury + disbursement
6. PensionRegistry   → main contract (FCFS + voting + payment)

Application Lifecycle:
SUBMITTED → VOTING → APPROVED → PAID
                   ↘ REJECTED → DISPUTED → (re-queue)

Consensus: ceil(totalValidators × 70%) votes needed
```

---

## 📝 Key Files

| File | Purpose |
|------|---------|
| `contracts/scripts/deploy.js` | Full deployment + role setup |
| `backend/src/routes/aadhaar.js` | Aadhaar OTP simulation |
| `backend/src/routes/ipfs.js` | IPFS upload with SHA-256 |
| `frontend/src/context/Web3Context.jsx` | MetaMask + ethers.js |
| `frontend/src/pages/ApplyPage.jsx` | 4-step application wizard |
| `frontend/src/pages/ValidatorDashboard.jsx` | FCFS queue + voting |
| `frontend/src/pages/AdminPanel.jsx` | Role management + funds |
| `frontend/src/config/contracts.js` | ABIs + state enums |

---

## 🛠️ Troubleshooting

**"Contract not found" error:**  
→ Make sure you ran deploy script and `deployment.json` was created in `frontend/src/config/`

**MetaMask "nonce too high":**  
→ MetaMask Settings → Advanced → Reset Account

**IPFS upload fails:**  
→ Normal in demo mode — backend returns simulated CID automatically

**"Not a validator" error:**  
→ Admin must call `grantAllRoles(yourAddress)` from Account #0

---

*Built with ❤️ — IBC07, CSE 542*
