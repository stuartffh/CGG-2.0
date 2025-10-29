# Docker - CGG RTP Monitor

Este documento contém instruções para executar o CGG RTP Monitor usando Docker.

## Estrutura

O Dockerfile cria um container único que executa:
- **Backend** (porta 3001): API Node.js + WebSocket
- **Frontend** (porta 5173): Interface Vite/React

Ambos os serviços são gerenciados por um script shell simples (`start.sh`) compatível com Easypanel e outras plataformas.

## Build da Imagem

```bash
# Build da imagem
docker build -t cgg-rtp-monitor .

# Build com tag específica
docker build -t cgg-rtp-monitor:latest .
```

## Executar Container

### Modo básico:
```bash
docker run -d \
  --name cgg-monitor \
  -p 3001:3001 \
  -p 5173:5173 \
  cgg-rtp-monitor
```

### Com variáveis de ambiente customizadas:
```bash
docker run -d \
  --name cgg-monitor \
  -p 3001:3001 \
  -p 5173:5173 \
  -e UPDATE_INTERVAL=5000 \
  -e PORT=3001 \
  cgg-rtp-monitor
```

### Com volume para persistência do banco de dados:
```bash
docker run -d \
  --name cgg-monitor \
  -p 3001:3001 \
  -p 5173:5173 \
  -v $(pwd)/data:/app/backend/data \
  cgg-rtp-monitor
```

## Acessar a Aplicação

Após iniciar o container:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **WebSocket**: ws://localhost:3001
- **Health Check**: http://localhost:3001/api/health

## Gerenciar Container

```bash
# Ver logs (ambos os serviços)
docker logs -f cgg-monitor

# Ver status do container
docker ps | grep cgg-monitor

# Parar container
docker stop cgg-monitor

# Iniciar container parado
docker start cgg-monitor

# Remover container
docker rm -f cgg-monitor
```

## Logs

Os logs são gravados em `/app/logs/` dentro do container:

```bash
# Ver logs do backend
docker exec cgg-monitor tail -f /app/logs/backend.log

# Ver logs do frontend
docker exec cgg-monitor tail -f /app/logs/frontend.log

# Ver últimas 100 linhas do backend
docker exec cgg-monitor tail -n 100 /app/logs/backend.log

# Copiar logs para o host
docker cp cgg-monitor:/app/logs ./logs
```

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `NODE_ENV` | `production` | Ambiente de execução |
| `PORT` | `3001` | Porta do backend |
| `UPDATE_INTERVAL` | `3000` | Intervalo de atualização (ms) |

## Health Check

O container possui um health check automático que verifica o backend a cada 30 segundos:

```bash
# Ver status do health check
docker inspect --format='{{json .State.Health}}' cgg-monitor | jq

# Checar manualmente
curl http://localhost:3001/api/health
```

## Deploy no Easypanel

O Dockerfile foi otimizado para funcionar perfeitamente no Easypanel:

1. **Crie um novo serviço** no Easypanel
2. **Configure o repositório Git** ou faça upload do código
3. **Defina as portas**:
   - Backend: 3001
   - Frontend: 5173
4. **Variáveis de ambiente** (opcional):
   ```
   UPDATE_INTERVAL=3000
   PORT=3001
   ```
5. **Deploy**

O script `start.sh` garante que ambos os processos rodam corretamente e respondem aos sinais de shutdown do container.

## Troubleshooting

### Container não inicia:
```bash
# Ver logs de erro
docker logs cgg-monitor

# Verificar se as portas estão ocupadas
netstat -an | grep 3001
netstat -an | grep 5173
```

### Serviços não respondem:
```bash
# Entrar no container
docker exec -it cgg-monitor sh

# Verificar se os processos estão rodando
ps aux | grep node

# Verificar logs
cat /app/logs/backend.log
cat /app/logs/frontend.log
```

### Banco de dados corrompido:
```bash
# Parar container
docker stop cgg-monitor

# Remover dados antigos
rm -rf data/

# Reiniciar container
docker start cgg-monitor
```

## Multi-stage Build

O Dockerfile usa multi-stage build para otimizar:
1. **base**: Node.js 18 Alpine
2. **backend-deps**: Dependências de produção do backend
3. **frontend-deps**: Dependências de produção do frontend
4. **frontend-build**: Build otimizado do React/Vite
5. **runner**: Imagem final com apenas o necessário

Isso resulta em uma imagem final menor (~200MB) e mais eficiente.

## Produção

Para produção, considere:

1. **Volume para dados**: `-v /path/to/data:/app/backend/data`
2. **Logs externos**: `-v /path/to/logs:/app/logs`
3. **Reverse proxy**: Nginx/Traefik/Caddy na frente
4. **Limitar recursos**: `--memory="1g" --cpus="1.0"`
5. **Restart policy**: `--restart unless-stopped`

Exemplo completo:
```bash
docker run -d \
  --name cgg-monitor \
  --restart unless-stopped \
  -p 3001:3001 \
  -p 5173:5173 \
  -v $(pwd)/data:/app/backend/data \
  -v $(pwd)/logs:/app/logs \
  --memory="1g" \
  --cpus="1.0" \
  -e UPDATE_INTERVAL=3000 \
  cgg-rtp-monitor
```

## Graceful Shutdown

O script `start.sh` implementa graceful shutdown:
- Responde corretamente a `SIGTERM` e `SIGINT`
- Encerra os processos backend e frontend de forma ordenada
- Aguarda os processos terminarem antes de sair

Isso garante que o container pode ser parado/reiniciado sem perda de dados.

## Remover Tudo

```bash
# Parar e remover container
docker stop cgg-monitor && docker rm cgg-monitor

# Remover imagem
docker rmi cgg-rtp-monitor

# Remover volumes órfãos
docker volume prune -f

# Limpar tudo do Docker
docker system prune -af
```

## Debugging

```bash
# Entrar no container
docker exec -it cgg-monitor sh

# Verificar estrutura de arquivos
ls -la /app/

# Verificar processos
ps aux

# Testar backend manualmente
cd /app/backend && node src/server.js

# Testar frontend manualmente
cd /app/frontend && node_modules/.bin/vite preview --host 0.0.0.0 --port 5173
```
