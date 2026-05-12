# SmartBrowserMCP

A Model Context Protocol (MCP) server that provides web automation capabilities through browser control tools.

## Overview

SmartBrowserMCP is a TypeScript/Node.js server that implements the Model Context Protocol to expose browser automation functionality. It uses Playwright for browser management and provides tools for web testing, monitoring, and automation tasks.

## Features

- **Browser Automation**: Control web browsers programmatically
- **Element Interaction**: Click elements by CSS selector, text content, or link text
- **Content Extraction**: Extract text and HTML content from pages or specific elements
- **Page Navigation**: Scroll pages and navigate web content
- **Console Monitoring**: Check browser console logs and errors
- **Network Monitoring**: Monitor network requests and responses
- **Screenshot Capture**: Take screenshots of web pages
- **Task Execution**: Execute custom automation tasks
- **Report Generation**: Generate detailed reports of browser sessions
- **Session Management**: Clear and manage browser sessions

## Installation

```bash
npm install
```

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file (optional):
   ```env
   MCP_SERVER_PORT=3000
   MCP_SERVER_HOST=0.0.0.0
   MCP_TRANSPORT=stdio
   BROWSER_HEADLESS=true
   BROWSER_SLOW_MO=0
   BROWSER_TIMEOUT=30000
   LOG_LEVEL=info
   ```

### Building

```bash
npm run build
```

### Running

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### Transport Modes

The server supports two transport modes controlled by the `MCP_TRANSPORT` environment variable:

#### STDIO Mode (Default)
For MCP clients like Claude Desktop, Cursor, and other MCP-compatible applications.

**Run in STDIO mode:**
```bash
# Default mode (no env var needed)
npm run build
npm start

# Explicit STDIO mode
MCP_TRANSPORT=stdio
```

#### HTTP Mode
For direct API usage and web-based integration.

**Run in HTTP mode:**
```bash
MCP_TRANSPORT=http
```

**Using npm link (global command):**
```bash
npm link
smartbrowser-mcp
```

**MCP Client Configuration:**

For Claude Desktop, add to your MCP config:
```json
{
  "mcpServers": {
    "smartbrowser": {
      "command": "npx",
      "args": [
        "smartbrowsermcp@latest"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "BROWSER_HEADLESS": "true"
      }
    }
  }
}
```

**Visible Browser Mode:**
To see the browser automation in real-time, set `BROWSER_HEADLESS` to `false`:
```json
{
  "mcpServers": {
    "smartbrowser": {
      "command": "npx",
      "args": [
        "smartbrowsermcp@latest"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "BROWSER_HEADLESS": "false"
      }
    }
  }
}
```

Or using local path:
```json
{
  "mcpServers": {
    "smartbrowser": {
      "command": "node",
      "args": ["/var/www/html/LMStudio/WebPilotMCP/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "BROWSER_HEADLESS": "false"
      }
    }
  }
}
```

**Mode Differences:**
- **HTTP Mode**: For direct API usage and testing. Server runs on configured port (default: 3000)
- **STDIO Mode**: For MCP clients. Communicates via stdin/stdout using JSON-RPC protocol
- **Headless Mode** (default): Browser runs in background, not visible to user
- **Visible Mode** (`BROWSER_HEADLESS=false`): Browser window opens, users can watch automation

## Available Tools

The server provides the following MCP tools:

- `executeTask`: Execute custom automation tasks
- `checkConsole`: Monitor browser console for logs and errors
- `checkNetwork`: Monitor network activity
- `takeScreenshot`: Capture screenshots of web pages
- `generateReport`: Generate detailed session reports
- `clearSession`: Clear browser session data
- `click_element`: Click elements by CSS selector, text content, or link text
- `get_page_content`: Extract text and HTML content from pages or specific elements
- `scrollPage`: Scroll pages up/down or to specific positions

## API Endpoints

- `GET /api/mcp`: MCP server endpoint (SSE transport)
- `POST /api/mcp`: MCP message handling endpoint
- `GET /`: Server information endpoint
- `GET /health`: Health check endpoint

## Configuration

The server can be configured via environment variables:

### Server Configuration
- `MCP_SERVER_PORT`: Server port (default: 3000)
- `MCP_SERVER_HOST`: Server host (default: 0.0.0.0)
- `MCP_TRANSPORT`: Transport mode - `stdio` or `http` (default: stdio)

### Browser Configuration
- `BROWSER_HEADLESS`: Run browser in headless mode (default: true)
- `BROWSER_SLOW_MO`: Slow down operations by specified milliseconds (default: 0)
- `BROWSER_TIMEOUT`: Browser operation timeout in milliseconds (default: 30000)

### Logging Configuration
- `LOG_LEVEL`: Logging level (default: info)

### Advanced Configuration
- `PLAYWRIGHT_BROWSERS_PATH`: Custom path to Playwright browsers

## Project Structure

```
src/
├── config/
│   └── server.ts          # Server configuration
├── services/
│   ├── browserManager.ts  # Browser instance management
│   └── inputSanitizer.ts  # Input sanitization utilities
├── tools/
│   ├── checkConsole.ts    # Console monitoring tool
│   ├── checkNetwork.ts    # Network monitoring tool
│   ├── clearSession.ts    # Session management tool
│   ├── clickElement.ts    # Element interaction tool
│   ├── executeTask.ts     # Custom task execution
│   ├── generateReport.ts  # Report generation tool
│   ├── getPageContent.ts  # Content extraction tool
│   ├── scrollPage.ts      # Page scrolling tool
│   └── takeScreenshot.ts # Screenshot capture tool
├── types/
│   ├── index.ts           # Type definitions
│   └── schemas.ts         # Zod schemas for validation
└── index.ts               # Main server entry point
```

## Dependencies

- **@modelcontextprotocol/sdk**: MCP SDK for server implementation
- **@modelcontextprotocol/server**: MCP server utilities
- **playwright**: Browser automation
- **express**: Web server framework
- **zod**: Schema validation
- **dotenv**: Environment variable management
- **sanitize-html**: HTML sanitization for security

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please use the project's issue tracker.
