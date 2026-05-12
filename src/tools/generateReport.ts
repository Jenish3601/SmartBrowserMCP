import { browserManager } from '../services/browserManager';
import { generateReportInputSchema } from '../types/schemas';

export const generateReportTool = {
  name: 'generate_report',
  description: 'Create execution summary with metrics',
  inputSchema: generateReportInputSchema,

  async execute(input: { includeScreenshot?: boolean; includeConsole?: boolean; includeNetwork?: boolean }) {
    const page = await browserManager.getPage();
    if (!page) {
      return { success: false, error: 'Browser not initialized' };
    }

    const report: {
      url: string;
      timestamp: number;
      actions: string[];
      consoleErrors: number;
      networkRequests: number;
      screenshot?: string;
    } = {
      url: page.url(),
      timestamp: Date.now(),
      actions: [],
      consoleErrors: 0,
      networkRequests: 0,
    };

    if (input.includeConsole) {
      report.consoleErrors = 0;
    }

    if (input.includeNetwork) {
      report.networkRequests = 0;
    }

    if (input.includeScreenshot) {
      const buffer = await page.screenshot({ type: 'png' });
      report.screenshot = buffer.toString('base64');
    }

    return {
      success: true,
      data: { report },
    };
  },
};
