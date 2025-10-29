# 🚀 EasyPanel Deployment Guide - CGG RTP Monitor

## 📋 Pré-requisitos
- EasyPanel configurado e funcionando
- Docker habilitado no EasyPanel
- Acesso ao repositório Git

## 🔧 Configuração no EasyPanel

### 1. Criar Nova Aplicação
- **Nome**: `cgg-rtp-monitor`
- **Tipo**: `Docker`
- **Repositório**: Seu repositório Git
- **Branch**: `main` ou `master`

### 2. Configurações de Build
```yaml
Build Context: ./
Dockerfile: Dockerfile
```

### 3. Variáveis de Ambiente
```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
UPDATE_INTERVAL=3000
```

### 4. Portas
- **Backend**: `3001` (HTTP/WebSocket)
- **Frontend**: `5173` (HTTP)

### 5. Volumes (Opcional)
- **Dados**: `/app/backend/data` → Persistência do banco SQLite
- **Logs**: `/app/logs` → Logs da aplicação

### 6. Health Check
- **Endpoint**: `http://localhost:3001/api/health`
- **Intervalo**: 30s
- **Timeout**: 10s
- **Start Period**: 60s
- **Retries**: 3

## 🐳 Dockerfile Otimizado

### Características:
- ✅ **Multi-stage build** para otimização
- ✅ **Node.js 18 Alpine** (imagem leve)
- ✅ **Usuário não-root** para segurança
- ✅ **Health check** integrado
- ✅ **Graceful shutdown** suportado
- ✅ **Logs estruturados**

### Dependências do Sistema:
- ✅ **Python3** (para better-sqlite3)
- ✅ **Make/G++** (para compilação nativa)
- ✅ **SQLite** (para banco de dados)

## 🔍 Troubleshooting

### Problemas Comuns:

#### 1. Build Falha
```bash
# Verificar se todas as dependências estão no package.json
npm install --production
```

#### 2. Porta Não Acessível
```bash
# Verificar se HOST=0.0.0.0 está configurado
echo $HOST
```

#### 3. Health Check Falha
```bash
# Testar endpoint manualmente
curl http://localhost:3001/api/health
```

#### 4. Frontend Não Carrega
```bash
# Verificar se build foi gerado
ls -la /app/frontend/dist/
```

### Logs Úteis:
```bash
# Backend logs
tail -f /app/logs/backend.log

# Frontend logs  
tail -f /app/logs/frontend.log
```

## 📊 Monitoramento

### Métricas Disponíveis:
- **Status**: `/api/health`
- **Clientes WebSocket**: `clients.size`
- **Uptime**: `process.uptime()`
- **Timestamp**: `Date.now()`

### Endpoints da API:
- `GET /api/health` - Status da aplicação
- `GET /api/games/latest` - Últimos dados de RTP
- `WebSocket /` - Conexão em tempo real

## 🚀 Deploy Steps

1. **Push do código** para o repositório
2. **Configurar aplicação** no EasyPanel
3. **Definir variáveis** de ambiente
4. **Configurar portas** (3001, 5173)
5. **Deploy** e aguardar build
6. **Verificar logs** para erros
7. **Testar endpoints** de saúde

## 🔒 Segurança

### Implementado:
- ✅ Usuário não-root (`nextjs:nodejs`)
- ✅ Portas específicas expostas
- ✅ Health check para monitoramento
- ✅ Graceful shutdown
- ✅ Logs estruturados

### Recomendações:
- 🔐 Usar HTTPS em produção
- 🔐 Configurar CORS adequadamente
- 🔐 Monitorar logs regularmente
- 🔐 Atualizar dependências periodicamente

## 📈 Performance

### Otimizações:
- ✅ Multi-stage build (imagem menor)
- ✅ Dependências de produção apenas
- ✅ Cache limpo após instalação
- ✅ Alpine Linux (base leve)

### Recursos Recomendados:
- **RAM**: 512MB - 1GB
- **CPU**: 0.5 - 1.0 cores
- **Storage**: 1GB (com logs)

## 🆘 Suporte

### Em caso de problemas:
1. Verificar logs da aplicação
2. Testar health check endpoint
3. Verificar variáveis de ambiente
4. Confirmar portas abertas
5. Validar build do Docker

### Comandos Úteis:
```bash
# Entrar no container
docker exec -it <container_id> sh

# Verificar processos
ps aux

# Testar conectividade
wget -O- http://localhost:3001/api/health
```
