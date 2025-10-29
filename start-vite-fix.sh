#!/bin/sh
set -eu

echo "=================================================="
echo "  CGG RTP Monitor - Starting Services (Vite Fix)"
echo "  Environment: ${NODE_ENV:-production}"
echo "=================================================="

# IDs dos processos iniciados
BACKEND_PID=""
FRONTEND_PID=""
TAIL_PID=""

# Função para handle de sinais (graceful shutdown)
cleanup() {
    echo ""
    echo "Shutting down services..."

    if [ -n "$TAIL_PID" ]; then
        echo "Stopping log tail (PID: $TAIL_PID)..."
        kill -TERM "$TAIL_PID" 2>/dev/null || true
    fi

    if [ -n "$BACKEND_PID" ]; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
    fi

    if [ -n "$FRONTEND_PID" ]; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    fi

    wait || true
    echo "Services stopped"
    exit 0
}

# Configura trap para sinais
trap cleanup SIGTERM SIGINT SIGQUIT

# Cria diretórios se não existirem
mkdir -p /app/logs /app/backend/data

# Inicia o backend em background
echo ""
PORT="${PORT:-3001}"
HOST="${HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_CONFIG="${FRONTEND_CONFIG:-}"
FRONTEND_STRICT_PORT="${FRONTEND_STRICT_PORT:-true}"

echo "Starting backend on port ${PORT}..."
cd /app/backend
node src/server.js > /app/logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Aguarda o backend inicializar
echo "Waiting for backend to initialize..."
sleep 5

# Verifica se o backend está rodando
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "ERROR: Backend failed to start!"
    cat /app/logs/backend.log
    exit 1
fi

# Inicia o frontend em background
echo ""
echo "Starting frontend on port ${FRONTEND_PORT}..."
cd /app/frontend

# Instala Vite se não estiver disponível
FRONTEND_INSTALL_LOG="/app/logs/frontend-install.log"

echo "Checking Vite availability..."
if ! npx vite --version >/dev/null 2>&1; then
    echo "Installing Vite runtime dependency..."
    npm install --no-save vite@latest >"$FRONTEND_INSTALL_LOG" 2>&1 || {
        echo "ERROR: Failed to install Vite runtime dependency!"
        cat "$FRONTEND_INSTALL_LOG"
        exit 1
    }
fi

echo "Ensuring @vitejs/plugin-react is available..."
if ! npm ls @vitejs/plugin-react >/dev/null 2>&1; then
    echo "Installing @vitejs/plugin-react runtime dependency..."
    npm install --no-save @vitejs/plugin-react >"$FRONTEND_INSTALL_LOG" 2>&1 || {
        echo "ERROR: Failed to install @vitejs/plugin-react runtime dependency!"
        cat "$FRONTEND_INSTALL_LOG"
        exit 1
    }
fi

# Verifica se o build existe
if [ ! -d "dist" ]; then
    echo "ERROR: Frontend build not found!"
    echo "Please ensure the frontend is built before running the container."
    exit 1
fi

# Inicia o Vite preview
echo "Starting Vite preview server..."

set -- --host "$HOST" --port "$FRONTEND_PORT" --logLevel info
case "$(printf '%s' "$FRONTEND_STRICT_PORT" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on)
        set -- "$@" --strictPort
        ;;
esac

if [ -n "$FRONTEND_CONFIG" ]; then
    set -- "$@" --config "$FRONTEND_CONFIG"
fi

npx vite preview "$@" > /app/logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

# Aguarda o frontend inicializar
sleep 5

# Verifica se o frontend está rodando
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "ERROR: Frontend failed to start!"
    echo "Frontend logs:"
    cat /app/logs/frontend.log
    exit 1
fi

echo ""
echo "=================================================="
echo "  Services Running Successfully:"
echo "  - Backend:  http://${HOST}:${PORT}"
echo "  - Frontend: http://${HOST}:${FRONTEND_PORT}"
echo "  - WebSocket: ws://${HOST}:${PORT}"
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
wait "$BACKEND_PID" "$FRONTEND_PID"

# Limpa tail se os processos principais terminarem
kill "$TAIL_PID" 2>/dev/null || true

echo "All services stopped"
