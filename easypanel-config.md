# EasyPanel Configuration for CGG RTP Monitor

## Environment Variables
# Required for EasyPanel deployment
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
UPDATE_INTERVAL=3000

# Optional: Database configuration
DB_PATH=/app/backend/data/rtp_monitor.db

# Optional: CORS settings
CORS_ORIGIN=*

## Ports
# Backend API and WebSocket
3001

# Frontend (Vite Preview)
5173

## Health Check
# Endpoint: http://localhost:3001/api/health
# Expected response: 200 OK

## Volumes
# Data persistence
/app/backend/data:/app/backend/data

# Logs (optional)
/app/logs:/app/logs

## Resource Limits (recommended)
# Memory: 512MB - 1GB
# CPU: 0.5 - 1.0 cores

## Build Context
# Make sure to build from project root directory
# docker build -t cgg-rtp-monitor .

## Notes
# - Uses multi-stage build for optimization
# - Includes health check for EasyPanel monitoring
# - Runs as non-root user for security
# - Supports graceful shutdown
# - Logs are available in /app/logs/
