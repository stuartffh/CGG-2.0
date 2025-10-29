import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { GameCard } from './components/GameCard';
import { ConnectionStatus } from './components/ConnectionStatus';
import { Search, Filter, BarChart3 } from 'lucide-react';
import './styles/App.css';

const WS_URL = 'ws://localhost:3001';

function App() {
  const { isConnected, lastMessage } = useWebSocket(WS_URL);
  const [games, setGames] = useState([]);
  const [gamesWithRTP, setGamesWithRTP] = useState([]);
  const [gamesWithoutRTP, setGamesWithoutRTP] = useState([]);
  const [filteredGames, setFilteredGames] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('all'); // 'all', 'with-rtp', 'without-rtp'
  const [rtpFilter, setRtpFilter] = useState('all'); // 'all', 'positive', 'negative', 'neutral'
  const [lastUpdate, setLastUpdate] = useState(null);
  const [debugMode, setDebugMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const prevGamesRef = useRef({});

  useEffect(() => {
    if (lastMessage) {
      console.log('📨 Mensagem recebida:', lastMessage.type);

      if (lastMessage.type === 'initial' || lastMessage.type === 'update') {
        // Indica que está atualizando para aplicar classe CSS
        if (lastMessage.type === 'update') {
          setIsUpdating(true);
        }

        setLastUpdate(lastMessage.timestamp);

        // Se temos dados parseados
        if (lastMessage.data && Array.isArray(lastMessage.data)) {
          // Salva RTPs anteriores para comparação
          games.forEach(game => {
            prevGamesRef.current[game.game_id] = game.rtp_calculated_daily;
          });

          // Separa jogos com RTP e sem RTP
          const withRTP = lastMessage.data.filter(game =>
            game.daily || game.weekly || game.rtp_calculated_daily != null || game.rtp_calculated_weekly != null
          );
          const withoutRTP = lastMessage.data.filter(game =>
            !game.daily && !game.weekly && game.rtp_calculated_daily == null && game.rtp_calculated_weekly == null
          );

          console.log(`📊 Jogos com RTP: ${withRTP.length}, sem RTP: ${withoutRTP.length}`);

          // Atualiza os dados com transição suave
          setGames(lastMessage.data);
          setGamesWithRTP(withRTP);
          setGamesWithoutRTP(withoutRTP);

          // Remove o estado de atualização após um pequeno delay
          if (lastMessage.type === 'update') {
            setTimeout(() => {
              setIsUpdating(false);
            }, 300);
          }
        } else if (lastMessage.data) {
          // Modo debug: mostra dados brutos do protobuf
          console.log('📦 Dados recebidos (debug):', lastMessage.data);
        }
      }

      if (lastMessage.type === 'error') {
        console.error('❌ Erro do servidor:', lastMessage.message);
        setIsUpdating(false);
      }
    }
  }, [lastMessage, games]);

  useEffect(() => {
    // Seleciona fonte de dados baseada no modo de visualização
    let sourceGames = games;
    if (viewMode === 'with-rtp') {
      sourceGames = gamesWithRTP;
    } else if (viewMode === 'without-rtp') {
      sourceGames = gamesWithoutRTP;
    }

    let filtered = [...sourceGames];

    // Filtro de busca
    if (searchTerm) {
      filtered = filtered.filter(game =>
        game.game_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        game.game_id.includes(searchTerm) ||
        (game.provider && game.provider.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Filtro de RTP (Positivo/Negativo/Neutro)
    // RTP teórico = 96%, então comparamos com 96
    if (rtpFilter !== 'all') {
      filtered = filtered.filter(game => {
        const dailyRTP = game.rtp_calculated_daily;
        if (dailyRTP == null) return rtpFilter === 'neutral';

        if (rtpFilter === 'positive') return dailyRTP > 96;
        if (rtpFilter === 'negative') return dailyRTP < 96;
        if (rtpFilter === 'neutral') return dailyRTP === 96;
        return true;
      });
    }

    // Ordenação
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.game_name.localeCompare(b.game_name);
        case 'rtp-daily-high':
          return (b.rtp_calculated_daily || 0) - (a.rtp_calculated_daily || 0);
        case 'rtp-daily-low':
          return (a.rtp_calculated_daily || 0) - (b.rtp_calculated_daily || 0);
        case 'rtp-weekly-high':
          return (b.rtp_calculated_weekly || 0) - (a.rtp_calculated_weekly || 0);
        case 'rtp-weekly-low':
          return (a.rtp_calculated_weekly || 0) - (b.rtp_calculated_weekly || 0);
        default:
          return 0;
      }
    });

    setFilteredGames(filtered);
  }, [games, gamesWithRTP, gamesWithoutRTP, searchTerm, sortBy, viewMode, rtpFilter]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <BarChart3 size={32} className="logo" />
            <div>
              <h1>CGG RTP Monitor</h1>
              <p className="subtitle">Monitoramento em tempo real de RTP dos jogos</p>
            </div>
          </div>

          <div className="controls">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Buscar jogos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-box">
              <Filter size={16} />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="name">Nome</option>
                <option value="rtp-daily-high">RTP Diário</option>
                <option value="rtp-weekly-high">RTP Semanal</option>
              </select>
            </div>

            <div className="rtp-filter-box">
              <select value={rtpFilter} onChange={(e) => setRtpFilter(e.target.value)}>
                <option value="all">Todos os RTPs</option>
                <option value="positive">RTP Positivo</option>
                <option value="negative">RTP Negativo</option>
                <option value="neutral">RTP Neutro</option>
              </select>
            </div>

            <div className="view-mode-toggle">
              <button
                className={viewMode === 'all' ? 'active' : ''}
                onClick={() => setViewMode('all')}
              >
                Todos
              </button>
              <button
                className={viewMode === 'with-rtp' ? 'active' : ''}
                onClick={() => setViewMode('with-rtp')}
              >
                Com RTP
              </button>
              <button
                className={viewMode === 'without-rtp' ? 'active' : ''}
                onClick={() => setViewMode('without-rtp')}
              >
                Sem RTP
              </button>
            </div>

            <button
              className="debug-toggle"
              onClick={() => setDebugMode(!debugMode)}
            >
              Debug
            </button>
          </div>

          <ConnectionStatus isConnected={isConnected} lastUpdate={lastUpdate} />
        </div>
      </header>

      {/* Sidebar com dados */}
      <div className="sidebar">
        <div className="sidebar-content">
          <div className="sidebar-section">
            <h3 className="sidebar-title">Estatísticas</h3>
            <div className="sidebar-stats">
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">Total de Jogos</span>
                <span className="sidebar-stat-value">{games.length}</span>
              </div>
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">Com RTP</span>
                <span className="sidebar-stat-value">{gamesWithRTP.length}</span>
              </div>
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">Sem RTP</span>
                <span className="sidebar-stat-value">{gamesWithoutRTP.length}</span>
              </div>
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">Última Atualização</span>
                <span className="sidebar-stat-value">
                  {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {debugMode && lastMessage && (
            <div className="sidebar-section">
              <h3 className="sidebar-title">Debug Info</h3>
              <pre style={{fontSize: '0.7rem', color: 'var(--text-secondary)'}}>
                {JSON.stringify(lastMessage, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>


      <main className={`games-grid ${isUpdating ? 'updating' : ''}`}>
        {filteredGames.length > 0 ? (
          filteredGames.map((game) => (
            <GameCard
              key={game.game_id}
              game={game}
              prevRTP={prevGamesRef.current[game.game_id]}
            />
          ))
        ) : (
          <div className="empty-state">
            {games.length === 0 ? (
              <>
                <BarChart3 size={64} />
                <h2>Aguardando dados...</h2>
                <p>Conecte-se ao servidor para ver os jogos</p>
              </>
            ) : (
              <>
                <Search size={64} />
                <h2>Nenhum jogo encontrado</h2>
                <p>Tente ajustar os filtros de busca</p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
