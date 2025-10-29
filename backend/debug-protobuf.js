/**
 * Script de Debug do Protobuf da CGG
 *
 * Mostra o protobuf raw em formato texto para análise
 */

import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cabeçalhos da requisição
const getHeaders = () => ({
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
});

// Decodifica varint do protobuf (retorna BigInt)
function decodeVarint(buffer, offset) {
  let result = 0n;
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

// Converte uint64 para int64
function uint64ToInt64(u64BigInt) {
  const TWO_63 = 9223372036854775808n; // 2^63
  return u64BigInt >= TWO_63 ? u64BigInt - (2n ** 64n) : u64BigInt;
}

// Parse um único jogo mostrando TODOS os campos
function parseGameDebug(buffer) {
  const game = {};
  let offset = 0;
  const fields = [];

  try {
    while (offset < buffer.length) {
      const fieldTag = buffer[offset];
      offset++;

      if (offset >= buffer.length) break;

      const fieldNumber = fieldTag >> 3;
      const wireType = fieldTag & 0x07;

      const fieldInfo = {
        fieldNumber,
        wireType,
        offset: offset - 1,
        wireTypeName: ['varint', 'fixed64', 'length-delimited', 'start-group', 'end-group', 'fixed32'][wireType] || 'unknown'
      };

      // Wire type 0: varint
      if (wireType === 0) {
        const { value, bytesRead } = decodeVarint(buffer, offset);
        offset += bytesRead;

        fieldInfo.valueRaw = value.toString();
        fieldInfo.valueNumber = Number(value);

        // Field 6 é especial (sign)
        if (fieldNumber === 6) {
          const int64Value = uint64ToInt64(value);
          fieldInfo.asInt64 = int64Value.toString();
          fieldInfo.asSign = int64Value < 0n ? -1 : (int64Value > 0n ? 1 : 0);
        }

        fields.push(fieldInfo);

        // Salva campos conhecidos
        if (fieldNumber === 1) game.game_id = value.toString();
        if (fieldNumber === 5) game.magnitude_bps = Number(value);
        if (fieldNumber === 6) {
          game.sign_raw_uint64 = value.toString();
          game.sign_as_int64 = uint64ToInt64(value).toString();
          game.sign_normalized = uint64ToInt64(value) < 0n ? -1 : (uint64ToInt64(value) > 0n ? 1 : 0);
        }
      }
      // Wire type 2: length-delimited (strings, nested)
      else if (wireType === 2) {
        const { value: length, bytesRead } = decodeVarint(buffer, offset);
        offset += bytesRead;

        const lengthNum = Number(length);

        if (offset + lengthNum > buffer.length) break;

        const data = buffer.slice(offset, offset + lengthNum);

        fieldInfo.length = lengthNum;

        // Tenta interpretar como string UTF-8
        try {
          const str = data.toString('utf8');
          // Se for printable, mostra
          if (/^[\x20-\x7E]+$/.test(str)) {
            fieldInfo.asString = str;
          } else {
            fieldInfo.hexPreview = data.slice(0, 20).toString('hex');
          }
        } catch {
          fieldInfo.hexPreview = data.slice(0, 20).toString('hex');
        }

        fields.push(fieldInfo);

        // Salva campos conhecidos
        if (fieldNumber === 2) game.game_name = data.toString('utf8');
        if (fieldNumber === 3) {
          // Provider é nested
          const providerName = extractProviderName(data);
          if (providerName) game.provider = providerName;
        }
        if (fieldNumber === 4) {
          const str = data.toString('utf8');
          if (str.startsWith('/static')) game.image_path = str;
        }

        offset += lengthNum;
      }
      // Wire type 5: 32-bit float
      else if (wireType === 5) {
        if (offset + 4 > buffer.length) break;

        const floatValue = buffer.readFloatLE(offset);
        fieldInfo.valueFloat = floatValue;
        fieldInfo.hex = buffer.slice(offset, offset + 4).toString('hex');

        fields.push(fieldInfo);
        offset += 4;
      }
      // Wire type 1: 64-bit double
      else if (wireType === 1) {
        if (offset + 8 > buffer.length) break;

        const doubleValue = buffer.readDoubleLE(offset);
        fieldInfo.valueDouble = doubleValue;

        fields.push(fieldInfo);
        offset += 8;
      } else {
        fieldInfo.note = 'Tipo desconhecido, pulando';
        fields.push(fieldInfo);
        break;
      }
    }
  } catch (error) {
    console.error('Erro ao parsear jogo:', error);
  }

  return { game, fields };
}

// Extrai provider name de nested message
function extractProviderName(buffer) {
  let offset = 0;

  while (offset < buffer.length) {
    const fieldTag = buffer[offset];
    offset++;

    if (offset >= buffer.length) break;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x07;

    if (wireType === 2) {
      const { value: length, bytesRead } = decodeVarint(buffer, offset);
      offset += bytesRead;

      const lengthNum = Number(length);

      if (offset + lengthNum > buffer.length) break;

      if (fieldNumber === 2) {
        return buffer.slice(offset, offset + lengthNum).toString('utf8');
      }

      offset += lengthNum;
    } else {
      break;
    }
  }

  return null;
}

// Extrai jogos do buffer
function extractGamesDebug(buffer, type) {
  const games = [];
  let offset = 0;

  try {
    // Pula header inicial
    if (buffer[0] === 0x0a && buffer[1] === 0x02) {
      offset = 4;
    }

    // Lê cada jogo
    while (offset < buffer.length) {
      if (buffer[offset] !== 0x12) {
        offset++;
        continue;
      }

      offset++; // Pula 0x12

      const { value: gameSize, bytesRead: sizeBytes } = decodeVarint(buffer, offset);
      offset += sizeBytes;

      const gameSizeNum = Number(gameSize);

      if (gameSizeNum === 0 || offset + gameSizeNum > buffer.length) {
        break;
      }

      const gameBuffer = buffer.slice(offset, offset + gameSizeNum);
      const parsed = parseGameDebug(gameBuffer);

      if (parsed.game.game_name) {
        games.push(parsed);
      }

      offset += gameSizeNum;
    }
  } catch (error) {
    console.error('Erro ao extrair jogos:', error);
  }

  return games;
}

// Fetch dados da API
async function fetchRTP(period, periodName) {
  try {
    const body = Buffer.from([0x08, period, 0x10, 0x02]);
    const url = 'https://cgg.bet.br/casinogo/widgets/v2/live-rtp';

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📡 Buscando dados ${periodName}...`);
    console.log(`${'='.repeat(80)}\n`);

    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: body
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`📦 Buffer recebido: ${buffer.length} bytes\n`);
    console.log(`🔍 Primeiros 100 bytes (hex):`);
    console.log(buffer.slice(0, 100).toString('hex'));
    console.log('\n');

    // Extrai e mostra os jogos
    const games = extractGamesDebug(buffer, periodName);

    console.log(`✅ ${games.length} jogos extraídos\n`);

    // Mostra detalhes dos primeiros 3 jogos
    games.slice(0, 3).forEach((parsed, idx) => {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`🎮 JOGO ${idx + 1}: ${parsed.game.game_name || 'SEM NOME'}`);
      console.log(`${'─'.repeat(80)}\n`);

      console.log('📋 Dados extraídos:');
      console.log(JSON.stringify(parsed.game, null, 2));

      console.log('\n📝 Campos do Protobuf:\n');
      console.log('┌─────────┬────────────────────┬─────────────────────────────────────────────────┐');
      console.log('│ Field # │ Wire Type          │ Value                                           │');
      console.log('├─────────┼────────────────────┼─────────────────────────────────────────────────┤');

      parsed.fields.forEach(field => {
        let value = '';

        if (field.asString) {
          value = `"${field.asString.substring(0, 40)}"`;
        } else if (field.valueRaw) {
          value = field.valueRaw;
          if (field.asInt64) value += ` (int64: ${field.asInt64})`;
          if (field.asSign !== undefined) value += ` → sign: ${field.asSign}`;
        } else if (field.valueFloat) {
          value = `${field.valueFloat.toFixed(4)} (float)`;
        } else if (field.valueDouble) {
          value = `${field.valueDouble.toFixed(4)} (double)`;
        } else if (field.hexPreview) {
          value = `[${field.hexPreview}...]`;
        }

        const fieldNum = String(field.fieldNumber).padEnd(7);
        const wireType = field.wireTypeName.padEnd(18);

        console.log(`│ ${fieldNum} │ ${wireType} │ ${value.padEnd(47).substring(0, 47)} │`);
      });

      console.log('└─────────┴────────────────────┴─────────────────────────────────────────────────┘');
    });

    console.log(`\n${'='.repeat(80)}\n`);

    return games;
  } catch (error) {
    console.error(`❌ Erro ao buscar ${periodName}:`, error.message);
    throw error;
  }
}

// Main
async function main() {
  console.log('\n🔬 DEBUG DE PROTOBUF - CGG RTP API\n');

  try {
    // Fetch diário
    const dailyGames = await fetchRTP(1, 'DIÁRIO (24h)');

    // Fetch semanal
    const weeklyGames = await fetchRTP(2, 'SEMANAL (7d)');

    console.log('\n📊 RESUMO:\n');
    console.log(`Total de jogos diários: ${dailyGames.length}`);
    console.log(`Total de jogos semanais: ${weeklyGames.length}`);

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

main();
