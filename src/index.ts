#!/usr/bin/env node
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { timeouts } from './config/timeouts';

import { executeTaskTool } from './tools/executeTask';
import { checkConsoleTool } from './tools/checkConsole';
import { checkNetworkTool } from './tools/checkNetwork';
import { takeScreenshotTool } from './tools/takeScreenshot';
import { generateReportTool } from './tools/generateReport';
import { clearSessionTool } from './tools/clearSession';
import { getPageContentTool } from './tools/getPageContent';
import { browserManager } from './services/browserManager';

const tools = [
  executeTaskTool,
  checkConsoleTool,
  checkNetworkTool,
  takeScreenshotTool,
  generateReportTool,
  clearSessionTool,
  getPageContentTool,
];

function createServer(): Server {
  const server = new Server(
    {
      name: 'webpilot-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find((t) => t.name === name);

    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, message: `Tool ${name} not found` }),
          },
        ],
      };
    }

    try {
      const result = await tool.execute(args as any);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              message: error instanceof Error ? error.message : 'Tool execution failed',
            }),
          },
        ],
      };
    }
  });

  return server;
}

// Store transports by session ID with metadata for cleanup (HTTP only)
interface TransportInfo {
  transport: StreamableHTTPServerTransport;
  lastActive: number;
}

// Periodic cleanup: remove stale transports and close idle browser (HTTP only)
const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // check every minute

let cleanupInterval: NodeJS.Timeout | undefined;
let transports: Record<string, TransportInfo> = {};

const safeShutdown = async (reason: string, err?: any) => {
  console.error('[MCP SHUTDOWN]', reason, err || '');
  await browserManager.close();
  process.exit(1);
};

process.on('uncaughtException', (error) => {
  safeShutdown('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  safeShutdown('unhandledRejection', reason);
});

const gracefulShutdown = async (signal: string) => {
  clearInterval(cleanupInterval);
  await browserManager.close();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => {
});

const transportMode = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase();
const isStdio = transportMode === 'stdio';

// Track process exit (HTTP mode only)
if (!isStdio) {
  process.on('exit', (code) => {
    console.log(`[MCP] Process exiting with code: ${code}`);
  });
}

if (isStdio) {
  // STDIO mode - pure MCP, no Express
  const log = (...args: any[]) => {
    console.error('[MCP]', ...args);
  };

  console.error('WebPilot MCP Server running on STDIO');

  const server = createServer();
  const transport = new StdioServerTransport();
  
  server.connect(transport).catch((err) => {
    console.error('STDIO failed:', err);
    process.exit(1);
  });

} else {
  // HTTP mode - full Express setup
  const setupHttpServer = async () => {
    const express = await import('express');
    const app = express.default();
    
    // Express setup
    app.use(express.json());
    
    // CORS middleware
    app.use((req: any, res: any, next: any) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Initialize HTTP-only variables
    transports = {};
    
    // Setup cleanup interval
    cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [sid, info] of Object.entries(transports)) {
        if (now - info.lastActive > STALE_TIMEOUT_MS) {
          console.log(`[cleanup] Removing stale transport: ${sid} (inactive for ${Math.round((now - info.lastActive) / 1000)}s)`);
          delete transports[sid];
          cleaned++;
        }
      }

      if (cleaned > 0 && Object.keys(transports).length === 0) {
        console.log('[cleanup] All transports removed — closing browser');
        browserManager.close();
      }
    }, CLEANUP_INTERVAL_MS);

    // Don't let cleanup interval keep the process alive
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }

    // MCP endpoint
    app.all('/api/mcp', async (req: any, res: any) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const previousResponseId = req.body?.previous_response_id as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports[sessionId]) {
        transports[sessionId].lastActive = Date.now();
        transport = transports[sessionId].transport;
      } else if (previousResponseId && transports[previousResponseId]) {
        transports[previousResponseId].lastActive = Date.now();
        transport = transports[previousResponseId].transport;
        console.log('Reusing session via previous_response_id:', previousResponseId);
      } else if (!sessionId && req.method === 'POST') {
        const server = createServer();
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = { transport: newTransport, lastActive: Date.now() };
            console.log('Session initialized:', sid);
          }
        });
        transports[newTransport.sessionId!] = { transport: newTransport, lastActive: Date.now() };
        newTransport.onclose = () => {
          console.log('[MCP] Transport closed:', newTransport.sessionId);
          delete transports[newTransport.sessionId!];
          browserManager.close();
        };
        await server.connect(newTransport);
        transport = newTransport;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Invalid request' },
          id: req.body?.id ?? null
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    });

    // Server info endpoint
    app.get('/', (req: any, res: any) => {
      res.json({
        name: 'webpilot-mcp',
        version: '1.0.0',
        description: 'WebPilot MCP Server for browser automation'
      });
    });

    app.get('/health', (req: any, res: any) => {
      res.json({ status: 'ok' });
    });

    // Error handling middleware
    app.use((err: Error, req: any, res: any, next: any) => {
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    });

    // HTTP server start
    const PORT = parseInt(process.env.MCP_SERVER_PORT || '3000');
    const HOST = process.env.MCP_SERVER_HOST || 'localhost';

    app.listen(PORT, HOST, () => {
      console.log(`WebPilot MCP Server running on http://${HOST}:${PORT}`);
    });
  };

  setupHttpServer();
}
