import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/rtp_monitor.db');

// Cria a conexão com SQLite (verbose desabilitado para reduzir logs)
const db = new Database(dbPath);

// Habilita WAL (Write-Ahead Logging) para melhor performance em operações concorrentes
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB de cache

// Cria as tabelas se não existirem
const initDB = () => {
  // Tabela principal de metadados dos jogos
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider TEXT,
      image_path TEXT,
      image_base64 TEXT,
      rtp_teorico REAL DEFAULT 0.96,
      volatility TEXT DEFAULT 'medium',
      has_feature_buy INTEGER DEFAULT 0,
      has_progressive INTEGER DEFAULT 0,
      rtp_feature_buy REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migração: adiciona colunas de imagem se não existirem
  try {
    db.exec(`ALTER TABLE games ADD COLUMN image_path TEXT`);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }
  try {
    db.exec(`ALTER TABLE games ADD COLUMN image_base64 TEXT`);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }

  // Tabela de janelas temporais com cálculos estatísticos
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_rtp_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      window TEXT NOT NULL,
      rtp_delta_api_pp REAL,
      n_spins BIGINT,
      rtp_observado REAL,
      rtp_post REAL,
      delta_post_pp REAL,
      score REAL,
      confidence TEXT,
      trend TEXT,
      computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rtp_windows_game ON game_rtp_windows(game_id);
    CREATE INDEX IF NOT EXISTS idx_rtp_windows_window ON game_rtp_windows(window);
    CREATE INDEX IF NOT EXISTS idx_rtp_windows_computed ON game_rtp_windows(computed_at);
  `);

  // Tabela legada de histórico bruto (mantém compatibilidade)
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_rtp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      game_name TEXT NOT NULL,
      provider TEXT,
      rtp_daily REAL,
      rtp_weekly REAL,
      image_path TEXT,
      timestamp INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_game_id ON game_rtp(game_id);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON game_rtp(timestamp);
    CREATE INDEX IF NOT EXISTS idx_game_timestamp ON game_rtp(game_id, timestamp);
  `);

  // Migração: adiciona coluna image_path se não existir
  try {
    db.exec(`ALTER TABLE game_rtp ADD COLUMN image_path TEXT`);
  } catch (e) {
    // Coluna já existe, ignorar erro
  }

  // Tabela de rankings (atualizad em tempo real)
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_rankings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      window TEXT NOT NULL,
      game_id TEXT NOT NULL,
      rank_type TEXT NOT NULL,
      position INTEGER,
      score REAL,
      delta_post_pp REAL,
      confidence TEXT,
      computed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rankings_window ON game_rankings(window, rank_type);
    CREATE INDEX IF NOT EXISTS idx_rankings_computed ON game_rankings(computed_at);
  `);

  console.log('✅ Banco de dados inicializado com WAL habilitado');
};

initDB();

export default db;
