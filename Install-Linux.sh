#!/usr/bin/env bash
# Gemini Pilot Installer for Linux
# Usage: chmod +x Install-Linux.sh && ./Install-Linux.sh

set -e
cd "$(dirname "$0")"

clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║                                          ║"
echo "  ║   🚀 Gemini Pilot — Auto Installer       ║"
echo "  ║                                          ║"
echo "  ║   Do not close this window!              ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

step() { echo ""; echo "  ▸ $1"; echo "  ─────────────────────────────"; }

# Step 1: Node.js
step "1/6  Checking Node.js..."
if command -v node &>/dev/null; then
  echo "  ✅ Node.js $(node --version) already installed"
else
  echo "  📦 Installing Node.js..."
  if command -v apt-get &>/dev/null; then
    echo "  Detected apt (Debian/Ubuntu)..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    echo "  Detected dnf (Fedora/RHEL)..."
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs
  elif command -v yum &>/dev/null; then
    echo "  Detected yum (CentOS/RHEL)..."
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo yum install -y nodejs
  elif command -v pacman &>/dev/null; then
    echo "  Detected pacman (Arch)..."
    sudo pacman -S --noconfirm nodejs npm
  elif command -v apk &>/dev/null; then
    echo "  Detected apk (Alpine)..."
    sudo apk add nodejs npm
  else
    echo "  ❌ No supported package manager found."
    echo "  Please install Node.js >= 20 manually from https://nodejs.org"
    exit 1
  fi
  echo "  ✅ Node.js installed: $(node --version)"
fi

# Step 2: Gemini CLI
step "2/6  Checking Gemini CLI..."
if command -v gemini &>/dev/null; then
  echo "  ✅ Gemini CLI already installed"
else
  echo "  📦 Installing Gemini CLI..."
  npm install -g @google/gemini-cli
  echo "  ✅ Gemini CLI installed"
fi

# Step 3: Dependencies
step "3/6  Installing dependencies..."
npm install --no-fund --no-audit
echo "  ✅ Dependencies installed"

# Step 4: Build
step "4/6  Building project..."
npm run build
echo "  ✅ Build complete"

# Step 5: Register gp command
step "5/6  Registering 'gp' command..."
npm link 2>/dev/null || sudo npm link
echo "  ✅ 'gp' command registered globally"

# Step 6: Setup
step "6/6  Running initial setup..."
node dist/cli/index.js setup
echo "  ✅ Setup complete"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║                                          ║"
echo "  ║   ✅ Installation Complete!               ║"
echo "  ║                                          ║"
echo "  ║   Open a terminal and try:               ║"
echo "  ║                                          ║"
echo "  ║   gp harness          (start session)    ║"
echo "  ║   gp ask \"question\"   (quick query)      ║"
echo "  ║   gp team 3           (multi-agent)      ║"
echo "  ║   gp doctor           (check install)    ║"
echo "  ║   gp --help           (all commands)     ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
