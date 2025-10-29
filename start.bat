@echo off
echo ========================================
echo   CGG RTP Monitor - Iniciando
echo ========================================
echo.

echo Iniciando Backend (porta 3001)...
start "Backend - CGG RTP Monitor" cmd /k "cd backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Iniciando Frontend (porta 3000)...
start "Frontend - CGG RTP Monitor" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo   Servidores iniciados!
echo ========================================
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:3000
echo ========================================
echo.
echo Pressione qualquer tecla para fechar este terminal...
pause >nul
