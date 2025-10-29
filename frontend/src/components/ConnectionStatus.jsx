import React from 'react';
import { Wifi, WifiOff, Activity } from 'lucide-react';

export function ConnectionStatus({ isConnected, lastUpdate }) {
  const getTimeSince = () => {
    if (!lastUpdate) return 'Nunca';

    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);

    if (seconds < 5) return 'Agora';
    if (seconds < 60) return `${seconds}s atrás`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m atrás`;

    const hours = Math.floor(minutes / 60);
    return `${hours}h atrás`;
  };

  return (
    <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
      <div className="status-icon">
        {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
      </div>

      <div className="status-info">
        <span className="status-label">
          {isConnected ? 'Conectado' : 'Desconectado'}
        </span>
        <span className="status-time">{getTimeSince()}</span>
      </div>

      {isConnected && (
        <div className="status-pulse">
          <Activity size={16} />
        </div>
      )}
    </div>
  );
}
