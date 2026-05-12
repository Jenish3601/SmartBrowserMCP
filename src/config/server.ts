export const serverConfig = {
  port: parseInt(process.env.MCP_SERVER_PORT || '3000'),
  host: process.env.MCP_SERVER_HOST || 'localhost',
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
  mcpEndpoint: '/api/mcp'
};
