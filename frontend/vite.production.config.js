// Configuração adicional para produção no EasyPanel
export const productionConfig = {
  preview: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: false,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'rtp-games.zapchatbr.com',
      '.zapchatbr.com',
      '.easypanel.host',
      '.easypanel.app',
      'all'
    ],
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff'
    },
    cors: {
      origin: true,
      credentials: true
    }
  }
};
