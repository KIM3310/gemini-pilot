#!/usr/bin/env bash
# Gemini Pilot Installer — Double-click to install!
# This file opens Terminal automatically on macOS.

set -e
cd "$(dirname "$0")"

clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║                                          ║"
echo "  ║   🚀 Gemini Pilot — Auto Installer       ║"
echo "  ║                                          ║"
echo "  ║   이 창을 닫지 마세요!                     ║"
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
  if command -v brew &>/dev/null; then
    brew install node
  else
    echo "  📦 Installing Homebrew first (Apple's package manager)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
    brew install node
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
echo "  ║   Open Terminal and try:                 ║"
echo "  ║                                          ║"
echo "  ║   gp harness          (start session)    ║"
echo "  ║   gp ask \"question\"   (quick query)      ║"
echo "  ║   gp team 3           (multi-agent)      ║"
echo "  ║   gp doctor           (check install)    ║"
echo "  ║   gp --help           (all commands)     ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Press any key to close this window..."
read -n 1 -s
