#!/bin/sh
set -e

echo "=================================================="
echo "  CGG RTP Monitor - Starting Services"
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

# Inicia o backend em background
echo ""
echo "Starting backend on port ${PORT:-3001}..."
cd /app/backend
node src/server.js > /app/logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Aguarda um pouco para o backend inicializar
sleep 2

# Inicia o frontend em background
echo ""
echo "Starting frontend on port 5173..."
cd /app/frontend
node_modules/.bin/vite preview --host 0.0.0.0 --port 5173 > /app/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "=================================================="
echo "  Services Running:"
echo "  - Backend:  http://localhost:${PORT:-3001}"
echo "  - Frontend: http://localhost:5173"
echo "  - WebSocket: ws://localhost:${PORT:-3001}"
echo "=================================================="
echo ""
echo "Logs available at:"
echo "  - /app/logs/backend.log"
echo "  - /app/logs/frontend.log"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Monitora os processos e mostra logs
tail -f /app/logs/backend.log /app/logs/frontend.log &
TAIL_PID=$!

# Aguarda os processos principais
wait $BACKEND_PID $FRONTEND_PID

# Limpa tail se os processos principais terminarem
kill $TAIL_PID 2>/dev/null || true

echo "All services stopped"
