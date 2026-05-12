import { browserManager } from '../services/browserManager';
import { clearSessionInputSchema } from '../types/schemas';

export const clearSessionTool = {
  name: 'clear_session',
  description: 'Clean up all browser data securely',
  inputSchema: clearSessionInputSchema,

  async execute(input: { clearCookies?: boolean; clearCache?: boolean }) {
    try {
      if (input.clearCookies) {
        await browserManager.clearCookies();
      }

      if (input.clearCache) {
        await browserManager.clearCache();
      }

      return {
        success: true,
        data: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear session',
      };
    }
  },
};
