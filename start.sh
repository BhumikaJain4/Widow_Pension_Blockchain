#!/usr/bin/env bash
# ============================================================
#  IGNWPS DApp — Quick Start Helper
#  Usage: bash start.sh
# ============================================================

set -e
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     IGNWPS Widow Pension DApp — Setup        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Check Node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js v18+"
  exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node --version)"

# Install contracts deps
echo ""
echo -e "${BLUE}[1/4]${NC} Installing contract dependencies..."
cd contracts && npm install --silent && cd ..
echo -e "${GREEN}✓${NC} Contracts deps installed"

# Compile contracts
echo -e "${BLUE}[2/4]${NC} Compiling smart contracts..."
cd contracts && npx hardhat compile --quiet && cd ..
echo -e "${GREEN}✓${NC} Contracts compiled"

# Install backend deps
echo -e "${BLUE}[3/4]${NC} Installing backend dependencies..."
cd backend && npm install --silent && cd ..
echo -e "${GREEN}✓${NC} Backend deps installed"

# Install frontend deps
echo -e "${BLUE}[4/4]${NC} Installing frontend dependencies..."
cd frontend && npm install --silent && cd ..
echo -e "${GREEN}✓${NC} Frontend deps installed"

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  All dependencies installed! Next steps:${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Terminal 1${NC} — Start local blockchain:"
echo -e "  cd contracts && npx hardhat node"
echo ""
echo -e "${YELLOW}Terminal 2${NC} — Deploy contracts (after Terminal 1 is running):"
echo -e "  cd contracts && npx hardhat run scripts/deploy.js --network localhost"
echo ""
echo -e "${YELLOW}Terminal 3${NC} — Start backend:"
echo -e "  cd backend && npm run dev"
echo ""
echo -e "${YELLOW}Terminal 4${NC} — Start frontend:"
echo -e "  cd frontend && npm start"
echo ""
echo -e "Then open ${BLUE}http://localhost:3000${NC} in your browser."
echo ""
echo -e "See ${BOLD}README.md${NC} for full MetaMask setup instructions."
echo ""
