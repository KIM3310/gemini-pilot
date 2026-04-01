#!/usr/bin/env bash
# Gemini Pilot Installer for Linux
# Usage: chmod +x Install-Linux.sh && ./Install-Linux.sh

cd "$(dirname "$0")"

# ── Timing ───────────────────────────────────────────────
SECONDS=0

# ── Colors ───────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Helpers ──────────────────────────────────────────────
info()    { printf "  ${CYAN}%s${RESET}\n" "$*"; }
success() { printf "  ${GREEN}OK${RESET} %s\n" "$*"; }
warn()    { printf "  ${YELLOW}WARNING:${RESET} %s\n" "$*"; }
fail()    { printf "  ${RED}ERROR:${RESET} %s\n" "$*"; }
step()    { printf "\n  ${BOLD}> %s${RESET}\n  ─────────────────────────────\n" "$1"; }

die() { fail "$1"; echo ""; echo "  Installation aborted."; exit 1; }

# Use sudo only when not already root
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo &>/dev/null; then
    SUDO="sudo"
  else
    warn "Not running as root and sudo is not available."
    warn "Some steps may fail. Consider running as root or installing sudo."
  fi
fi

# ── Banner ───────────────────────────────────────────────
clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║                                          ║"
echo "  ║   Gemini Pilot -- Auto Installer (Linux) ║"
echo "  ║                                          ║"
echo "  ║   Do not close this window!              ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── Detect platform ──────────────────────────────────────
ARCH="$(uname -m)"
if [ -f /etc/os-release ]; then
  . /etc/os-release
  DISTRO_INFO="${PRETTY_NAME:-${NAME:-Linux}} (${ARCH})"
else
  DISTRO_INFO="Linux $(uname -r) (${ARCH})"
fi
info "Detected: ${DISTRO_INFO}"
echo ""

TOTAL_STEPS=8
ERRORS=0
NODE_MIN_MAJOR=20

# ── Step 1: curl ─────────────────────────────────────────
step "1/${TOTAL_STEPS}  Checking curl..."
if command -v curl &>/dev/null; then
  success "curl found"
else
  info "Installing curl..."
  if command -v apt-get &>/dev/null; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y curl || die "Failed to install curl."
  elif command -v dnf &>/dev/null; then
    $SUDO dnf install -y curl || die "Failed to install curl."
  elif command -v yum &>/dev/null; then
    $SUDO yum install -y curl || die "Failed to install curl."
  elif command -v zypper &>/dev/null; then
    $SUDO zypper install -y curl || die "Failed to install curl."
  elif command -v pacman &>/dev/null; then
    $SUDO pacman -S --noconfirm curl || die "Failed to install curl."
  elif command -v apk &>/dev/null; then
    $SUDO apk add curl || die "Failed to install curl."
  else
    die "curl is required but no supported package manager was found to install it."
  fi
  success "curl installed"
fi

# ── Step 2: git ──────────────────────────────────────────
step "2/${TOTAL_STEPS}  Checking git..."
if command -v git &>/dev/null; then
  success "git $(git --version | awk '{print $3}') found"
else
  info "Installing git..."
  if command -v apt-get &>/dev/null; then
    $SUDO apt-get install -y git || die "Failed to install git."
  elif command -v dnf &>/dev/null; then
    $SUDO dnf install -y git || die "Failed to install git."
  elif command -v yum &>/dev/null; then
    $SUDO yum install -y git || die "Failed to install git."
  elif command -v zypper &>/dev/null; then
    $SUDO zypper install -y git || die "Failed to install git."
  elif command -v pacman &>/dev/null; then
    $SUDO pacman -S --noconfirm git || die "Failed to install git."
  elif command -v apk &>/dev/null; then
    $SUDO apk add git || die "Failed to install git."
  else
    die "git is required but no supported package manager was found to install it."
  fi
  success "git installed"
fi

# ── Step 3: Node.js ─────────────────────────────────────
step "3/${TOTAL_STEPS}  Checking Node.js..."

install_node() {
  if command -v apt-get &>/dev/null; then
    info "Detected apt (Debian/Ubuntu)..."
    if curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -; then
      $SUDO apt-get install -y nodejs || die "Failed to install Node.js via apt."
    else
      fail "NodeSource setup script failed (network issue?)."
      die "Install Node.js >= 20 manually: https://nodejs.org"
    fi
  elif command -v dnf &>/dev/null; then
    info "Detected dnf (Fedora/RHEL)..."
    if curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -; then
      $SUDO dnf install -y nodejs || die "Failed to install Node.js via dnf."
    else
      fail "NodeSource setup script failed (network issue?)."
      die "Install Node.js >= 20 manually: https://nodejs.org"
    fi
  elif command -v yum &>/dev/null; then
    info "Detected yum (CentOS/RHEL)..."
    if curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -; then
      $SUDO yum install -y nodejs || die "Failed to install Node.js via yum."
    else
      fail "NodeSource setup script failed (network issue?)."
      die "Install Node.js >= 20 manually: https://nodejs.org"
    fi
  elif command -v zypper &>/dev/null; then
    info "Detected zypper (openSUSE)..."
    if curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -; then
      $SUDO zypper install -y nodejs || die "Failed to install Node.js via zypper."
    else
      fail "NodeSource setup script failed (network issue?)."
      die "Install Node.js >= 20 manually: https://nodejs.org"
    fi
  elif command -v pacman &>/dev/null; then
    info "Detected pacman (Arch)..."
    $SUDO pacman -S --noconfirm nodejs npm || die "Failed to install Node.js via pacman."
  elif command -v apk &>/dev/null; then
    info "Detected apk (Alpine)..."
    $SUDO apk add nodejs npm || die "Failed to install Node.js via apk."
  else
    die "No supported package manager found. Please install Node.js >= 20 manually from https://nodejs.org"
  fi
}

if command -v node &>/dev/null; then
  NODE_VER="$(node --version)"
  NODE_MAJOR="$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    success "Node.js ${NODE_VER} found (>= v${NODE_MIN_MAJOR})"
  else
    warn "Node.js ${NODE_VER} is too old (need >= v${NODE_MIN_MAJOR}). Upgrading..."
    install_node
    success "Node.js upgraded to $(node --version)"
  fi
else
  info "Node.js not found. Installing..."
  install_node
  success "Node.js installed: $(node --version)"
fi

# ── Step 4: Gemini CLI ───────────────────────────────────
step "4/${TOTAL_STEPS}  Checking Gemini CLI..."
if command -v gemini &>/dev/null; then
  success "Gemini CLI already installed"
else
  info "Installing Gemini CLI..."
  if npm install -g @google/gemini-cli 2>/dev/null; then
    success "Gemini CLI installed"
  else
    info "Retrying with $SUDO..."
    if $SUDO npm install -g @google/gemini-cli; then
      success "Gemini CLI installed (with elevated privileges)"
    else
      fail "Could not install Gemini CLI. You may need to install it manually."
      ERRORS=$((ERRORS + 1))
    fi
  fi
fi

# ── Step 5: Dependencies ────────────────────────────────
step "5/${TOTAL_STEPS}  Installing dependencies..."
if npm install --no-fund --no-audit; then
  success "Dependencies installed"
else
  die "npm install failed. Check your network connection and try again."
fi

# ── Step 6: Build ────────────────────────────────────────
step "6/${TOTAL_STEPS}  Building project..."
if npm run build; then
  success "Build complete"
else
  die "Build failed. Check the error messages above."
fi

# ── Step 7: Register gp command ──────────────────────────
step "7/${TOTAL_STEPS}  Registering 'gp' command..."
if npm link 2>/dev/null; then
  success "'gp' command registered globally"
elif $SUDO npm link 2>/dev/null; then
  success "'gp' command registered globally (with elevated privileges)"
else
  fail "'npm link' failed."
  warn "Fallback: add this directory to your PATH manually:"
  warn "  echo 'export PATH=\"\$PATH:$(pwd)/dist/cli\"' >> ~/.bashrc && source ~/.bashrc"
  warn "Or run:  node $(pwd)/dist/cli/index.js  directly."
  ERRORS=$((ERRORS + 1))
fi

# ── Step 8: Setup + Doctor ───────────────────────────────
step "8/${TOTAL_STEPS}  Running initial setup..."
if node dist/cli/index.js setup; then
  success "Setup complete"
else
  fail "Setup had issues. You can re-run: gp setup"
  ERRORS=$((ERRORS + 1))
fi

# ── Doctor check ─────────────────────────────────────────
echo ""
info "Running 'gp doctor' to verify installation..."
if command -v gp &>/dev/null; then
  gp doctor || warn "'gp doctor' reported issues (see above)."
else
  node dist/cli/index.js doctor 2>/dev/null || warn "Could not run doctor check."
fi

# ── Done ─────────────────────────────────────────────────
ELAPSED=$SECONDS
MINS=$((ELAPSED / 60))
SECS=$((ELAPSED % 60))

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║                                          ║"
  printf "  ║   ${GREEN}Installation Complete!${RESET}                ║\n"
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
else
  echo "  ╔══════════════════════════════════════════╗"
  printf "  ║   ${YELLOW}Installation finished with ${ERRORS} warning(s)${RESET}  ║\n"
  echo "  ║   Review the messages above.             ║"
  echo "  ╚══════════════════════════════════════════╝"
fi

printf "\n  Completed in %dm %ds\n\n" "$MINS" "$SECS"
