#!/usr/bin/env bash
# Gemini Pilot Installer -- Double-click to install!
# This file opens Terminal automatically on macOS.

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

die() { fail "$1"; echo ""; echo "  Installation aborted."; echo "  Press any key to close..."; read -n 1 -s; exit 1; }

# ── Banner ───────────────────────────────────────────────
clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║                                          ║"
echo "  ║   Gemini Pilot -- Auto Installer (Mac)   ║"
echo "  ║                                          ║"
echo "  ║   Do not close this window!              ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── Detect platform ──────────────────────────────────────
ARCH="$(uname -m)"
OS_VER="$(sw_vers -productVersion 2>/dev/null || echo "unknown")"
if [ "$ARCH" = "arm64" ]; then
  info "Detected: macOS ${OS_VER} Apple Silicon (ARM64)"
else
  info "Detected: macOS ${OS_VER} Intel (${ARCH})"
fi
echo ""

TOTAL_STEPS=7
ERRORS=0

# ── Step 1: git ──────────────────────────────────────────
step "1/${TOTAL_STEPS}  Checking git..."
if command -v git &>/dev/null; then
  success "git $(git --version | awk '{print $3}') found"
else
  info "Installing Xcode Command Line Tools (includes git)..."
  xcode-select --install 2>/dev/null || true
  warn "A system dialog may have appeared. Accept the install, then re-run this script."
  die "git is required but not installed yet."
fi

# ── Step 2: Homebrew + Node.js ───────────────────────────
step "2/${TOTAL_STEPS}  Checking Node.js..."

ensure_brew_in_path() {
  if ! command -v brew &>/dev/null; then
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
}

install_node_via_brew() {
  ensure_brew_in_path
  if ! command -v brew &>/dev/null; then
    info "Installing Homebrew first (Apple's package manager)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || die "Homebrew installation failed."
    # After install, add to PATH for this session
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
  info "Installing Node.js via Homebrew..."
  brew install node || die "Failed to install Node.js via Homebrew."
}

NODE_MIN_MAJOR=20

if command -v node &>/dev/null; then
  NODE_VER="$(node --version)"
  NODE_MAJOR="$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    success "Node.js ${NODE_VER} found (>= v${NODE_MIN_MAJOR})"
  else
    warn "Node.js ${NODE_VER} is too old (need >= v${NODE_MIN_MAJOR}). Upgrading..."
    ensure_brew_in_path
    if command -v brew &>/dev/null; then
      brew upgrade node || brew install node || die "Failed to upgrade Node.js."
    else
      install_node_via_brew
    fi
    success "Node.js upgraded to $(node --version)"
  fi
else
  info "Node.js not found. Installing..."
  install_node_via_brew
  success "Node.js installed: $(node --version)"
fi

# Permanently add Homebrew bin to PATH in shell rc files
ensure_brew_in_path
if command -v brew &>/dev/null; then
  BREW_PREFIX="$(brew --prefix)"
  for rc in ~/.zshrc ~/.bash_profile ~/.bashrc; do
    if [ -f "$rc" ] || [ "$rc" = "$HOME/.zshrc" ]; then
      if ! grep -q "$BREW_PREFIX/bin" "$rc" 2>/dev/null; then
        echo "export PATH=\"$BREW_PREFIX/bin:\$PATH\"" >> "$rc"
        info "Added $BREW_PREFIX/bin to $rc"
      fi
    fi
  done
  export PATH="$BREW_PREFIX/bin:$PATH"
fi

# ── Step 3: Gemini CLI ───────────────────────────────────
step "3/${TOTAL_STEPS}  Checking Gemini CLI..."
if command -v gemini &>/dev/null; then
  success "Gemini CLI already installed"
else
  info "Installing Gemini CLI..."
  if npm install -g @google/gemini-cli; then
    success "Gemini CLI installed"
  else
    fail "npm install -g @google/gemini-cli failed."
    warn "Trying with sudo..."
    if sudo npm install -g @google/gemini-cli; then
      success "Gemini CLI installed (with sudo)"
    else
      fail "Could not install Gemini CLI. You may need to install it manually."
      ERRORS=$((ERRORS + 1))
    fi
  fi
fi

# Permanently add npm global bin to PATH in shell rc files
NPM_BIN="$(npm config get prefix)/bin"
for rc in ~/.zshrc ~/.bash_profile ~/.bashrc; do
  if [ -f "$rc" ] || [ "$rc" = "$HOME/.zshrc" ]; then
    if ! grep -q "$NPM_BIN" "$rc" 2>/dev/null; then
      echo "export PATH=\"$NPM_BIN:\$PATH\"" >> "$rc"
      info "Added $NPM_BIN to $rc"
    fi
  fi
done
export PATH="$NPM_BIN:$PATH"

# ── Step 4: Dependencies ────────────────────────────────
step "4/${TOTAL_STEPS}  Installing dependencies..."
if npm install --no-fund --no-audit; then
  success "Dependencies installed"
else
  die "npm install failed. Check your network connection and try again."
fi

# ── Step 5: Build ────────────────────────────────────────
step "5/${TOTAL_STEPS}  Building project..."
if npm run build; then
  success "Build complete"
else
  die "Build failed. Check the error messages above."
fi

# ── Step 6: Register gp command ──────────────────────────
step "6/${TOTAL_STEPS}  Registering 'gp' command..."
if npm link 2>/dev/null; then
  success "'gp' command registered globally"
elif sudo npm link 2>/dev/null; then
  success "'gp' command registered globally (with sudo)"
else
  fail "'npm link' failed even with sudo."
  warn "Fallback: add this directory to your PATH manually:"
  warn "  echo 'export PATH=\"\$PATH:$(pwd)/dist/cli\"' >> ~/.zshrc && source ~/.zshrc"
  warn "Or run:  node $(pwd)/dist/cli/index.js  directly."
  ERRORS=$((ERRORS + 1))
fi

# Ensure npm link bin directory is permanently in PATH
NPM_LINK_BIN="$(npm config get prefix)/bin"
for rc in ~/.zshrc ~/.bash_profile ~/.bashrc; do
  if [ -f "$rc" ] || [ "$rc" = "$HOME/.zshrc" ]; then
    if ! grep -q "$NPM_LINK_BIN" "$rc" 2>/dev/null; then
      echo "export PATH=\"$NPM_LINK_BIN:\$PATH\"" >> "$rc"
      info "Added $NPM_LINK_BIN to $rc"
    fi
  fi
done
export PATH="$NPM_LINK_BIN:$PATH"

# ── Step 7: Setup + Doctor ───────────────────────────────
step "7/${TOTAL_STEPS}  Running initial setup..."
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
  echo "  ║   Open Terminal and try:                 ║"
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
echo "  Press any key to close this window..."
read -n 1 -s
