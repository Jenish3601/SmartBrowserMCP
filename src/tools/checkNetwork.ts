import { browserManager } from '../services/browserManager';
import { checkNetworkInputSchema } from '../types/schemas';
import { Request } from 'playwright';

export const checkNetworkTool = {
  name: 'check_network',
  description: 'Monitor filtered network requests',
  inputSchema: checkNetworkInputSchema,

  async execute(input: { urlPattern?: string; method: string; limit: number }) {
    const page = await browserManager.getPage();
    if (!page) {
      return { success: false, error: 'Browser not initialized' };
    }

    const requests: Array<{
      url: string;
      method: string;
      status: number;
      timestamp: number;
      requestHeaders?: Record<string, string>;
      requestBody?: string;
      responseHeaders?: Record<string, string>;
      responseBody?: string;
      duration?: number;
    }> = [];

    const requestHandler = async (request: Request) => {
      if (input.method === 'all' || request.method() === input.method) {
        if (!input.urlPattern || request.url().includes(input.urlPattern)) {
          const response = await request.response();
          const startTime = Date.now();

          let responseBody: string | undefined;
          let responseHeaders: Record<string, string> | undefined;
          if (response) {
            try {
              responseBody = await response.text().catch(() => undefined);
            } catch {
              responseBody = undefined;
            }
            try {
              responseHeaders = response.headers();
            } catch {
              responseHeaders = undefined;
            }
          }

          requests.push({
            url: request.url(),
            method: request.method(),
            status: response ? response.status() : 0,
            timestamp: startTime,
            requestHeaders: request.headers(),
            requestBody: request.postData() ?? undefined,
            responseHeaders,
            responseBody,
            duration: response ? Date.now() - startTime : undefined,
          });
        }
      }
    };

    // Attach listener
    page.on('request', requestHandler);

    // Brief collection window
    await page.waitForTimeout(1000);

    // Remove listener immediately to prevent leak
    page.off('request', requestHandler);

    return {
      success: true,
      data: {
        requests: requests.slice(0, input.limit),
        count: requests.length,
      },
    };
  },
};
