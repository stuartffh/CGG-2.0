# Multi-stage build para otimizar o tamanho da imagem
FROM node:18-alpine AS base

WORKDIR /app

# ==================== BACKEND ====================
FROM base AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production

# ==================== FRONTEND ====================
FROM base AS frontend-deps
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production

# ==================== BUILD FRONTEND ====================
FROM base AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ==================== IMAGEM FINAL ====================
FROM base AS runner

WORKDIR /app

# Copia dependências do backend
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend/package*.json ./backend/
COPY backend/src ./backend/src

# Copia build do frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY --from=frontend-deps /app/frontend/node_modules ./frontend/node_modules
COPY frontend/package*.json ./frontend/
COPY frontend/vite.config.js ./frontend/
COPY frontend/index.html ./frontend/

# Cria diretórios necessários
RUN mkdir -p /app/backend/data /app/logs

# Copia script de inicialização
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expõe as portas
EXPOSE 3001 5173

# Define variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3001
ENV UPDATE_INTERVAL=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Inicia ambos os serviços
CMD ["/app/start.sh"]
