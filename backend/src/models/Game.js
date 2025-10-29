import db from '../config/database.js';

class Game {
  /**
   * Cria ou atualiza um jogo na tabela de metadados
   */
  static upsertGame(gameData) {
    const {
      id,
      title,
      provider,
      image_path = null,
      rtp_teorico = 0.96,
      volatility = 'medium',
      has_feature_buy = 0,
      has_progressive = 0,
      rtp_feature_buy = null
    } = gameData;

    const stmt = db.prepare(`
      INSERT INTO games (id, title, provider, image_path, rtp_teorico, volatility, has_feature_buy, has_progressive, rtp_feature_buy, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        provider = excluded.provider,
        image_path = excluded.image_path,
        rtp_teorico = excluded.rtp_teorico,
        volatility = excluded.volatility,
        has_feature_buy = excluded.has_feature_buy,
        has_progressive = excluded.has_progressive,
        rtp_feature_buy = excluded.rtp_feature_buy,
        updated_at = datetime('now')
    `);

    return stmt.run(id, title, provider, image_path, rtp_teorico, volatility, has_feature_buy, has_progressive, rtp_feature_buy);
  }

  /**
   * Busca metadados de um jogo
   */
  static getGame(gameId) {
    const stmt = db.prepare('SELECT * FROM games WHERE id = ?');
    return stmt.get(gameId);
  }

  /**
   * Busca todos os jogos
   */
  static getAllGames() {
    const stmt = db.prepare('SELECT * FROM games');
    return stmt.all();
  }

  /**
   * Insere ou atualiza janela temporal de RTP
   */
  static upsertRTPWindow(windowData) {
    const {
      game_id,
      window,
      rtp_delta_api_pp,
      n_spins,
      rtp_observado,
      rtp_post,
      delta_post_pp,
      score,
      confidence,
      trend
    } = windowData;

    // Primeiro, deleta dados antigos desta janela (mantém histórico recente)
    db.prepare(`
      DELETE FROM game_rtp_windows
      WHERE game_id = ? AND window = ?
      AND computed_at < datetime('now', '-1 hour')
    `).run(game_id, window);

    // Insere novo registro
    const stmt = db.prepare(`
      INSERT INTO game_rtp_windows (
        game_id, window, rtp_delta_api_pp, n_spins,
        rtp_observado, rtp_post, delta_post_pp, score,
        confidence, trend, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    return stmt.run(
      game_id, window, rtp_delta_api_pp, n_spins,
      rtp_observado, rtp_post, delta_post_pp, score,
      confidence, trend
    );
  }

  /**
   * Busca última janela temporal de um jogo
   */
  static getLatestRTPWindow(gameId, window) {
    const stmt = db.prepare(`
      SELECT * FROM game_rtp_windows
      WHERE game_id = ? AND window = ?
      ORDER BY computed_at DESC
      LIMIT 1
    `);
    return stmt.get(gameId, window);
  }

  /**
   * Busca todas as janelas de um jogo
   */
  static getAllRTPWindows(gameId) {
    const stmt = db.prepare(`
      SELECT * FROM game_rtp_windows
      WHERE game_id = ?
      ORDER BY window, computed_at DESC
    `);
    return stmt.all(gameId);
  }

  /**
   * Busca dados completos de um jogo (metadados + RTPs)
   */
  static getFullGameData(gameId) {
    const game = this.getGame(gameId);
    if (!game) return null;

    const windows = this.getAllRTPWindows(gameId);

    // Agrupa janelas por tipo
    const daily = windows.find(w => w.window === '24h');
    const weekly = windows.find(w => w.window === '7d');

    return {
      ...game,
      daily,
      weekly
    };
  }

  /**
   * Busca todos os jogos com seus RTPs mais recentes
   */
  static getAllGamesWithRTPs() {
    const query = `
      SELECT
        g.*,
        w24h.rtp_delta_api_pp as daily_delta_api_pp,
        w24h.n_spins as daily_n_spins,
        w24h.rtp_observado as daily_rtp_observado,
        w24h.rtp_post as daily_rtp_post,
        w24h.delta_post_pp as daily_delta_post_pp,
        w24h.score as daily_score,
        w24h.confidence as daily_confidence,
        w7d.rtp_delta_api_pp as weekly_delta_api_pp,
        w7d.n_spins as weekly_n_spins,
        w7d.rtp_observado as weekly_rtp_observado,
        w7d.rtp_post as weekly_rtp_post,
        w7d.delta_post_pp as weekly_delta_post_pp,
        w7d.score as weekly_score,
        w7d.confidence as weekly_confidence
      FROM games g
      LEFT JOIN (
        SELECT game_id, rtp_delta_api_pp, n_spins, rtp_observado, rtp_post,
               delta_post_pp, score, confidence
        FROM game_rtp_windows
        WHERE window = '24h'
        AND computed_at = (
          SELECT MAX(computed_at) FROM game_rtp_windows w2
          WHERE w2.game_id = game_rtp_windows.game_id AND w2.window = '24h'
        )
      ) w24h ON g.id = w24h.game_id
      LEFT JOIN (
        SELECT game_id, rtp_delta_api_pp, n_spins, rtp_observado, rtp_post,
               delta_post_pp, score, confidence
        FROM game_rtp_windows
        WHERE window = '7d'
        AND computed_at = (
          SELECT MAX(computed_at) FROM game_rtp_windows w2
          WHERE w2.game_id = game_rtp_windows.game_id AND w2.window = '7d'
        )
      ) w7d ON g.id = w7d.game_id
    `;

    return db.prepare(query).all();
  }

  /**
   * Atualiza rankings
   */
  static updateRankings(window, rankings) {
    // Limpa rankings antigos desta janela
    db.prepare('DELETE FROM game_rankings WHERE window = ?').run(window);

    // Insere novos rankings
    const insertStmt = db.prepare(`
      INSERT INTO game_rankings (window, game_id, rank_type, position, score, delta_post_pp, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rankings) => {
      rankings.forEach(r => insertStmt.run(
        r.window,
        r.game_id,
        r.rank_type,
        r.position,
        r.score,
        r.delta_post_pp,
        r.confidence
      ));
    });

    insertMany(rankings);
  }

  /**
   * Busca rankings
   */
  static getRankings(window) {
    const stmt = db.prepare(`
      SELECT gr.*, g.title, g.provider, g.rtp_teorico, g.volatility
      FROM game_rankings gr
      JOIN games g ON gr.game_id = g.id
      WHERE gr.window = ?
      ORDER BY gr.rank_type, gr.position
    `);

    const rows = stmt.all(window);

    return {
      best: rows.filter(r => r.rank_type === 'best'),
      worst: rows.filter(r => r.rank_type === 'worst')
    };
  }
}

export default Game;
