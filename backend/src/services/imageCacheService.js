/**
 * Serviço de Cache de Imagens em Base64
 */

import fetch from 'node-fetch';
import db from '../config/database.js';

class ImageCacheService {
  /**
   * Faz download de uma imagem e converte para base64
   * Tenta URL fallback se a URL principal retornar 404
   */
  async downloadAndConvertToBase64(imageUrl, gameId = null) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000 // 10 segundos de timeout
      });

      // Se retornou 404 e temos gameId, tenta URL alternativa
      if (response.status === 404 && gameId) {
        console.log(`⚠️  404 em ${imageUrl}, tentando URL alternativa...`);
        const fallbackUrl = `https://cgg.bet.br/static/v1/casino/game/0/${gameId}/big.webp`;
        return await this.downloadAndConvertToBase64(fallbackUrl, null); // Não tenta fallback recursivo
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Detecta o tipo MIME da imagem
      const contentType = response.headers.get('content-type') || 'image/webp';

      // Converte para base64 com data URI
      const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;

      return base64;
    } catch (error) {
      console.error(`❌ Erro ao baixar imagem ${imageUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Busca imagem em cache ou faz download se não existir
   */
  async getOrCacheImage(gameId, imagePath) {
    if (!imagePath) return null;

    try {
      // Verifica se já existe no cache
      const stmt = db.prepare(`
        SELECT image_base64
        FROM games
        WHERE id = ? AND image_base64 IS NOT NULL
      `);

      const cached = stmt.get(gameId);

      if (cached && cached.image_base64) {
        return cached.image_base64;
      }

      // Se não existe, faz download
      const imageUrl = `https://cgg.bet.br${imagePath}`;
      console.log(`📥 Baixando imagem: ${imagePath}`);

      const base64 = await this.downloadAndConvertToBase64(imageUrl, gameId);

      if (base64) {
        // Salva no cache
        const updateStmt = db.prepare(`
          UPDATE games
          SET image_base64 = ?, image_path = ?
          WHERE id = ?
        `);

        updateStmt.run(base64, imagePath, gameId);
        console.log(`✅ Imagem cacheada: ${imagePath}`);
      }

      return base64;
    } catch (error) {
      console.error(`❌ Erro ao cachear imagem ${imagePath}:`, error.message);
      return null;
    }
  }

  /**
   * Verifica em batch quais jogos NÃO têm imagem cacheada
   * @param {Array} gameIds - Array de IDs de jogos
   * @returns {Set} Set de IDs que precisam de cache
   */
  getGamesWithoutCache(gameIds) {
    if (!gameIds || gameIds.length === 0) return new Set();

    try {
      // Query eficiente: busca IDs que NÃO têm cache
      const placeholders = gameIds.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT id
        FROM games
        WHERE id IN (${placeholders})
        AND (image_base64 IS NULL OR image_base64 = '')
      `);

      const missingCache = stmt.all(...gameIds);
      return new Set(missingCache.map(row => row.id));
    } catch (error) {
      console.error('❌ Erro ao verificar cache:', error.message);
      return new Set(gameIds); // Em caso de erro, assume que todos precisam
    }
  }

  /**
   * Cacheia imagens de múltiplos jogos em batch (processamento assíncrono)
   * OTIMIZADO: Só processa jogos que realmente precisam de cache
   */
  async cacheGameImages(games, maxConcurrent = 3) {
    if (!games || games.length === 0) return [];

    // Filtra apenas jogos com image_path
    const gamesWithPath = games.filter(g => g.image_path);
    if (gamesWithPath.length === 0) return [];

    // Verifica em batch quais jogos NÃO têm cache
    const gameIds = gamesWithPath.map(g => g.game_id);
    const missingCacheIds = this.getGamesWithoutCache(gameIds);

    // Filtra apenas jogos que precisam de cache
    const gamesToCache = gamesWithPath.filter(g => missingCacheIds.has(g.game_id));

    if (gamesToCache.length === 0) {
      // Todos já têm cache, não faz nada
      return [];
    }

    console.log(`📸 Cache de imagens: ${gamesToCache.length} novas imagens para cachear`);

    const queue = [...gamesToCache];
    const results = [];

    // Processa em lotes para não sobrecarregar
    const processBatch = async () => {
      const batch = [];

      while (queue.length > 0 && batch.length < maxConcurrent) {
        const game = queue.shift();
        batch.push(this.getOrCacheImage(game.game_id, game.image_path));
      }

      return await Promise.allSettled(batch);
    };

    // Processa todos os lotes
    while (queue.length > 0) {
      const batchResults = await processBatch();
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`✅ Cache concluído: ${successful}/${gamesToCache.length} imagens salvas`);

    return results;
  }

  /**
   * Retorna imagem em base64 do cache ou null
   */
  getCachedImage(gameId) {
    try {
      const stmt = db.prepare(`
        SELECT image_base64
        FROM games
        WHERE id = ? AND image_base64 IS NOT NULL
      `);

      const result = stmt.get(gameId);
      return result ? result.image_base64 : null;
    } catch (error) {
      console.error(`❌ Erro ao buscar imagem do cache:`, error.message);
      return null;
    }
  }

  /**
   * Limpa cache de imagens antigas (opcional)
   */
  clearOldCache(daysOld = 30) {
    try {
      const stmt = db.prepare(`
        UPDATE games
        SET image_base64 = NULL
        WHERE updated_at < datetime('now', '-${daysOld} days')
      `);

      const result = stmt.run();
      console.log(`🗑️  Cache limpo: ${result.changes} imagens removidas`);
      return result.changes;
    } catch (error) {
      console.error(`❌ Erro ao limpar cache:`, error.message);
      return 0;
    }
  }
}

export default new ImageCacheService();
