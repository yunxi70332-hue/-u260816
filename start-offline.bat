@echo off
setlocal
cd /d "%~dp0"

if not exist "dist\index.html" (
  echo Offline build was not found.
  echo Run npm install and npm run build once, then double-click this file again.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js, or use start-windows.bat after npm install.
  pause
  exit /b 1
)

echo Starting local offline USM module builder...
echo This uses 127.0.0.1 only and does not need internet.
node "%~dp0scripts\offline-server.mjs"
endlocal
