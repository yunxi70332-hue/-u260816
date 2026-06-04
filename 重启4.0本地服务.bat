@echo off
cd /d "%~dp0"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5174"') do (
  taskkill /F /PID %%p >nul 2>nul
)

start "USM 4.0 Local" cmd /k "npm.cmd run dev:4"

timeout /t 2 >nul
start "" "http://127.0.0.1:5174/"
