import { browserManager } from '../services/browserManager';
import { getPageContentInputSchema } from '../types/schemas';
import type { z } from 'zod';

export const getPageContentTool = {
  name: 'get_page_content',
  description: 'Extract text content from the page or a specific element. Returns readable text content for verification and analysis.',
  inputSchema: getPageContentInputSchema,

  async execute(input: z.infer<typeof getPageContentInputSchema>) {
    const page = await browserManager.getPage();
    if (!page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      let content: string | null;
      let html: string | undefined;

      if (input.selector) {
        // Get content from specific element
        const locator = page.locator(input.selector).first();
        content = await locator.textContent();
        
        if (input.includeHtml) {
          html = await locator.innerHTML();
        }
      } else {
        // Get all page text
        content = await page.evaluate(() => document.body.innerText);
        
        if (input.includeHtml) {
          html = await page.evaluate(() => document.body.innerHTML);
        }
      }

      return {
        success: true,
        data: {
          text: content,
          html,
          url: page.url(),
          title: await page.title(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get page content',
      };
    }
  },
};
