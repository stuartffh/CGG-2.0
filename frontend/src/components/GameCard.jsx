import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function GameCard({ game, prevRTP }) {
  const hasRTP = game.daily || game.weekly || game.rtp_calculated_daily != null || game.rtp_calculated_weekly != null;

  const rtpChange = prevRTP ? (game.rtp_calculated_daily || 0) - prevRTP : 0;
  const changePercent = prevRTP ? ((rtpChange / prevRTP) * 100).toFixed(2) : 0;

  const getTrendIcon = () => {
    if (rtpChange > 0) return <TrendingUp className="trend-up" size={20} />;
    if (rtpChange < 0) return <TrendingDown className="trend-down" size={20} />;
    return <Minus className="trend-neutral" size={20} />;
  };

  const getTrendClass = () => {
    if (rtpChange > 0) return 'positive';
    if (rtpChange < 0) return 'negative';
    return 'neutral';
  };

  const getRtpClass = (rtpValue, signValue) => {
    if (rtpValue == null || signValue == null) return 'neutral';

    // Sign vem do backend já convertido: -1 (negativo), 0 (neutro), 1 (positivo)
    if (signValue === -1) return 'negative';
    if (signValue === 1) return 'positive';
    return 'neutral';
  };

  // Formata valores mostrando RTP real absoluto
  const formatRTPValue = (value) => {
    if (value == null) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className={`game-card ${!hasRTP ? 'no-rtp' : ''}`}>
      <div className="game-image-container">
        <img
          src={game.image_url}
          alt={game.game_name}
          className="game-image"
          onError={(e) => {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23000"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2300ff88" font-family="Courier New" font-size="14"%3ENO IMAGE%3C/text%3E%3C/svg%3E';
          }}
        />
        <div className="game-provider">{game.provider || 'Unknown'}</div>
        {!hasRTP && <div className="no-rtp-badge">Sem dados RTP</div>}
      </div>

      <div className="game-info">
        <h3 className="game-name" title={game.game_name}>
          {game.game_name}
        </h3>

        {hasRTP ? (
          <div className="rtp-container">
            <div className="rtp-item">
              <span className="rtp-label">RTP Diário</span>
              <div className="rtp-value-container">
                <span className={`rtp-value ${getRtpClass(game.rtp_calculated_daily, game.sign_daily)}`}>
                  {formatRTPValue(game.rtp_calculated_daily)}
                </span>
                {rtpChange !== 0 && (
                  <div className={`rtp-change ${getTrendClass()}`}>
                    {getTrendIcon()}
                    <span>{Math.abs(changePercent)}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rtp-item">
              <span className="rtp-label">RTP Semanal</span>
              <span className={`rtp-value ${getRtpClass(game.rtp_calculated_weekly, game.sign_weekly)}`}>
                {formatRTPValue(game.rtp_calculated_weekly)}
              </span>
            </div>
          </div>
        ) : (
          <div className="no-rtp-message">
            <p>Este jogo não possui dados de RTP disponíveis no momento.</p>
          </div>
        )}

        <div className="game-id">ID: {game.game_id}</div>
      </div>
    </div>
  );
}
