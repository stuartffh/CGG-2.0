# Multi-stage build otimizado para EasyPanel
FROM node:18-alpine AS base

# Instala dependências do sistema necessárias
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

WORKDIR /app

# ==================== BACKEND ====================
FROM base AS backend-deps
WORKDIR /app/backend

# Copia package files
COPY backend/package*.json ./

# Instala dependências (incluindo devDependencies para build)
RUN npm ci

# ==================== FRONTEND ====================
FROM base AS frontend-deps
WORKDIR /app/frontend

# Copia package files
COPY frontend/package*.json ./

# Instala dependências (incluindo devDependencies para build)
RUN npm ci

# ==================== BUILD FRONTEND ====================
FROM frontend-deps AS frontend-build

# Copia código fonte
COPY frontend/ ./

# Build da aplicação
RUN npm run build

# ==================== IMAGEM FINAL ====================
FROM base AS runner

WORKDIR /app

# Instala apenas dependências de produção do backend
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production && npm cache clean --force

# Volta para diretório raiz
WORKDIR /app

# Copia código do backend
COPY backend/src ./backend/src

# Copia build do frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY frontend/package*.json ./frontend/
COPY frontend/vite.config.js ./frontend/
COPY frontend/vite.production.config.js ./frontend/
COPY frontend/index.html ./frontend/

# Instala apenas vite para preview (produção)
WORKDIR /app/frontend
RUN npm ci --only=production && npm cache clean --force

# Volta para diretório raiz
WORKDIR /app

# Cria diretórios necessários
RUN mkdir -p /app/backend/data /app/logs

# Copia script de inicialização
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Cria usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Muda ownership dos arquivos
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expõe as portas (EasyPanel precisa de portas específicas)
EXPOSE 3001 5173

# Define variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3001
ENV UPDATE_INTERVAL=3000
ENV HOST=0.0.0.0

# Health check otimizado para EasyPanel
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Inicia ambos os serviços
CMD ["/app/start.sh"]