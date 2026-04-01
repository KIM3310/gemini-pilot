@echo off
setlocal EnableDelayedExpansion
title Gemini Pilot -- Auto Installer (Windows)
color 0A

:: ── Timing ──────────────────────────────────────────────
set "START_TIME=%time%"

echo.
echo   ========================================
echo   =                                      =
echo   =   Gemini Pilot -- Auto Installer     =
echo   =                                      =
echo   =   Do not close this window!          =
echo   =                                      =
echo   ========================================
echo.

:: ── Detect platform ─────────────────────────────────────
for /f "tokens=2 delims==" %%A in ('wmic os get Caption /value 2^>nul ^| find "Caption"') do set "OS_NAME=%%A"
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (set "ARCH=x64") else (set "ARCH=%PROCESSOR_ARCHITECTURE%")
echo   Detected: !OS_NAME! !ARCH!
echo.

set "ERRORS=0"
set "TOTAL_STEPS=7"
set "NODE_MIN_MAJOR=20"

:: ── Step 1: Check git ───────────────────────────────────
echo   [1/!TOTAL_STEPS!] Checking git...
where git >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo   WARNING: git not found. Some operations may fail.
    echo   Install git from: https://git-scm.com/download/win
    set /a ERRORS+=1
) else (
    for /f "tokens=3" %%v in ('git --version') do echo   OK git %%v found
)

:: ── Step 2: Node.js ─────────────────────────────────────
echo.
echo   [2/!TOTAL_STEPS!] Checking Node.js...

where node >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo   Node.js not found. Attempting to install...
    call :InstallNode
    if !ERRORLEVEL! neq 0 (
        echo   ERROR: Could not install Node.js automatically.
        echo   Please install Node.js ^>= 20 manually from https://nodejs.org
        echo   Then re-run this installer.
        pause
        exit /b 1
    )
) else (
    :: Check version
    for /f "tokens=1 delims=v." %%m in ('node --version 2^>nul') do set "NODE_MAJOR=%%m"
    :: Strip the leading 'v' if still present
    set "NODE_MAJOR=!NODE_MAJOR:v=!"
    if !NODE_MAJOR! LSS !NODE_MIN_MAJOR! (
        echo   WARNING: Node.js version is too old ^(need ^>= v!NODE_MIN_MAJOR!^).
        echo   Attempting to upgrade...
        call :InstallNode
        if !ERRORLEVEL! neq 0 (
            echo   ERROR: Could not upgrade Node.js automatically.
            echo   Please upgrade to Node.js ^>= 20 from https://nodejs.org
            pause
            exit /b 1
        )
    ) else (
        for /f "tokens=*" %%i in ('node --version') do echo   OK Node.js %%i found
    )
)

:: Verify node is now available
where node >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo   ERROR: Node.js is still not found in PATH.
    echo   You may need to close this window and open a NEW command prompt,
    echo   then re-run this installer so the updated PATH takes effect.
    pause
    exit /b 1
)

:: Add Node.js to system PATH permanently
for /f "tokens=*" %%a in ('where node 2^>nul') do set "NODE_DIR=%%~dpa"
if defined NODE_DIR (
    echo !PATH! | findstr /I /C:"!NODE_DIR!" >nul 2>nul
    if !ERRORLEVEL! neq 0 (
        setx PATH "!PATH!;!NODE_DIR!" /M 2>nul || setx PATH "!PATH!;!NODE_DIR!"
        echo   Added Node.js dir to permanent PATH: !NODE_DIR!
    )
)

:: ── Step 3: Gemini CLI ──────────────────────────────────
echo.
echo   [3/!TOTAL_STEPS!] Checking Gemini CLI...
where gemini >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo   Installing Gemini CLI...
    call npm install -g @google/gemini-cli
    if !ERRORLEVEL! neq 0 (
        echo   WARNING: Failed to install Gemini CLI globally.
        echo   You may need to run this installer as Administrator.
        set /a ERRORS+=1
    ) else (
        echo   OK Gemini CLI installed
    )
) else (
    echo   OK Gemini CLI found
)

:: Add npm global prefix to system PATH permanently
for /f "tokens=*" %%a in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%a"
if defined NPM_PREFIX (
    echo !PATH! | findstr /I /C:"!NPM_PREFIX!" >nul 2>nul
    if !ERRORLEVEL! neq 0 (
        setx PATH "!PATH!;!NPM_PREFIX!" /M 2>nul || setx PATH "!PATH!;!NPM_PREFIX!"
        set "PATH=!PATH!;!NPM_PREFIX!"
        echo   Added npm global prefix to permanent PATH: !NPM_PREFIX!
    )
)

:: ── Step 4: Dependencies ────────────────────────────────
echo.
echo   [4/!TOTAL_STEPS!] Installing dependencies...
call npm install --no-fund --no-audit
if !ERRORLEVEL! neq 0 (
    echo   ERROR: npm install failed. Check your network connection.
    pause
    exit /b 1
)
echo   OK Dependencies installed

:: ── Step 5: Build ───────────────────────────────────────
echo.
echo   [5/!TOTAL_STEPS!] Building...
call npm run build
if !ERRORLEVEL! neq 0 (
    echo   ERROR: Build failed. Check the error messages above.
    pause
    exit /b 1
)
echo   OK Build complete

:: ── Step 6: Register gp command ─────────────────────────
echo.
echo   [6/!TOTAL_STEPS!] Registering 'gp' command...
call npm link 2>nul
if !ERRORLEVEL! neq 0 (
    echo   WARNING: 'npm link' failed. This usually means you need admin rights.
    echo.
    echo   Fix: Right-click this file and choose "Run as Administrator",
    echo   or open an elevated command prompt and run:
    echo     cd "%~dp0" ^&^& npm link
    set /a ERRORS+=1
) else (
    echo   OK 'gp' command registered globally
)

:: ── Step 7: Setup + Doctor ──────────────────────────────
echo.
echo   [7/!TOTAL_STEPS!] Running initial setup...
node dist\cli\index.js setup
if !ERRORLEVEL! neq 0 (
    echo   WARNING: Setup had issues. You can re-run: gp setup
    set /a ERRORS+=1
) else (
    echo   OK Setup complete
)

:: ── Doctor check ────────────────────────────────────────
echo.
echo   Running 'gp doctor' to verify installation...
where gp >nul 2>nul
if !ERRORLEVEL! equ 0 (
    call gp doctor
) else (
    node dist\cli\index.js doctor 2>nul
)

:: ── Timing ──────────────────────────────────────────────
set "END_TIME=%time%"

:: ── Done ────────────────────────────────────────────────
echo.
if !ERRORS! equ 0 (
    echo   ========================================
    echo   =                                      =
    echo   =   Installation Complete!             =
    echo   =                                      =
    echo   =   Open CMD or PowerShell and try:    =
    echo   =     gp harness                       =
    echo   =     gp ask "question"                =
    echo   =     gp team 3                        =
    echo   =     gp doctor                        =
    echo   =     gp --help                        =
    echo   =                                      =
    echo   ========================================
) else (
    echo   ========================================
    echo   =   Finished with !ERRORS! warning^(s^).         =
    echo   =   Review the messages above.         =
    echo   ========================================
)
echo.
echo   Started: %START_TIME%   Finished: %END_TIME%
echo.
pause
endlocal
exit /b 0

:: ═══════════════════════════════════════════════════════
:: Subroutine: Install Node.js with fallback chain
:: ═══════════════════════════════════════════════════════
:InstallNode
:: Try winget first
where winget >nul 2>nul
if !ERRORLEVEL! equ 0 (
    echo   Trying winget...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if !ERRORLEVEL! equ 0 (
        call :RefreshPath
        exit /b 0
    )
    echo   winget install failed, trying fallback...
)

:: Try Chocolatey
where choco >nul 2>nul
if !ERRORLEVEL! equ 0 (
    echo   Trying Chocolatey...
    choco install nodejs-lts -y
    if !ERRORLEVEL! equ 0 (
        call :RefreshPath
        exit /b 0
    )
    echo   Chocolatey install failed, trying fallback...
)

:: No automatic method available
echo.
echo   Neither winget nor Chocolatey could install Node.js.
echo   Please install Node.js manually:
echo     https://nodejs.org/en/download/
echo.
exit /b 1

:: ═══════════════════════════════════════════════════════
:: Subroutine: Refresh PATH to pick up newly installed Node
:: ═══════════════════════════════════════════════════════
:RefreshPath
:: Add common Node.js install locations to current PATH
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs"
:: Also pull from the registry for the current user
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "PATH=!PATH!;%%B"
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "PATH=!PATH!;%%B"
exit /b 0
