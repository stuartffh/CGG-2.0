#!/bin/sh
set -e

echo "=================================================="
echo "  CGG RTP Monitor - Starting Services (Vite Fix)"
echo "  Environment: ${NODE_ENV:-production}"
echo "=================================================="

# Função para handle de sinais (graceful shutdown)
cleanup() {
    echo ""
    echo "Shutting down services..."

    if [ ! -z "$BACKEND_PID" ]; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
    fi

    if [ ! -z "$FRONTEND_PID" ]; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    fi

    wait
    echo "Services stopped"
    exit 0
}

# Configura trap para sinais
trap cleanup SIGTERM SIGINT SIGQUIT

# Cria diretórios se não existirem
mkdir -p /app/logs /app/backend/data

# Inicia o backend em background
echo ""
echo "Starting backend on port ${PORT:-3001}..."
cd /app/backend
node src/server.js > /app/logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Aguarda o backend inicializar
echo "Waiting for backend to initialize..."
sleep 5

# Verifica se o backend está rodando
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "ERROR: Backend failed to start!"
    cat /app/logs/backend.log
    exit 1
fi

# Inicia o frontend em background
echo ""
echo "Starting frontend on port 5173..."
cd /app/frontend

# Instala Vite se não estiver disponível
echo "Checking Vite availability..."
if ! npx vite --version &> /dev/null; then
    echo "Installing Vite..."
    npm install vite@latest
fi

# Verifica se o build existe
if [ ! -d "dist" ]; then
    echo "ERROR: Frontend build not found!"
    echo "Please ensure the frontend is built before running the container."
    exit 1
fi

# Inicia o Vite preview
echo "Starting Vite preview server..."
npx vite preview \
  --host ${HOST:-0.0.0.0} \
  --port 5173 \
  --strictPort false \
  --cors \
  > /app/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

# Aguarda o frontend inicializar
sleep 5

# Verifica se o frontend está rodando
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "ERROR: Frontend failed to start!"
    echo "Frontend logs:"
    cat /app/logs/frontend.log
    exit 1
fi

echo ""
echo "=================================================="
echo "  Services Running Successfully:"
echo "  - Backend:  http://${HOST:-0.0.0.0}:${PORT:-3001}"
echo "  - Frontend: http://${HOST:-0.0.0.0}:5173"
echo "  - WebSocket: ws://${HOST:-0.0.0.0}:${PORT:-3001}"
echo "=================================================="
echo ""
echo "Logs available at:"
echo "  - /app/logs/backend.log"
echo "  - /app/logs/frontend.log"
echo ""

# Monitora os processos e mostra logs
tail -f /app/logs/backend.log /app/logs/frontend.log &
TAIL_PID=$!

# Aguarda os processos principais
wait $BACKEND_PID $FRONTEND_PID

# Limpa tail se os processos principais terminarem
kill $TAIL_PID 2>/dev/null || true

echo "All services stopped"
