@echo off
title Gemini Pilot — Auto Installer
color 0A

echo.
echo   ========================================
echo   =                                      =
echo   =   Gemini Pilot — Auto Installer      =
echo   =                                      =
echo   =   Do not close this window!           =
echo   =                                      =
echo   ========================================
echo.

echo   [1/6] Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo   Installing Node.js via winget...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% neq 0 (
        echo   ERROR: Failed to install Node.js.
        echo   Please install Node.js manually from https://nodejs.org
        pause
        exit /b 1
    )
    :: Refresh PATH
    set "PATH=%PATH%;%ProgramFiles%\nodejs"
    echo   Node.js installed!
) else (
    for /f "tokens=*" %%i in ('node --version') do echo   Node.js %%i found
)

echo.
echo   [2/6] Checking Gemini CLI...
where gemini >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo   Installing Gemini CLI...
    call npm install -g @google/gemini-cli
) else (
    echo   Gemini CLI found
)

echo.
echo   [3/6] Installing dependencies...
call npm install --no-fund --no-audit

echo.
echo   [4/6] Building...
call npm run build

echo.
echo   [5/6] Registering 'gp' command...
call npm link

echo.
echo   [6/6] Running setup...
node dist\cli\index.js setup

echo.
echo   ========================================
echo   =                                      =
echo   =   Installation Complete!             =
echo   =                                      =
echo   =   Open CMD or PowerShell and try:    =
echo   =     gp harness                       =
echo   =     gp ask "question"                =
echo   =     gp team 3                        =
echo   =     gp --help                        =
echo   =                                      =
echo   ========================================
echo.
pause
