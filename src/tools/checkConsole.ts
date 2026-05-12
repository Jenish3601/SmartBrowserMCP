import { browserManager } from '../services/browserManager';
import { checkConsoleInputSchema } from '../types/schemas';

export const checkConsoleTool = {
  name: 'check_console',
  description: 'Get filtered console messages by level',
  inputSchema: checkConsoleInputSchema,

  async execute(input: { level: string; limit: number }) {
    const page = await browserManager.getPage();
    if (!page) {
      return { success: false, error: 'Browser not initialized' };
    }

    const messages: Array<{ type: string; text: string; timestamp: number }> = [];
    const consoleHandler = (msg: { type(): string; text(): string }) => {
      if (input.level === 'all' || msg.type() === input.level) {
        messages.push({
          type: msg.type(),
          text: msg.text(),
          timestamp: Date.now(),
        });
      }
    };

    // Attach listener
    page.on('console', consoleHandler);

    // Brief collection window
    await page.waitForTimeout(1000);

    // Remove listener immediately to prevent leak
    page.off('console', consoleHandler);

    return {
      success: true,
      data: {
        messages: messages.slice(0, input.limit),
        count: messages.length,
      },
    };
  },
};
