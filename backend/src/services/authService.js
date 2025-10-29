import fetch from 'node-fetch';

class AuthService {
  constructor() {
    this.refreshToken = process.env.CGG_REFRESH_TOKEN;
    this.accessToken = process.env.CGG_AUTHORIZATION;
    this.cookies = process.env.CGG_COOKIES;
    this.refreshUrl = 'https://cgg.bet.br/account/v1/refresh';
    this.isRefreshing = false;
    this.refreshPromise = null;
  }

  // Cabeçalhos padrão
  getBaseHeaders() {
    return {
      'accept': 'application/x-protobuf',
      'accept-language': 'pt-BR',
      'content-type': 'application/x-protobuf',
      'origin': 'https://cgg.bet.br',
      'referer': 'https://cgg.bet.br/pt-BR/casinos/casino/lobby',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'x-language-iso': 'pt-BR'
    };
  }

  // Retorna o token de acesso atual
  getAccessToken() {
    return this.accessToken;
  }

  // Retorna os cookies atuais
  getCookies() {
    return this.cookies;
  }

  // Atualiza o token de acesso
  setAccessToken(token) {
    this.accessToken = token;
    console.log('✅ Token de acesso atualizado');
  }

  // Faz refresh do token
  async refreshAccessToken() {
    // Se já está fazendo refresh, espera a promise existente
    if (this.isRefreshing && this.refreshPromise) {
      console.log('⏳ Aguardando refresh em andamento...');
      return this.refreshPromise;
    }

    this.isRefreshing = true;

    this.refreshPromise = (async () => {
      try {
        console.log('🔄 Fazendo refresh do token...');

        // Verifica se o refresh token está configurado
        if (!this.refreshToken) {
          throw new Error('CGG_REFRESH_TOKEN não configurado no .env');
        }

        // Cria o payload com o refresh token
        // Formato protobuf: field 1 (wire type 2 = length-delimited) + length + token
        const refreshTokenBuffer = Buffer.from(this.refreshToken, 'utf8');
        const tokenLength = refreshTokenBuffer.length;

        // Calcula o tamanho do varint para o comprimento
        const lengthBuffer = this.encodeVarint(tokenLength);

        // Monta o payload: [field_tag][length][token]
        // field_tag = 0x82 0x03 (field 49, wire type 2)
        const payload = Buffer.concat([
          Buffer.from([0x82, 0x03]),
          lengthBuffer,
          refreshTokenBuffer
        ]);

        const response = await fetch(this.refreshUrl, {
          method: 'POST',
          headers: {
            ...this.getBaseHeaders(),
            'cookie': this.cookies
          },
          body: payload
        });

        if (!response.ok) {
          throw new Error(`Erro ao fazer refresh: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const responseBuffer = Buffer.from(buffer);

        // Tenta extrair o novo token da resposta protobuf
        const newToken = this.extractTokenFromProtobuf(responseBuffer);

        if (newToken) {
          this.setAccessToken(newToken);
          console.log('✅ Token renovado com sucesso!');
          return newToken;
        } else {
          // Se não conseguir extrair, mostra dados para debug
          console.log('⚠️  Não foi possível extrair o token automaticamente');
          console.log('📦 Resposta recebida (primeiros 200 chars):');
          console.log('   Hex:', responseBuffer.slice(0, 100).toString('hex'));
          console.log('   String:', responseBuffer.toString('utf8', 0, 200));

          // Tenta procurar por padrão JWT na resposta
          const str = responseBuffer.toString('utf8');
          const jwtMatch = str.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/);

          if (jwtMatch) {
            const extractedToken = jwtMatch[0];
            console.log('✅ Token JWT encontrado na resposta!');
            this.setAccessToken(extractedToken);
            return extractedToken;
          }

          throw new Error('Token não encontrado na resposta do refresh');
        }
      } catch (error) {
        console.error('❌ Erro ao fazer refresh do token:', error.message);
        throw error;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Extrai o token JWT da resposta protobuf
  extractTokenFromProtobuf(buffer) {
    try {
      // Converte buffer para string e procura por padrão JWT
      const str = buffer.toString('utf8');

      // Padrão JWT: eyJ...
      const jwtRegex = /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g;
      const matches = str.match(jwtRegex);

      if (matches && matches.length > 0) {
        // Pega o primeiro token (geralmente é o access token)
        // Se houver múltiplos, o segundo seria o refresh token
        return matches[0];
      }

      return null;
    } catch (error) {
      console.error('❌ Erro ao extrair token:', error);
      return null;
    }
  }

  // Decodifica JWT para verificar expiração (sem validar assinatura)
  decodeJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8')
      );

      return payload;
    } catch (error) {
      return null;
    }
  }

  // Verifica se o token está próximo de expirar (menos de 1 minuto)
  isTokenExpiringSoon() {
    const payload = this.decodeJWT(this.accessToken);
    if (!payload || !payload.exp) return true;

    const expirationTime = payload.exp * 1000; // Converter para ms
    const now = Date.now();
    const timeUntilExpiration = expirationTime - now;

    // Se falta menos de 1 minuto para expirar
    return timeUntilExpiration < 60000;
  }

  // Verifica se o token expirou
  isTokenExpired() {
    const payload = this.decodeJWT(this.accessToken);
    if (!payload || !payload.exp) return true;

    const expirationTime = payload.exp * 1000;
    const now = Date.now();

    return now >= expirationTime;
  }

  // Codifica um número em varint (protocolo protobuf)
  encodeVarint(value) {
    const bytes = [];
    while (value > 0x7F) {
      bytes.push((value & 0x7F) | 0x80);
      value >>>= 7;
    }
    bytes.push(value & 0x7F);
    return Buffer.from(bytes);
  }

  // Retorna informações do token atual
  getTokenInfo() {
    const payload = this.decodeJWT(this.accessToken);
    if (!payload) return null;

    const now = Date.now();
    const exp = payload.exp * 1000;
    const timeLeft = exp - now;

    return {
      user_id: payload.user_id,
      type: payload.type,
      permissions: payload.permissions,
      expires_at: new Date(exp).toISOString(),
      expires_in_seconds: Math.floor(timeLeft / 1000),
      is_expired: timeLeft <= 0,
      is_expiring_soon: timeLeft < 60000
    };
  }

  // Auto-refresh preventivo (chama antes de expirar)
  async ensureValidToken() {
    if (this.isTokenExpired()) {
      console.log('⚠️  Token expirado, fazendo refresh...');
      await this.refreshAccessToken();
    } else if (this.isTokenExpiringSoon()) {
      console.log('⚠️  Token expirando em breve, fazendo refresh preventivo...');
      await this.refreshAccessToken();
    }
  }

  // Inicia um timer de refresh automático
  startAutoRefresh() {
    // Verifica a cada 30 segundos
    this.autoRefreshInterval = setInterval(async () => {
      try {
        const info = this.getTokenInfo();
        if (info) {
          console.log(`🔐 Token válido por mais ${info.expires_in_seconds}s`);

          if (info.is_expiring_soon && !this.isRefreshing) {
            await this.refreshAccessToken();
          }
        }
      } catch (error) {
        console.error('❌ Erro no auto-refresh:', error.message);
      }
    }, 30000);

    console.log('🔄 Auto-refresh iniciado (verifica a cada 30s)');
  }

  // Para o auto-refresh
  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      console.log('⏹️  Auto-refresh parado');
    }
  }
}

export default new AuthService();
