/**
 * Serviço simplificado de cálculo de RTP
 * Converte valores brutos da CGG API para porcentagem
 * Sem ajustes Bayesianos - exibe valores reais da API
 */

class RTPCalculator {
  /**
   * Converte magnitude em basis points para porcentagem RTP
   * @param {number} magnitudeBps - Magnitude em basis points (ex: 20335 = 203.35 bps = 2.0335%)
   * @param {number} sign - Sinal (-1, 0, ou 1)
   * @returns {number|null} RTP em porcentagem ou null se dados inválidos
   */
  static basisPointsToPercent(magnitudeBps, sign) {
    if (magnitudeBps == null || sign == null) {
      return null;
    }

    // Converte basis points para porcentagem
    // 1 basis point = 0.01%
    // 20335 basis points = 203.35% = 2.0335 pontos percentuais
    const percentValue = magnitudeBps / 100;

    // Aplica o sinal
    // sign = 1: positivo (RTP acima do esperado)
    // sign = -1: negativo (RTP abaixo do esperado)
    // sign = 0: neutro
    return percentValue * sign;
  }

  /**
   * Processa dados de um jogo para exibição
   * @param {Object} game - Dados brutos do jogo
   * @returns {Object} Dados formatados para o frontend
   */
  static processGame(game) {
    const {
      game_id,
      game_name,
      provider,
      image_url,
      magnitude_bps_daily,
      sign_daily,
      magnitude_bps_weekly,
      sign_weekly
    } = game;

    // Converte magnitude + sign para porcentagem
    const rtpDaily = this.basisPointsToPercent(magnitude_bps_daily, sign_daily);
    const rtpWeekly = this.basisPointsToPercent(magnitude_bps_weekly, sign_weekly);

    return {
      game_id,
      game_name,
      provider,
      image_url,
      // Valores diários
      magnitude_bps_daily,
      sign_daily,
      rtp_calculated_daily: rtpDaily,
      // Valores semanais
      magnitude_bps_weekly,
      sign_weekly,
      rtp_calculated_weekly: rtpWeekly
    };
  }

  /**
   * Processa array de jogos
   * @param {Array} games - Array de jogos
   * @returns {Array} Array de jogos processados
   */
  static processGames(games) {
    return games.map(game => this.processGame(game));
  }
}

export default RTPCalculator;
