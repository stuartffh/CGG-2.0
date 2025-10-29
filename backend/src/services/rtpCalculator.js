/**
 * Serviço de cálculo estatístico de RTP com ajuste Bayesiano
 * Implementa shrinkage para corrigir variações de amostras pequenas
 */

class RTPCalculator {
  // Parâmetros k (força do prior) por volatilidade
  static K_VALUES = {
    low: 50000,
    medium: 100000,
    high: 150000,
    very_high: 200000
  };

  /**
   * Calcula o RTP observado a partir da magnitude e sinal da API
   * @param {number} rtpTeorico - RTP teórico do jogo (ex: 0.96)
   * @param {number} magnitudeBps - Magnitude em basis points (ex: 20335 = 2.0335 pontos percentuais)
   * @param {number} sign - Sinal (-1 = negativo, 0 = neutro, 1 = positivo)
   * @returns {number} RTP observado
   */
  static calculateObservedRTP(rtpTeorico, magnitudeBps, sign) {
    if (magnitudeBps == null || sign == null) {
      return rtpTeorico; // Sem dados, retorna teórico
    }

    // Converte basis points para pontos percentuais: 20335 → 2.0335 pp
    // 1 basis point = 0.01% = 0.0001 em fração
    // Então: magnitudeBps / 10000 = delta em pontos percentuais
    const deltaPP = magnitudeBps / 10000;

    // Converte pontos percentuais para fração decimal: 2.0335 pp → 0.020335
    const deltaFraction = deltaPP / 100;

    // Aplica o sinal ao RTP teórico
    if (sign < 0) {
      return rtpTeorico - deltaFraction; // Negativo: RTP abaixo do teórico
    } else if (sign > 0) {
      return rtpTeorico + deltaFraction; // Positivo: RTP acima do teórico
    } else {
      return rtpTeorico; // Neutro: RTP = teórico
    }
  }

  /**
   * Aplica ajuste Bayesiano (shrinkage) para corrigir amostras pequenas
   * @param {Object} params
   * @param {number} params.rtpTeorico - RTP teórico
   * @param {number} params.rtpObservado - RTP observado
   * @param {number} params.nSpins - Número de spins
   * @param {string} params.volatility - Volatilidade do jogo
   * @param {boolean} params.hasProgressive - Se tem jackpot progressivo
   * @returns {Object} { rtpPost, deltaPostPP }
   */
  static calculateBayesianAdjustment({
    rtpTeorico,
    rtpObservado,
    nSpins = 0,
    volatility = 'medium',
    hasProgressive = false
  }) {
    // Se não temos n_spins, usa diretamente o RTP observado
    // (sem aplicar shrinkage Bayesiano que zeraria o delta)
    if (nSpins === 0) {
      const deltaPostPP = (rtpObservado - rtpTeorico) * 100;
      return {
        rtpPost: rtpObservado,
        deltaPostPP: hasProgressive ? this.clamp(deltaPostPP, -2.0, +2.0) : deltaPostPP
      };
    }

    // Determina k baseado na volatilidade
    const k = this.K_VALUES[volatility] || this.K_VALUES.medium;

    // Calcula n efetivo
    const nEff = Math.max(0, nSpins);

    // Peso da evidência observada (0 = confia apenas no prior, 1 = confia apenas nos dados)
    const w = nEff / (nEff + k);

    // RTP posterior (ajustado)
    const rtpPost = rtpTeorico + w * (rtpObservado - rtpTeorico);

    // Delta ajustado em pontos percentuais
    let deltaPostPP = (rtpPost - rtpTeorico) * 100;

    // Limite para jogos progressivos (jackpots distorcem curto prazo)
    if (hasProgressive) {
      deltaPostPP = this.clamp(deltaPostPP, -2.0, +2.0);
    }

    return {
      rtpPost,
      deltaPostPP
    };
  }

  /**
   * Calcula o score de confiança e direção do desvio
   * @param {number} deltaPostPP - Delta ajustado
   * @param {number} nSpins - Número de spins
   * @param {string} volatility - Volatilidade
   * @returns {number} Score (positivo = acima esperado, negativo = abaixo)
   */
  static calculateScore(deltaPostPP, nSpins, volatility = 'medium') {
    const k = this.K_VALUES[volatility] || this.K_VALUES.medium;
    const nEff = Math.max(0, nSpins);

    // Score combina magnitude do desvio com confiança estatística
    const score = deltaPostPP * Math.min(1, Math.sqrt(nEff / k));

    return score;
  }

  /**
   * Determina o nível de confiança baseado no tamanho da amostra
   * @param {number} nSpins - Número de spins
   * @returns {string} 'baixa', 'média' ou 'alta'
   */
  static calculateConfidence(nSpins) {
    if (nSpins >= 50000) return 'alta';
    if (nSpins >= 10000) return 'média';
    return 'baixa';
  }

  /**
   * Calcula tendência comparando janelas temporais
   * @param {number} deltaPost24h - Delta ajustado de 24h
   * @param {number} deltaPost7d - Delta ajustado de 7d
   * @returns {string} 'em_alta', 'em_queda' ou 'estavel'
   */
  static calculateTrend(deltaPost24h, deltaPost7d) {
    if (deltaPost24h == null || deltaPost7d == null) {
      return 'estavel';
    }

    const trendPP = deltaPost24h - deltaPost7d;

    if (trendPP > 0.5) return 'em_alta';
    if (trendPP < -0.5) return 'em_queda';
    return 'estavel';
  }

  /**
   * Processa um jogo completo e retorna todos os cálculos
   * @param {Object} game - Dados do jogo
   * @returns {Object} Dados processados com cálculos estatísticos
   */
  static processGame(game) {
    const {
      game_id,
      game_name,
      provider,
      rtp_teorico = 0.96,
      volatility = 'medium',
      has_progressive = false,
      magnitude_bps_daily,
      sign_daily,
      magnitude_bps_weekly,
      sign_weekly,
      n_spins_daily,
      n_spins_weekly
    } = game;

    // Usa n_spins se disponível, caso contrário usa 0
    const nSpinsDaily = n_spins_daily || 0;
    const nSpinsWeekly = n_spins_weekly || 0;

    // Calcula para janela diária (se disponível)
    let daily = null;
    if (magnitude_bps_daily != null && sign_daily != null) {
      const rtpObservadoDaily = this.calculateObservedRTP(rtp_teorico, magnitude_bps_daily, sign_daily);
      const { rtpPost, deltaPostPP } = this.calculateBayesianAdjustment({
        rtpTeorico: rtp_teorico,
        rtpObservado: rtpObservadoDaily,
        nSpins: nSpinsDaily,
        volatility,
        hasProgressive: has_progressive
      });

      const score = this.calculateScore(deltaPostPP, nSpinsDaily, volatility);
      const confidence = this.calculateConfidence(nSpinsDaily);

      daily = {
        window: '24h',
        magnitude_bps: magnitude_bps_daily,
        sign: sign_daily,
        n_spins: nSpinsDaily,
        rtp_observado: rtpObservadoDaily,
        rtp_post: rtpPost,
        delta_post_pp: deltaPostPP,
        score,
        confidence
      };
    }

    // Calcula para janela semanal (se disponível)
    let weekly = null;
    if (magnitude_bps_weekly != null && sign_weekly != null) {
      const rtpObservadoWeekly = this.calculateObservedRTP(rtp_teorico, magnitude_bps_weekly, sign_weekly);
      const { rtpPost, deltaPostPP } = this.calculateBayesianAdjustment({
        rtpTeorico: rtp_teorico,
        rtpObservado: rtpObservadoWeekly,
        nSpins: nSpinsWeekly,
        volatility,
        hasProgressive: has_progressive
      });

      const score = this.calculateScore(deltaPostPP, nSpinsWeekly, volatility);
      const confidence = this.calculateConfidence(nSpinsWeekly);

      weekly = {
        window: '7d',
        magnitude_bps: magnitude_bps_weekly,
        sign: sign_weekly,
        n_spins: nSpinsWeekly,
        rtp_observado: rtpObservadoWeekly,
        rtp_post: rtpPost,
        delta_post_pp: deltaPostPP,
        score,
        confidence
      };
    }

    // Calcula tendência (se ambos disponíveis)
    const trend = daily && weekly
      ? this.calculateTrend(daily.delta_post_pp, weekly.delta_post_pp)
      : 'estavel';

    return {
      game_id,
      game_name,
      provider,
      rtp_teorico,
      volatility,
      has_progressive,
      daily,
      weekly,
      trend
    };
  }

  /**
   * Gera rankings de melhores e piores jogos
   * @param {Array} processedGames - Jogos já processados
   * @param {string} window - Janela temporal ('24h' ou '7d')
   * @param {number} limit - Quantos jogos retornar
   * @returns {Object} { best: [], worst: [] }
   */
  static generateRankings(processedGames, window = '7d', limit = 10) {
    // Filtra jogos que têm dados para a janela especificada
    const gamesWithWindow = processedGames
      .map(game => {
        const windowData = window === '24h' ? game.daily : game.weekly;
        if (!windowData) return null;

        return {
          game_id: game.game_id,
          game_name: game.game_name,
          provider: game.provider,
          rtp_teorico: game.rtp_teorico,
          score: windowData.score,
          delta_post_pp: windowData.delta_post_pp,
          confidence: windowData.confidence,
          n_spins: windowData.n_spins,
          volatility: game.volatility
        };
      })
      .filter(Boolean);

    // Exclui jogos com confiança baixa do top principal
    const reliableGames = gamesWithWindow.filter(g => g.confidence !== 'baixa');

    // Ordena por score (desc para melhores, asc para piores)
    const best = [...reliableGames]
      .sort((a, b) => {
        // Primeiro por score
        if (b.score !== a.score) return b.score - a.score;
        // Em caso de empate, prioriza maior n_spins
        if (b.n_spins !== a.n_spins) return b.n_spins - a.n_spins;
        // Em caso de empate, prioriza menor volatilidade
        const volOrder = { low: 0, medium: 1, high: 2, very_high: 3 };
        return (volOrder[a.volatility] || 1) - (volOrder[b.volatility] || 1);
      })
      .slice(0, limit);

    const worst = [...reliableGames]
      .sort((a, b) => {
        // Primeiro por score (ordem inversa)
        if (a.score !== b.score) return a.score - b.score;
        // Em caso de empate, prioriza maior n_spins
        if (b.n_spins !== a.n_spins) return b.n_spins - a.n_spins;
        // Em caso de empate, prioriza menor volatilidade
        const volOrder = { low: 0, medium: 1, high: 2, very_high: 3 };
        return (volOrder[a.volatility] || 1) - (volOrder[b.volatility] || 1);
      })
      .slice(0, limit);

    return { best, worst };
  }

  /**
   * Utilitário: clamp de valor entre min e max
   */
  static clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
}

export default RTPCalculator;
