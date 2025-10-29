# 🔧 Guia de Configuração

## Como Obter os Tokens de Autenticação

Para que o sistema funcione, você precisa obter os tokens de autenticação do site CGG.bet.br.

### Passo a Passo

#### 1. Acesse o site
Abra o navegador e acesse: https://cgg.bet.br

#### 2. Faça login
Entre com suas credenciais

#### 3. Abra as Ferramentas de Desenvolvedor
- **Chrome/Edge**: Pressione `F12` ou `Ctrl+Shift+I`
- **Firefox**: Pressione `F12`

#### 4. Vá para a aba Network
- Clique na aba "Network" ou "Rede"
- Marque a opção "Preserve log" para manter o histórico

#### 5. Navegue até a área de jogos
- Vá para a seção de cassino/jogos
- Aguarde a página carregar completamente

#### 6. Encontre a requisição `live-rtp`
- No filtro de busca da aba Network, digite: `live-rtp`
- Você verá uma ou mais requisições para `casinogo/widgets/v2/live-rtp`
- Clique em uma delas

#### 7. Copie os Headers necessários

##### Authorization Token
1. Na aba "Headers" da requisição
2. Role até encontrar "Request Headers"
3. Localize o campo `authorization:`
4. Copie todo o valor (começa com `eyJ...`)

**Exemplo:**
```
authorization: eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyMTQ2NDQw...
```

##### Cookies
1. Ainda em "Request Headers"
2. Localize o campo `cookie:`
3. Copie todo o valor

**Exemplo:**
```
cookie: data=2aa97af5626630b9148ba762a387ea57; fp_token_7c6a6574-f011-4c9a...
```

#### 8. Configure o arquivo `.env`

Abra o arquivo `backend/.env` e cole os valores:

```env
PORT=3001
CGG_AUTHORIZATION=cole_aqui_o_token_de_authorization
CGG_COOKIES=cole_aqui_os_cookies
UPDATE_INTERVAL=3000
```

**Importante:**
- Não adicione aspas nos valores
- Cole diretamente após o `=`
- Mantenha tudo em uma única linha

### Exemplo Completo

```env
PORT=3001
CGG_AUTHORIZATION=eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyMTQ2NDQwNTMzOTkwNjE4MTAsInR5cGUiOiJhY2Nlc3MiLCJzaSI6MSwidXMiOjEsInBlcm1pc3Npb25zIjpbMSwyLDMsNCw1LDYsNyw4LDEwLDEyLDEzLDE0XSwidHRsIjozMDAsImMiOiJCUiIsInYxIjp0cnVlLCJ2MiI6dHJ1ZSwidjMiOnRydWUsImV4cCI6MTc2MTY4MjE3N30.paBM8KDceXQZhLJZGLoBa9uVrYlsKiSuOd9D8jE1-30RHgFueZvh16mm9v-rSy60jUGDhOj3wEQHgVYcJ6eGGg
CGG_COOKIES=data=2aa97af5626630b9148ba762a387ea57; fp_token_7c6a6574-f011-4c9a-abdd-9894a102ccef=Ug6w1wCUAfiNIYdwF/9UD2LdBWd7PDJnRyyZylwWBaQ=
UPDATE_INTERVAL=3000
```

## Problemas Comuns

### Token Expirado
**Sintoma:** Erro 401 ou 403 nas requisições

**Solução:** Os tokens JWT têm validade limitada. Repita o processo acima para obter novos tokens.

### Erro de CORS
**Sintoma:** Erro de CORS no console

**Solução:** Certifique-se de que o backend está rodando na porta 3001 e o frontend na porta 3000.

### WebSocket não conecta
**Sintoma:** Status "Desconectado" permanente

**Solução:**
1. Verifique se o backend está rodando
2. Verifique se a URL do WebSocket está correta
3. Tente reiniciar o backend

### Banco de dados bloqueado
**Sintoma:** Erro "database is locked"

**Solução:** O SQLite com WAL já está configurado. Se persistir:
```bash
cd backend/data
rm *.db-wal *.db-shm
```

## Testando a Configuração

Após configurar, execute:

```bash
# Terminal 1 - Backend
cd backend
npm run dev
```

Se tudo estiver correto, você verá:
```
✅ Banco de dados inicializado com WAL habilitado
🚀 Iniciando atualizações a cada 3000ms
🔄 Buscando dados da API CGG...
📦 Dados recebidos:
  - Daily: XXX bytes
  - Weekly: XXX bytes
```

## Suporte

Se você seguiu todos os passos e ainda tem problemas:

1. Ative o modo debug no frontend (botão 🐛)
2. Verifique o console do navegador (F12)
3. Verifique os logs do backend
4. Certifique-se de que está logado no site CGG.bet.br
