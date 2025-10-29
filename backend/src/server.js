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
      console.log(`✅ ${data.games.length} jogos processados com sucesso!`);

      // Processa jogos com cálculos estatísticos Bayesianos
      const processedGames = [];

      for (const game of data.games) {
        try {
          // Upsert metadados do jogo
          Game.upsertGame({
            id: game.game_id,
            title: game.game_name,
            provider: game.provider,
            image_path: game.image_path,
            rtp_teorico: 0.96, // Base padrão
            volatility: 'medium', // Padrão, pode ser enriquecido futuramente
            has_feature_buy: 0,
            has_progressive: 0
          });

          // Processa cálculos estatísticos
          const processed = RTPCalculator.processGame({
            game_id: game.game_id,
            game_name: game.game_name,
            provider: game.provider,
            rtp_teorico: 0.96,
            volatility: 'medium',
            has_progressive: false,
            magnitude_bps_daily: game.magnitude_bps_daily, // Field 5 = magnitude em basis points
            sign_daily: game.sign_daily, // Field 6 = sinal (-1, 0, 1)
            magnitude_bps_weekly: game.magnitude_bps_weekly,
            sign_weekly: game.sign_weekly,
            n_spins_daily: 0, // Não temos número de spins ainda
            n_spins_weekly: 0
          });

          // Salva janela diária (se disponível)
          if (processed.daily) {
            Game.upsertRTPWindow({
              game_id: game.game_id,
              window: '24h',
              ...processed.daily
            });
          }

          // Salva janela semanal (se disponível)
          if (processed.weekly) {
            Game.upsertRTPWindow({
              game_id: game.game_id,
              window: '7d',
              ...processed.weekly
            });
          }

          processedGames.push({
            ...game,
            ...processed
          });

        } catch (gameError) {
          console.error(`⚠️  Erro ao processar jogo ${game.game_id}:`, gameError.message);
        }
      }

      // Gera rankings para ambas as janelas
      try {
        const rankings24h = RTPCalculator.generateRankings(processedGames, '24h', 10);
        const rankings7d = RTPCalculator.generateRankings(processedGames, '7d', 10);

        // Salva rankings diários
        const dailyRankings = [
          ...rankings24h.best.map((g, idx) => ({
            window: '24h',
            game_id: g.game_id,
            rank_type: 'best',
            position: idx + 1,
            score: g.score,
            delta_post_pp: g.delta_post_pp,
            confidence: g.confidence
          })),
          ...rankings24h.worst.map((g, idx) => ({
            window: '24h',
            game_id: g.game_id,
            rank_type: 'worst',
            position: idx + 1,
            score: g.score,
            delta_post_pp: g.delta_post_pp,
            confidence: g.confidence
          }))
        ];

        // Salva rankings semanais
        const weeklyRankings = [
          ...rankings7d.best.map((g, idx) => ({
            window: '7d',
            game_id: g.game_id,
            rank_type: 'best',
            position: idx + 1,
            score: g.score,
            delta_post_pp: g.delta_post_pp,
            confidence: g.confidence
          })),
          ...rankings7d.worst.map((g, idx) => ({
            window: '7d',
            game_id: g.game_id,
            rank_type: 'worst',
            position: idx + 1,
            score: g.score,
            delta_post_pp: g.delta_post_pp,
            confidence: g.confidence
          }))
        ];

        Game.updateRankings('24h', dailyRankings);
        Game.updateRankings('7d', weeklyRankings);

        console.log('📊 Rankings atualizados (24h e 7d)');
      } catch (rankError) {
        console.error('⚠️  Erro ao gerar rankings:', rankError.message);
      }

      // Mapeia para o formato esperado pelo frontend
      const formattedGames = processedGames.map(g => ({
        ...g,
        // Adiciona campos compatíveis com o frontend (em porcentagem)
        rtp_calculated_daily: g.daily?.rtp_observado ? g.daily.rtp_observado * 100 : null,
        rtp_calculated_weekly: g.weekly?.rtp_observado ? g.weekly.rtp_observado * 100 : null
      }));

      // Armazena dados processados para novas conexões
      lastProcessedData = formattedGames;

      // Broadcast os dados processados para os clientes
      // Debug: mostra campos importantes do primeiro jogo
      if (formattedGames.length > 0) {
        const game = formattedGames[0];
        console.log('📤 Dados do primeiro jogo:', {
          game_id: game.game_id,
          game_name: game.game_name,
          magnitude_bps_daily: game.magnitude_bps_daily,
          sign_daily: game.sign_daily,
          magnitude_bps_weekly: game.magnitude_bps_weekly,
          sign_weekly: game.sign_weekly,
          rtp_observado_daily: game.daily?.rtp_observado,
          rtp_observado_weekly: game.weekly?.rtp_observado,
          rtp_calculated_daily: game.rtp_calculated_daily,
          rtp_calculated_weekly: game.rtp_calculated_weekly,
          image_url: game.image_url,
          has_daily: !!game.daily,
          has_weekly: !!game.weekly
        });
      }

      broadcast({
        type: 'update',
        data: formattedGames,
        timestamp: data.timestamp
      });

      // Salva também no banco legado para histórico
      try {
        // Mapeia processedGames para o formato esperado pelo banco legado
        const legacyGames = processedGames.map(g => ({
          game_id: g.game_id,
          game_name: g.game_name,
          provider: g.provider,
          rtp_daily: g.daily?.rtp_observado ? g.daily.rtp_observado * 100 : null, // Converte para %
          rtp_weekly: g.weekly?.rtp_observado ? g.weekly.rtp_observado * 100 : null, // Converte para %
          image_path: g.image_path
        }));

        GameRTP.insertBatch(legacyGames);
        console.log('💾 Dados salvos no banco de dados');

        // Cache de imagens em background (não bloqueia o processamento)
        imageCacheService.cacheGameImages(processedGames, 5).catch(err => {
          console.error('⚠️  Erro ao cachear imagens:', err.message);
        });
      } catch (dbError) {
        console.error('⚠️  Erro ao salvar no banco legado:', dbError.message);
      }
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
