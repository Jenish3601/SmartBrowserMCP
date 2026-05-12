import { browserManager } from '../services/browserManager';
import { takeScreenshotInputSchema } from '../types/schemas';
import * as path from 'path';

export const takeScreenshotTool = {
  name: 'take_screenshot',
  description: 'Capture screenshot with viewport options',
  inputSchema: takeScreenshotInputSchema,

  async execute(input: { fullPage?: boolean; path?: string; format?: 'png' | 'jpeg'; quality?: number }) {
    const page = await browserManager.getPage();
    if (!page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      const screenshotPath = input.path || `./screenshot-${Date.now()}.${input.format || 'png'}`;

      const buffer = await page.screenshot({
        fullPage: input.fullPage ?? false,
        path: screenshotPath,
        type: input.format || 'png',
        quality: input.quality,
      });

      return {
        success: true,
        data: { path: screenshotPath, size: buffer.length },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot failed',
      };
    }
  },
};
