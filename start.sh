#!/bin/sh
set -eu

# Wrapper para manter compatibilidade retroativa
exec /app/start-vite-fix.sh "$@"
