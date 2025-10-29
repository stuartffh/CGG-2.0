@echo off
echo ========================================
echo   CGG RTP Monitor - Instalacao
echo ========================================
echo.

echo [1/4] Instalando dependencias do backend...
cd backend
call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias do backend
    pause
    exit /b 1
)
echo.

echo [2/4] Criando pasta de dados...
if not exist "data" mkdir data
echo.

echo [3/4] Instalando dependencias do frontend...
cd ..\frontend
call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias do frontend
    pause
    exit /b 1
)
echo.

echo ========================================
echo   Instalacao concluida com sucesso!
echo ========================================
echo.
echo Para iniciar o projeto:
echo   1. Backend:  cd backend ^&^& npm run dev
echo   2. Frontend: cd frontend ^&^& npm run dev
echo.
pause
