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
  console.log('✅ Novo cliente conectado. Total:', clients.size + 1);
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
    console.log('❌ Cliente desconectado. Total:', clients.size - 1);
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ Erro no WebSocket:', error);
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
    console.log('🔄 Buscando dados da API CGG...');

    const data = await cggService.fetchAllRTP();

    if (data.games && data.games.length > 0) {
      console.log(`✅ ${data.games.length} jogos recebidos da API CGG`);

      // Processa jogos com conversão simples de basis points para porcentagem
      const processedGames = RTPCalculator.processGames(data.games);

      console.log(`📊 ${processedGames.length} jogos processados e prontos para envio`);

      // Salva histórico legado (opcional - mantém compatibilidade com tabela existente)
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

      // Cache assíncrono de imagens (não bloqueia envio)
      imageCacheService.cacheGameImages(processedGames, 3).catch(err => {
        console.error('⚠️  Erro no cache de imagens:', err.message);
      });

      // Armazena dados processados para novas conexões
      lastProcessedData = processedGames;

      // Debug: mostra campos importantes do primeiro jogo
      if (processedGames.length > 0) {
        const game = processedGames[0];
        console.log('📤 Dados do primeiro jogo:', {
          game_id: game.game_id,
          game_name: game.game_name,
          provider: game.provider,
          magnitude_bps_daily: game.magnitude_bps_daily,
          sign_daily: game.sign_daily,
          rtp_calculated_daily: game.rtp_calculated_daily,
          magnitude_bps_weekly: game.magnitude_bps_weekly,
          sign_weekly: game.sign_weekly,
          rtp_calculated_weekly: game.rtp_calculated_weekly,
          image_url: game.image_url
        });
      }

      // Broadcast os dados processados para os clientes
      broadcast({
        type: 'update',
        data: processedGames,
        timestamp: data.timestamp
      });

      console.log('✅ Dados enviados para clientes via WebSocket');
    } else {
      console.log('⚠️  Nenhum jogo extraído dos dados');
    }

  } catch (error) {
    console.error('❌ Erro ao atualizar dados:', error.message);

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
  console.log(`🚀 Iniciando atualizações a cada ${UPDATE_INTERVAL}ms`);

  // Primeira atualização imediata
  updateRTPData();

  // Atualizações periódicas
  updateInterval = setInterval(updateRTPData, UPDATE_INTERVAL);
}

function stopUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    console.log('⏸️  Atualizações pausadas');
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
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   🎰 CGG RTP Monitor - Backend Server          ║
╠════════════════════════════════════════════════╣
║   🌐 HTTP Server: http://localhost:${PORT}     ║
║   🔌 WebSocket: ws://localhost:${PORT}         ║
║   ⏱️  Update Interval: ${UPDATE_INTERVAL}ms              ║
╚════════════════════════════════════════════════╝
  `);

  // Inicia as atualizações de RTP
  startUpdates();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor...');
  stopUpdates();
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});
