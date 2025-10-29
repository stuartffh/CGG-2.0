import fetch from 'node-fetch';
import GameRTP from '../models/GameRTP.js';

class CGGService {
  constructor() {
    this.baseUrl = 'https://cgg.bet.br/casinogo/widgets/v2/live-rtp';
    // Cookies do CloudFlare são opcionais - a API funciona sem eles
    this.cookies = '';
  }

  // Cabeçalhos padrão para requisições anônimas
  getHeaders() {
    const headers = {
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

    // Adiciona cookies se disponíveis
    if (this.cookies) {
      headers['cookie'] = this.cookies;
    }

    return headers;
  }

  // Atualiza os cookies (salvos de respostas anteriores)
  updateCookies(response) {
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      this.cookies = setCookie;
    }
  }

  // Fetch dados diários (period=1, limit=2)
  async fetchDailyRTP() {
    try {
      const body = Buffer.from([0x08, 0x01, 0x10, 0x02]);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: body
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Atualiza cookies se houver
      this.updateCookies(response);

      const buffer = await response.arrayBuffer();
      return this.parseProtobuf(Buffer.from(buffer), 'daily');
    } catch (error) {
      console.error('❌ Erro ao buscar RTP diário:', error.message);
      throw error;
    }
  }

  // Fetch dados semanais (period=2, limit=2)
  async fetchWeeklyRTP() {
    try {
      const body = Buffer.from([0x08, 0x02, 0x10, 0x02]);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: body
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Atualiza cookies se houver
      this.updateCookies(response);

      const buffer = await response.arrayBuffer();
      return this.parseProtobuf(Buffer.from(buffer), 'weekly');
    } catch (error) {
      console.error('❌ Erro ao buscar RTP semanal:', error.message);
      throw error;
    }
  }

  // Decodifica varint do protobuf (retorna BigInt para suportar uint64)
  decodeVarint(buffer, offset) {
    let result = 0n; // BigInt
    let shift = 0n;
    let byte;
    let bytesRead = 0;

    do {
      if (offset + bytesRead >= buffer.length) {
        return { value: 0n, bytesRead: 0 };
      }

      byte = buffer[offset + bytesRead];
      result |= BigInt(byte & 0x7F) << shift;
      shift += 7n;
      bytesRead++;
    } while (byte & 0x80);

    return { value: result, bytesRead };
  }

  // Converte uint64 para int64 (necessário para campo 6 - sinal)
  uint64ToInt64(u64BigInt) {
    const TWO_63 = 9223372036854775808n; // 2^63
    return u64BigInt >= TWO_63 ? u64BigInt - (2n ** 64n) : u64BigInt;
  }

  // Parse básico do protobuf
  parseProtobuf(buffer, type) {
    try {
      // Log apenas em modo debug
      if (process.env.DEBUG_PROTOBUF === 'true') {
        console.log(`📦 Buffer recebido (${type}):`, buffer.length, 'bytes');
        const str = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
        console.log('🔍 Primeiros bytes:', buffer.slice(0, 50));
        console.log('📝 String preview:', str.substring(0, 200));
        console.log('🔢 Hex:', buffer.slice(0, 100).toString('hex'));
      }

      // Extrai os jogos do buffer
      const games = this.extractGames(buffer, type);

      return games;
    } catch (error) {
      console.error('❌ Erro ao fazer parse do protobuf:', error);
      throw error;
    }
  }

  // Extrai lista de jogos do protobuf
  extractGames(buffer, type) {
    const games = [];
    let offset = 0;

    try {
      // Pula o header inicial (0a 02 08 01 ou 0a 02 08 02)
      if (buffer[0] === 0x0a && buffer[1] === 0x02) {
        offset = 4; // Pula os 4 bytes do header
      }

      // Lê cada jogo
      while (offset < buffer.length) {
        // Verifica se é o início de um game (field 1, wire type 2)
        if (buffer[offset] !== 0x12) {
          offset++;
          continue;
        }

        offset++; // Pula o field tag (0x12)

        // Lê o tamanho do game message
        const { value: gameSize, bytesRead: sizeBytes } = this.decodeVarint(buffer, offset);
        offset += sizeBytes;

        // Converte BigInt para Number para operações aritméticas
        const gameSizeNum = Number(gameSize);

        if (gameSizeNum === 0 || offset + gameSizeNum > buffer.length) {
          break;
        }

        // Extrai o game message
        const gameBuffer = buffer.slice(offset, offset + gameSizeNum);
        const game = this.parseGame(gameBuffer, type);

        if (game && game.game_name) {
          games.push(game);
        }

        offset += gameSizeNum;
      }
    } catch (error) {
      console.error('Erro ao extrair jogos:', error);
    }

    return games;
  }

  // Parse um único jogo do protobuf
  parseGame(buffer, type) {
    const game = {
      game_id: null,
      game_name: null,
      provider: null,
      rtp: null
    };

    let offset = 0;
    const debugFields = []; // Para debug detalhado

    try {
      while (offset < buffer.length) {
        // Lê field tag
        const fieldTag = buffer[offset];
        offset++;

        if (offset >= buffer.length) break;

        const fieldNumber = fieldTag >> 3;
        const wireType = fieldTag & 0x07;

        // Debug: registra todos os campos encontrados
        const fieldInfo = { fieldNumber, wireType, offset: offset - 1 };

        // Wire type 0: varint (game_id, rtp)
        if (wireType === 0) {
          const { value, bytesRead } = this.decodeVarint(buffer, offset);
          offset += bytesRead;

          fieldInfo.type = 'varint';
          fieldInfo.value = value;

          if (fieldNumber === 1) {
            game.game_id = value.toString();
          } else if (fieldNumber === 5) {
            // Field 5: Magnitude em basis points (centésimos de %)
            // Ex: 20335 = 203.35%
            fieldInfo.asMetric = Number(value);
            game.rtp_magnitude_bps = Number(value);
          } else if (fieldNumber === 6) {
            // Field 6: Sinal (int64 codificado como uint64)
            // Valores pequenos (< 2^63) = POSITIVO
            // Valores grandes (>= 2^63) = NEGATIVO
            game.rtp_sign_raw = value; // uint64
            const int64Value = this.uint64ToInt64(value);
            game.rtp_sign = int64Value < 0n ? -1 : (int64Value > 0n ? 1 : 0);
            fieldInfo.asSign = game.rtp_sign;
          }

          debugFields.push(fieldInfo);
        }
        // Wire type 2: length-delimited (strings, nested messages)
        else if (wireType === 2) {
          const { value: length, bytesRead } = this.decodeVarint(buffer, offset);
          offset += bytesRead;

          // Converte BigInt para Number
          const lengthNum = Number(length);

          if (offset + lengthNum > buffer.length) break;

          const data = buffer.slice(offset, offset + lengthNum);

          fieldInfo.type = 'length-delimited';
          fieldInfo.length = lengthNum;
          fieldInfo.stringValue = data.toString('utf8').substring(0, 50);

          if (fieldNumber === 2) {
            // Game name
            game.game_name = data.toString('utf8');
          } else if (fieldNumber === 3) {
            // Provider (nested message)
            game.provider = this.extractProviderName(data);
          } else if (fieldNumber === 4) {
            // Field 4: caminho da imagem
            const str = data.toString('utf8');
            fieldInfo.isImageUrl = str.startsWith('/static');

            if (str.startsWith('/static')) {
              // Salva o caminho da imagem
              game.image_path = str;
            }
          } else if (fieldNumber === 5) {
            // Tenta interpretar como nested message
            fieldInfo.hexPreview = data.slice(0, 20).toString('hex');
            const nestedData = this.parseNestedRTPData(data);
            if (nestedData) {
              fieldInfo.nestedData = nestedData;
              if (nestedData.rtp) {
                game.rtp = nestedData.rtp;
              }
            }
          }

          offset += lengthNum;
          debugFields.push(fieldInfo);
        }
        // Wire type 5: 32-bit (floats)
        else if (wireType === 5) {
          if (offset + 4 > buffer.length) break;

          const floatValue = buffer.readFloatLE(offset);
          const hexBytes = buffer.slice(offset, offset + 4).toString('hex');
          offset += 4;

          fieldInfo.type = 'float32';
          fieldInfo.value = floatValue;
          fieldInfo.hex = hexBytes;

          // Tenta em QUALQUER campo com wire type 5
          if (!game.rtp && floatValue >= 0 && floatValue <= 200) {
            // RTP razoável entre 0-200%
            game.rtp = floatValue;
            fieldInfo.usedAsRTP = true;
          }

          debugFields.push(fieldInfo);
        }
        // Wire type 1: 64-bit
        else if (wireType === 1) {
          if (offset + 8 > buffer.length) break;

          const doubleValue = buffer.readDoubleLE(offset);
          fieldInfo.type = 'double64';
          fieldInfo.value = doubleValue;

          offset += 8;
          debugFields.push(fieldInfo);
        } else {
          // Wire type desconhecido, pula
          fieldInfo.type = 'unknown';
          debugFields.push(fieldInfo);
          break;
        }
      }

      // Debug: mostra a estrutura do primeiro jogo de cada tipo
      if (process.env.DEBUG_PROTOBUF === 'true' && game.game_name) {
        console.log(`\n🔍 DEBUG Game: ${game.game_name} (${type})`);
        console.log('   Campos encontrados:');
        debugFields.forEach(field => {
          let desc = `   Field ${field.fieldNumber} (wire ${field.wireType}): ${field.type}`;
          if (field.value !== undefined) desc += ` = ${field.value}`;
          if (field.stringValue) desc += ` = "${field.stringValue}"`;
          if (field.hex) desc += ` [${field.hex}]`;
          if (field.usedAsRTP) desc += ' ← RTP ENCONTRADO!';
          if (field.extractedRTP) desc += ` ← RTP do nested: ${field.extractedRTP}`;
          console.log(desc);
        });
        console.log('');
      }

    } catch (error) {
      console.error('Erro ao parsear jogo:', error);
    }

    return game;
  }

  // Parse dados aninhados procurando por RTP
  parseNestedRTPData(buffer) {
    const result = { fields: [] };
    let offset = 0;

    try {
      while (offset < buffer.length) {
        if (offset >= buffer.length) break;

        const fieldTag = buffer[offset];
        offset++;

        const fieldNumber = fieldTag >> 3;
        const wireType = fieldTag & 0x07;

        const fieldData = { fieldNumber, wireType };

        if (wireType === 0) {
          const { value, bytesRead } = this.decodeVarint(buffer, offset);
          offset += bytesRead;
          fieldData.value = value;
        } else if (wireType === 5) {
          if (offset + 4 > buffer.length) break;
          const floatValue = buffer.readFloatLE(offset);
          offset += 4;
          fieldData.value = floatValue;
          if (floatValue >= 0 && floatValue <= 200) {
            result.rtp = floatValue;
          }
        } else if (wireType === 1) {
          if (offset + 8 > buffer.length) break;
          const doubleValue = buffer.readDoubleLE(offset);
          offset += 8;
          fieldData.value = doubleValue;
        } else {
          break;
        }

        result.fields.push(fieldData);
      }
    } catch (error) {
      // Ignore
    }

    return result.fields.length > 0 ? result : null;
  }

  // Extrai RTP de um nested message
  extractRTPFromNested(buffer) {
    let offset = 0;

    try {
      while (offset < buffer.length) {
        const fieldTag = buffer[offset];
        offset++;

        if (offset >= buffer.length) break;

        const fieldNumber = fieldTag >> 3;
        const wireType = fieldTag & 0x07;

        // Procura por float (wire type 5)
        if (wireType === 5) {
          if (offset + 4 > buffer.length) break;
          const floatValue = buffer.readFloatLE(offset);

          // Se o valor está em um range razoável para RTP
          if (floatValue >= 0 && floatValue <= 200) {
            return floatValue;
          }

          offset += 4;
        }
        // Pula outros tipos
        else if (wireType === 0) {
          const { bytesRead } = this.decodeVarint(buffer, offset);
          offset += bytesRead;
        }
        else if (wireType === 2) {
          const { value: length, bytesRead } = this.decodeVarint(buffer, offset);
          offset += bytesRead + length;
        }
        else if (wireType === 1) {
          offset += 8;
        }
        else {
          break;
        }
      }
    } catch (error) {
      // Silently fail
    }

    return null;
  }

  // Extrai o nome do provider de um nested message
  extractProviderName(buffer) {
    let offset = 0;

    while (offset < buffer.length) {
      const fieldTag = buffer[offset];
      offset++;

      if (offset >= buffer.length) break;

      const fieldNumber = fieldTag >> 3;
      const wireType = fieldTag & 0x07;

      if (wireType === 2) {
        const { value: length, bytesRead } = this.decodeVarint(buffer, offset);
        offset += bytesRead;

        // Converte BigInt para Number
        const lengthNum = Number(length);

        if (offset + lengthNum > buffer.length) break;

        if (fieldNumber === 2) {
          // Provider name
          return buffer.slice(offset, offset + lengthNum).toString('utf8');
        }

        offset += lengthNum;
      } else {
        break;
      }
    }

    return 'Unknown';
  }

  // Combina dados diários e semanais
  async fetchAllRTP() {
    try {
      const [dailyGames, weeklyGames] = await Promise.all([
        this.fetchDailyRTP(),
        this.fetchWeeklyRTP()
      ]);

      // Combina os dados em um mapa por game_id
      const gamesMap = new Map();

      // DADOS DA API CGG:
      // Field 5 (rtp_magnitude_bps) = magnitude em basis points (centésimos de %)
      // Field 6 (rtp_sign) = sinal (-1 = negativo, 0 = neutro, 1 = positivo)
      //
      // FÓRMULA CORRETA:
      // magnitude_percent = rtp_magnitude_bps / 100
      // deltaFraction = magnitude_percent / 100
      // rtp_observado = rtp_teorico ± deltaFraction (baseado no sinal)

      // Adiciona dados diários
      for (const game of dailyGames) {
        if (game.game_id && game.game_name) {
          gamesMap.set(game.game_id, {
            game_id: game.game_id,
            game_name: game.game_name,
            provider: game.provider || 'Unknown',

            // Campos originais da API (Field 5 e Field 6)
            magnitude_bps_daily: game.rtp_magnitude_bps || null, // Basis points da magnitude
            sign_daily: game.rtp_sign != null ? game.rtp_sign : null, // Sinal (-1, 0, 1)
            magnitude_bps_weekly: null,
            sign_weekly: null,

            // Campo field4: caminho da imagem
            image_path: game.image_path || null,
            // URL completa da imagem
            image_url: game.image_path ? `https://cgg.bet.br${game.image_path}` : null
          });
        }
      }

      // Adiciona dados semanais
      for (const game of weeklyGames) {
        if (game.game_id && game.game_name) {
          if (gamesMap.has(game.game_id)) {
            // Atualiza dados semanais
            const existing = gamesMap.get(game.game_id);
            existing.magnitude_bps_weekly = game.rtp_magnitude_bps || null;
            existing.sign_weekly = game.rtp_sign != null ? game.rtp_sign : null;
          } else {
            // Adiciona novo jogo (caso não esteja no daily)
            gamesMap.set(game.game_id, {
              game_id: game.game_id,
              game_name: game.game_name,
              provider: game.provider || 'Unknown',

              // Campos originais da API
              magnitude_bps_daily: null,
              sign_daily: null,
              magnitude_bps_weekly: game.rtp_magnitude_bps || null,
              sign_weekly: game.rtp_sign != null ? game.rtp_sign : null,

              // Campo field4: caminho da imagem
              image_path: game.image_path || null,
              // URL completa da imagem
              image_url: game.image_path ? `https://cgg.bet.br${game.image_path}` : null
            });
          }
        }
      }

      // Converte o mapa em array
      const combinedGames = Array.from(gamesMap.values());

      return {
        games: combinedGames,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ Erro ao buscar todos os RTPs:', error);
      throw error;
    }
  }
}

export default new CGGService();
