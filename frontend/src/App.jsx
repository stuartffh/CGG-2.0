import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { GameCard } from './components/GameCard';
import { ConnectionStatus } from './components/ConnectionStatus';
import { Search, Filter, BarChart3 } from 'lucide-react';
import './styles/App.css';

// Função para construir a URL do WebSocket baseada nas variáveis de ambiente
const getWebSocketUrl = () => {
  // Se VITE_API_URL estiver definida, use-a diretamente
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Se VITE_BACKEND_DOMAIN estiver definida, construa a URL
  if (import.meta.env.VITE_BACKEND_DOMAIN) {
    const domain = import.meta.env.VITE_BACKEND_DOMAIN;
    // Detecta se estamos em HTTPS para usar WSS, senão usa WS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${domain}`;
  }

  // Fallback: tenta usar a mesma origem (same-origin) em produção
  if (import.meta.env.PROD) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  // Desenvolvimento: usa localhost
  return 'ws://localhost:3001';
};

const WS_URL = getWebSocketUrl();

console.log('🔌 WebSocket URL:', WS_URL);

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
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  const [lastUpdate, setLastUpdate] = useState(null);
  const [debugMode, setDebugMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingCards, setUpdatingCards] = useState(new Set());
  const [copiedCard, setCopiedCard] = useState(null);
  const [isLoadingFromDB, setIsLoadingFromDB] = useState(true);
  const prevGamesRef = useRef({});

  // Busca dados iniciais do banco de dados
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        console.log('📥 Buscando dados do banco de dados...');

        // Constrói a URL da API baseada na URL do WebSocket
        const apiUrl = WS_URL.replace('ws://', 'http://').replace('wss://', 'https://');
        const response = await fetch(`${apiUrl}/api/games/latest`);

        if (!response.ok) {
          throw new Error('Falha ao buscar dados do banco');
        }

        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
          console.log(`✅ ${result.data.length} jogos carregados do banco de dados`);
          console.log('🔍 Primeiro jogo (amostra):', result.data[0]);

          // Converte formato do banco para formato do frontend
          const gamesData = result.data.map(game => ({
            game_id: game.game_id,
            game_name: game.game_name,
            provider: game.provider,
            rtp_calculated_daily: game.rtp_daily,
            rtp_calculated_weekly: game.rtp_weekly,
            image_url: game.image_url,
            timestamp: game.timestamp,
            // Calcula sign baseado no RTP
            sign_daily: game.rtp_daily > 96 ? 1 : game.rtp_daily < 96 ? -1 : 0,
            sign_weekly: game.rtp_weekly > 96 ? 1 : game.rtp_weekly < 96 ? -1 : 0,
          }));

          const withRTP = gamesData.filter(game =>
            game.rtp_calculated_daily != null || game.rtp_calculated_weekly != null
          );
          const withoutRTP = gamesData.filter(game =>
            game.rtp_calculated_daily == null && game.rtp_calculated_weekly == null
          );

          setGames(gamesData);
          setGamesWithRTP(withRTP);
          setGamesWithoutRTP(withoutRTP);
          setLastUpdate(result.data[0]?.timestamp || Date.now());
        } else {
          console.log('ℹ️ Nenhum dado encontrado no banco');
        }
      } catch (error) {
        console.error('❌ Erro ao buscar dados do banco:', error);
      } finally {
        setIsLoadingFromDB(false);
      }
    };

    loadInitialData();
  }, []);

  // Função para copiar nome do jogo
  const copyGameName = async (gameName) => {
    try {
      await navigator.clipboard.writeText(gameName);
      console.log(`✅ Nome copiado: ${gameName}`);
      
      // Feedback visual
      setCopiedCard(gameName);
      setTimeout(() => {
        setCopiedCard(null);
      }, 1000);
    } catch (err) {
      console.error('❌ Erro ao copiar:', err);
      // Fallback para navegadores mais antigos
      const textArea = document.createElement('textarea');
      textArea.value = gameName;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      setCopiedCard(gameName);
      setTimeout(() => {
        setCopiedCard(null);
      }, 1000);
    }
  };

  useEffect(() => {
    if (lastMessage) {
      console.log('📨 Mensagem recebida:', lastMessage.type);

      if (lastMessage.type === 'initial' || lastMessage.type === 'update') {
        setLastUpdate(lastMessage.timestamp);

        // Se temos dados parseados
        if (lastMessage.data && Array.isArray(lastMessage.data)) {
          // Adiciona timestamp aos dados do WebSocket
          const gamesWithTimestamp = lastMessage.data.map(game => ({
            ...game,
            timestamp: lastMessage.timestamp || Date.now()
          }));

          // Identifica cards que mudaram para aplicar transição suave
          const changedCards = new Set();

          // Compara dados anteriores com novos
          gamesWithTimestamp.forEach(newGame => {
            const oldGame = games.find(g => g.game_id === newGame.game_id);
            if (oldGame) {
              // Verifica se RTP mudou
              if (oldGame.rtp_calculated_daily !== newGame.rtp_calculated_daily ||
                  oldGame.rtp_calculated_weekly !== newGame.rtp_calculated_weekly) {
                changedCards.add(newGame.game_id);
              }
            }
          });

          // Salva RTPs anteriores para comparação
          games.forEach(game => {
            prevGamesRef.current[game.game_id] = game.rtp_calculated_daily;
          });

          // Separa jogos com RTP e sem RTP
          const withRTP = gamesWithTimestamp.filter(game =>
            game.daily || game.weekly || game.rtp_calculated_daily != null || game.rtp_calculated_weekly != null
          );
          const withoutRTP = gamesWithTimestamp.filter(game =>
            !game.daily && !game.weekly && game.rtp_calculated_daily == null && game.rtp_calculated_weekly == null
          );

          console.log(`📊 Jogos com RTP: ${withRTP.length}, sem RTP: ${withoutRTP.length}`);

          // Aplica transição suave apenas aos cards que mudaram
          if (lastMessage.type === 'update' && changedCards.size > 0) {
            setUpdatingCards(changedCards);
            // Não aplica isUpdating global para não interferir com filtros
            // setIsUpdating(true);

            // Remove transição após animação
            setTimeout(() => {
              setUpdatingCards(new Set());
              // setIsUpdating(false);
            }, 600); // Reduzido de 800ms para 600ms
          }

          // Atualiza os dados
          setGames(gamesWithTimestamp);
          setGamesWithRTP(withRTP);
          setGamesWithoutRTP(withoutRTP);

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

    // Ordenação com controle de ordem
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.game_name.localeCompare(b.game_name);
          break;
        case 'rtp-daily':
          comparison = (a.rtp_calculated_daily || 0) - (b.rtp_calculated_daily || 0);
          break;
        case 'rtp-weekly':
          comparison = (a.rtp_calculated_weekly || 0) - (b.rtp_calculated_weekly || 0);
          break;
        case 'provider':
          comparison = (a.provider || '').localeCompare(b.provider || '');
          break;
        default:
          comparison = 0;
      }
      
      // Aplica ordem crescente ou decrescente
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    setFilteredGames(filtered);
  }, [games, gamesWithRTP, gamesWithoutRTP, searchTerm, sortBy, sortOrder, viewMode, rtpFilter]);

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
                <option value="rtp-daily">RTP Diário</option>
                <option value="rtp-weekly">RTP Semanal</option>
                <option value="provider">Provedor</option>
              </select>
            </div>

            <div className="sort-order-box">
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="asc">Crescente</option>
                <option value="desc">Decrescente</option>
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


      <main className="games-grid">
        {filteredGames.length > 0 ? (
          filteredGames.map((game) => (
            <GameCard
              key={game.game_id}
              game={game}
              prevRTP={prevGamesRef.current[game.game_id]}
              isUpdating={updatingCards.has(game.game_id)}
              isCopied={copiedCard === game.game_name}
              onCopy={() => copyGameName(game.game_name)}
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
