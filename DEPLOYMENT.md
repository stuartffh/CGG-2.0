# Guia de Deploy no Easypanel

## Configuração de Variáveis de Ambiente

### Backend (Variáveis de Runtime)

Configure estas variáveis na seção **Environment** do seu serviço no Easypanel:

```env
# Porta do servidor backend
PORT=3001

# Intervalo de atualização dos dados RTP (em milissegundos)
UPDATE_INTERVAL=3000

# Modo de debug do protobuf (true para ativar logs detalhados)
DEBUG_PROTOBUF=false

# Configurações de timeout e retry para requisições ao CGG
FETCH_TIMEOUT=10000
MAX_RETRIES=3
RETRY_DELAY=2000

# Host do servidor (0.0.0.0 para aceitar conexões externas)
HOST=0.0.0.0
```

### Frontend - Configuração do Domínio do Backend

**IMPORTANTE:** A URL do backend já está configurada no arquivo `frontend/.env.production` e é automaticamente usada durante o build:

```
VITE_API_URL=wss://rtp-api.zapchatbr.com
```

#### Como Alterar o Domínio do Backend:

Se você precisar usar um domínio diferente de `rtp-api.zapchatbr.com`:

1. Edite o arquivo `frontend/.env.production` no repositório
2. Altere a linha `VITE_API_URL=wss://SEU-DOMINIO-AQUI.com`
3. Faça commit e push das alterações
4. O Easypanel fará rebuild automaticamente

**Não é necessário** adicionar variáveis `VITE_*` no painel de Environment Variables do Easypanel, pois elas já estão no código fonte.

#### Opção Avançada: Sobrescrever via Build Arguments

Se você quiser sobrescrever o domínio sem editar o código:

- **Se o Easypanel suportar Build Args**, adicione:
  ```
  VITE_API_URL=wss://seu-dominio.com
  ```

**IMPORTANTE:**
- Use `wss://` se seu backend estiver em HTTPS (recomendado)
- Use `ws://` apenas se seu backend estiver em HTTP (não seguro)

### Exemplo de Configuração Completa no Easypanel

#### Para o domínio `rtp-games.zapchatbr.com` (Frontend) e `rtp-api.zapchatbr.com` (Backend):

**Environment Variables (apenas runtime - adicione no painel do Easypanel):**
```
PORT=3001
UPDATE_INTERVAL=3000
FETCH_TIMEOUT=10000
MAX_RETRIES=3
RETRY_DELAY=2000
HOST=0.0.0.0
```

**NOTA:** Não é necessário adicionar `VITE_*` nas variáveis de ambiente do Easypanel. A URL do backend está definida em `frontend/.env.production`.

## Verificação

Após o deploy, abra o console do navegador (F12) e procure por:
```
🔌 WebSocket URL: wss://rtp-api.zapchatbr.com
```

Se o URL estiver correto, o frontend está configurado corretamente para se conectar ao backend.

## Troubleshooting

### O frontend não consegue conectar ao backend

1. Verifique se o **Build Argument** `VITE_BACKEND_DOMAIN` ou `VITE_API_URL` foi definido corretamente
2. Abra o console do navegador e verifique qual URL o WebSocket está tentando conectar
3. Se estiver usando `localhost`, significa que a variável não foi passada durante o build
4. Faça um **Rebuild** do container no Easypanel após definir as variáveis

### Erro "Blocked request" no Vite

Se você ver um erro sobre host bloqueado, o `vite.config.js` já está configurado para aceitar:
- `rtp-games.zapchatbr.com`
- Qualquer subdomínio de `.zapchatbr.com`

Se você usar outro domínio, adicione-o em `frontend/vite.config.js` na seção `preview.allowedHosts`.

## Arquitetura

```
┌─────────────────────────────────────┐
│  Frontend (Vite)                    │
│  rtp-games.zapchatbr.com            │
│  Porta: 5173                        │
└──────────────┬──────────────────────┘
               │
               │ WebSocket (wss://)
               │
┌──────────────▼──────────────────────┐
│  Backend (Node.js)                  │
│  rtp-api.zapchatbr.com              │
│  Porta: 3001                        │
└─────────────────────────────────────┘
```

## Notas Importantes

1. **Rebuild Obrigatório**: Sempre que alterar `VITE_API_URL` ou `VITE_BACKEND_DOMAIN`, você DEVE fazer um rebuild completo do container, pois essas variáveis são "baked in" durante o build do Vite.

2. **Portas**: O Easypanel gerencia as portas automaticamente. Você não precisa especificar portas nas URLs públicas (use apenas o domínio).

3. **HTTPS/WSS**: Se seu frontend estiver em HTTPS, o WebSocket DEVE usar WSS (WebSocket Secure). Certifique-se de que seu backend também esteja configurado para aceitar conexões WSS.
