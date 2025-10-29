import db from '../config/database.js';

class GameRTP {
  // Insere um novo registro de RTP
  static insert(gameData) {
    const stmt = db.prepare(`
      INSERT INTO game_rtp (game_id, game_name, provider, rtp_daily, rtp_weekly, image_path, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      gameData.game_id,
      gameData.game_name,
      gameData.provider || 'Unknown',
      gameData.rtp_daily,
      gameData.rtp_weekly,
      gameData.image_path || null,
      Date.now()
    );
  }

  // Insere múltiplos registros de uma vez (batch)
  static insertBatch(gamesData) {
    const insert = db.transaction((games) => {
      const stmt = db.prepare(`
        INSERT INTO game_rtp (game_id, game_name, provider, rtp_daily, rtp_weekly, image_path, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const timestamp = Date.now();
      for (const game of games) {
        stmt.run(
          game.game_id,
          game.game_name,
          game.provider || 'Unknown',
          game.rtp_daily,
          game.rtp_weekly,
          game.image_path || null,
          timestamp
        );
      }
    });

    return insert(gamesData);
  }

  // Busca os RTPs mais recentes de todos os jogos
  static getLatest() {
    const stmt = db.prepare(`
      SELECT DISTINCT
        game_id,
        game_name,
        provider,
        rtp_daily,
        rtp_weekly,
        image_path,
        timestamp
      FROM game_rtp
      WHERE timestamp = (
        SELECT MAX(timestamp) FROM game_rtp
      )
      ORDER BY game_name ASC
    `);

    const results = stmt.all();

    // Adiciona a URL da imagem usando o caminho do field4
    return results.map(game => {
      return {
        ...game,
        image_url: game.image_path ? `https://cgg.bet.br${game.image_path}` : null
      };
    });
  }

  // Busca histórico de um jogo específico
  static getGameHistory(gameId, limit = 100) {
    const stmt = db.prepare(`
      SELECT *
      FROM game_rtp
      WHERE game_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const results = stmt.all(gameId, limit);

    return results.map(game => {
      return {
        ...game,
        image_url: game.image_path ? `https://cgg.bet.br${game.image_path}` : null
      };
    });
  }

  // Busca jogos com maior variação de RTP
  static getTopVariations(limit = 10) {
    const stmt = db.prepare(`
      WITH recent_data AS (
        SELECT
          game_id,
          game_name,
          rtp_daily,
          image_path,
          timestamp,
          LAG(rtp_daily) OVER (PARTITION BY game_id ORDER BY timestamp) as prev_rtp
        FROM game_rtp
        WHERE timestamp > ?
      )
      SELECT
        game_id,
        game_name,
        rtp_daily,
        prev_rtp,
        image_path,
        ABS(rtp_daily - prev_rtp) as variation
      FROM recent_data
      WHERE prev_rtp IS NOT NULL
      ORDER BY variation DESC
      LIMIT ?
    `);

    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const results = stmt.all(oneDayAgo, limit);

    return results.map(game => {
      return {
        ...game,
        image_url: game.image_path ? `https://cgg.bet.br${game.image_path}` : null
      };
    });
  }

  // Limpa dados antigos (mantém apenas últimos X dias)
  static cleanOldData(daysToKeep = 7) {
    const stmt = db.prepare(`
      DELETE FROM game_rtp
      WHERE timestamp < ?
    `);

    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    return stmt.run(cutoffTime);
  }

  // Estatísticas gerais
  static getStats() {
    const stmt = db.prepare(`
      SELECT
        COUNT(DISTINCT game_id) as total_games,
        COUNT(*) as total_records,
        MIN(timestamp) as oldest_record,
        MAX(timestamp) as newest_record,
        AVG(rtp_daily) as avg_rtp_daily,
        AVG(rtp_weekly) as avg_rtp_weekly
      FROM game_rtp
    `);

    return stmt.get();
  }
}

export default GameRTP;
