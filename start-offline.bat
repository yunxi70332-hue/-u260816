@echo off
setlocal
cd /d "%~dp0"

if not exist "dist\index.html" (
  echo Offline build was not found.
  echo Run npm install and npm run build once, then double-click this file again.
  pause
  exit /b 1
)

echo Opening offline USM module builder...
start "" "%cd%\dist\index.html"
endlocal
