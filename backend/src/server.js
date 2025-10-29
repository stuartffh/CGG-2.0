import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import cggService from './services/cggService.js';
import GameRTP from './models/GameRTP.js';
import Game from './models/Game.js';
import RTPCalculator from './services/rtpCalculator.js';
import imageCacheService from './services/imageCacheService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Criar servidor HTTP
const server = http.createServer(app);

// Criar WebSocket Server
const wss = new WebSocketServer({ server });

// Armazena os clientes conectados
const clients = new Set();

// Armazena os últimos dados processados (para enviar em novas conexões)
let lastProcessedData = null;

// Gerenciamento de conexões WebSocket
wss.on('connection', (ws) => {
  clients.add(ws);

  // Envia dados atuais imediatamente ao conectar (se disponível)
  if (lastProcessedData) {
    ws.send(JSON.stringify({
      type: 'initial',
      data: lastProcessedData,
      timestamp: Date.now()
    }));
  }

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket ERROR:', error.message);
    clients.delete(ws);
  });
});

// Função para broadcast para todos os clientes
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Função principal de atualização
async function updateRTPData() {
  try {
    const data = await cggService.fetchAllRTP();

    if (data.games && data.games.length > 0) {
      const processedGames = RTPCalculator.processGames(data.games);

      // Salva histórico (silenciosamente)
      for (const game of processedGames) {
        try {
          GameRTP.insert({
            game_id: game.game_id,
            game_name: game.game_name,
            provider: game.provider,
            rtp_daily: game.rtp_calculated_daily,
            rtp_weekly: game.rtp_calculated_weekly,
            image_path: game.image_url,
            timestamp: data.timestamp
          });
        } catch (dbError) {
          // Ignora erros de banco - não é crítico
        }
      }

      // Cache assíncrono de imagens
      imageCacheService.cacheGameImages(processedGames, 3).catch(err => {
        console.error('❌ Image cache ERROR:', err.message);
      });

      lastProcessedData = processedGames;

      // Broadcast os dados processados
      broadcast({
        type: 'update',
        data: processedGames,
        timestamp: data.timestamp
      });
    }

  } catch (error) {
    console.error('❌ UPDATE ERROR:', error.message);

    broadcast({
      type: 'error',
      message: error.message,
      timestamp: Date.now()
    });
  }
}

// Inicia o loop de atualização
let updateInterval;

function startUpdates() {
  updateRTPData();
  updateInterval = setInterval(updateRTPData, UPDATE_INTERVAL);
}

function stopUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
}

// Rotas da API REST
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

app.get('/api/games/latest', (req, res) => {
  try {
    const data = GameRTP.getLatest();
    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/games/:gameId/history', (req, res) => {
  try {
    const { gameId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const data = GameRTP.getGameHistory(gameId, limit);

    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = GameRTP.getStats();

    res.json({
      success: true,
      data: stats,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/games/top-variations', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = GameRTP.getTopVariations(limit);

    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Controle de atualizações
app.post('/api/updates/start', (req, res) => {
  startUpdates();
  res.json({ success: true, message: 'Atualizações iniciadas' });
});

app.post('/api/updates/stop', (req, res) => {
  stopUpdates();
  res.json({ success: true, message: 'Atualizações pausadas' });
});

// Limpeza de dados antigos
app.post('/api/cleanup', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const result = GameRTP.cleanOldData(days);

    res.json({
      success: true,
      message: `Dados com mais de ${days} dias removidos`,
      changes: result.changes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Iniciar servidor
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   🎰 CGG RTP Monitor - Backend Server          ║
╠════════════════════════════════════════════════╣
║   🌐 HTTP Server: http://${HOST}:${PORT}        ║
║   🔌 WebSocket: ws://${HOST}:${PORT}         ║
║   ⏱️  Update Interval: ${UPDATE_INTERVAL}ms              ║
╚════════════════════════════════════════════════╝
  `);

  // Inicia as atualizações de RTP
  startUpdates();
});

// Graceful shutdown
process.on('SIGINT', () => {
  stopUpdates();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  stopUpdates();
  server.close(() => {
    process.exit(0);
  });
});
