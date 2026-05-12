import { Page } from 'playwright';

export interface TaskInput {
  url: string;
  instructions: string;
  timeout?: number;
}

export interface TaskResult {
  success: boolean;
  message: string;
  data?: unknown;
  screenshot?: string;
}

export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info';
  text: string;
  timestamp: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  timestamp: number;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  path?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface ReportData {
  url: string;
  timestamp: number;
  actions: string[];
  consoleErrors: number;
  networkRequests: number;
  screenshot?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}
