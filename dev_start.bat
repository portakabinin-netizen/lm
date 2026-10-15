@echo off
echo Starting Hipk Development Environment...

:: Launch Frontend in Normal Command Prompt
start "HIPK-FRONTEND" cmd /k "cd /d c:\hipk && npx expo start -c"

:: Launch Backend in PowerShell
start "HIPK-BACKEND" powershell -NoExit -Command "cd c:\hipk\backend; npm run dev"

echo Done. Terminals are opening...
timeout /t 3
