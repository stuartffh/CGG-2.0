# 🎰 CGG RTP Monitor

Sistema de monitoramento em tempo real dos RTPs (Return to Player) dos jogos da plataforma CGG.bet.br.

## 📋 Características

- ✅ Monitoramento em tempo real a cada 3 segundos
- ✅ WebSocket para atualizações instantâneas
- ✅ Banco de dados SQLite com WAL para armazenamento histórico
- ✅ Interface React moderna e responsiva
- ✅ Visualização de RTP diário e semanal
- ✅ Sistema de busca e filtros
- ✅ Exibição de tendências (alta/baixa) dos RTPs
- ✅ Imagens dos jogos integradas

## 🏗️ Arquitetura

```
CGG-2.0/
├── backend/          # Servidor Node.js + Express + WebSocket
│   ├── src/
│   │   ├── config/   # Configuração do banco de dados
│   │   ├── models/   # Modelos de dados
│   │   ├── services/ # Serviço de integração com API CGG
│   │   └── server.js # Servidor principal
│   └── data/         # Banco de dados SQLite
│
└── frontend/         # Aplicação React
    └── src/
        ├── components/ # Componentes React
        ├── hooks/      # Hooks customizados
        ├── services/   # Serviços
        └── styles/     # Estilos CSS
```

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+ instalado
- npm ou yarn

### 1. Instalação do Backend

```bash
cd backend
npm install
```

### 2. Configuração do Backend

Crie um arquivo `.env` na pasta `backend/` baseado no `.env.example`:

```env
PORT=3001
CGG_AUTHORIZATION=seu_token_de_autorizacao
CGG_COOKIES=seus_cookies
UPDATE_INTERVAL=3000
```

**Importante:** Você precisa obter seu token de autorização e cookies do site CGG.bet.br:

1. Acesse https://cgg.bet.br
2. Abra as ferramentas de desenvolvedor (F12)
3. Vá para a aba Network
4. Faça login e navegue até a área de jogos
5. Encontre uma requisição para `live-rtp`
6. Copie os valores de `authorization` e `cookie` dos headers

### 3. Instalação do Frontend

```bash
cd frontend
npm install
```

## ▶️ Executando o Projeto

### Iniciar o Backend

```bash
cd backend
npm run dev
```

O servidor estará rodando em:
- HTTP: `http://localhost:3001`
- WebSocket: `ws://localhost:3001`

### Iniciar o Frontend

Em outro terminal:

```bash
cd frontend
npm run dev
```

A aplicação estará disponível em: `http://localhost:3000`

## 📡 API Endpoints

### REST API

- `GET /api/health` - Status do servidor
- `GET /api/games/latest` - Últimos RTPs de todos os jogos
- `GET /api/games/:gameId/history` - Histórico de um jogo específico
- `GET /api/games/top-variations` - Jogos com maior variação de RTP
- `GET /api/stats` - Estatísticas gerais
- `POST /api/updates/start` - Iniciar atualizações automáticas
- `POST /api/updates/stop` - Pausar atualizações automáticas
- `POST /api/cleanup?days=7` - Limpar dados antigos

### WebSocket

O WebSocket envia mensagens no formato:

```json
{
  "type": "update",
  "data": [...],
  "timestamp": 1234567890
}
```

Tipos de mensagem:
- `initial` - Dados iniciais ao conectar
- `update` - Atualização periódica
- `error` - Erro no servidor

## 🗄️ Banco de Dados

O projeto usa SQLite com WAL (Write-Ahead Logging) para melhor performance em operações concorrentes.

### Tabelas

**game_rtp**
- Armazena todas as leituras de RTP
- Indexado por game_id e timestamp
- Mantém histórico completo

**game_rtp_hourly**
- Agregação por hora
- Médias, mínimos e máximos
- Otimizado para consultas de longo prazo

## 🎨 Personalização

### Alterar Intervalo de Atualização

Edite o `.env` do backend:

```env
UPDATE_INTERVAL=5000  # 5 segundos
```

### Alterar Porta do Backend

```env
PORT=3002
```

Lembre-se de atualizar a URL do WebSocket no frontend (`frontend/src/App.jsx`):

```javascript
const WS_URL = 'ws://localhost:3002';
```

## 🐛 Debug

Ative o modo debug na interface clicando no botão "🐛 Debug OFF". Isso mostrará:
- Dados brutos recebidos do servidor
- Estrutura das mensagens WebSocket
- Informações do protobuf

## ⚠️ Observações Importantes

### Protobuf Parser

A API CGG retorna dados em formato Protocol Buffers. O parser atual é básico e mostra os dados brutos para análise. Para decodificar corretamente:

1. Analise os dados retornados no modo debug
2. Identifique a estrutura do protobuf
3. Atualize o método `parseProtobuf` em `backend/src/services/cggService.js`

### Token de Autorização

O token JWT tem validade limitada. Quando expirar, você precisará:
1. Fazer login novamente no site
2. Capturar novo token
3. Atualizar o arquivo `.env`

## 📊 Funcionalidades Futuras

- [ ] Decodificação completa do protobuf
- [ ] Gráficos de histórico com Recharts
- [ ] Alertas de variação de RTP
- [ ] Exportação de dados (CSV, JSON)
- [ ] Filtros por provedor
- [ ] Favoritos
- [ ] Comparação entre jogos

## 📝 Licença

Este projeto é para fins educacionais e de monitoramento pessoal.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se livre para abrir issues ou pull requests.
