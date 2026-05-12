import { url, z } from 'zod';
import { browserManager } from '../services/browserManager';
import { sanitizeUrl, sanitizeInput } from '../services/inputSanitizer';
import { executeTaskInputSchema } from '../types/schemas';
import { timeouts } from '../config/timeouts';

export const executeTaskTool = {
  name: 'execute_task',
  description: 'Execute any task on a website using natural language instructions',
  inputSchema: executeTaskInputSchema,

  async execute(input: z.infer<typeof executeTaskInputSchema>) {
    const rawInstructions = (input as any).instructions || (input as any).instruction || '';
    let url = input.url;

    if (!url && rawInstructions) {
      // First try to match URLs with protocol
      let urlInText = rawInstructions.match(/https?:\/\/[^\s,;)'"]+/i);
      if (urlInText) {
        url = urlInText[0];
      } else {
        // If no protocol found, try to match domain names
        const domainMatch = rawInstructions.match(/(?:open\s+this\s+website\s+)?([a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)(?:\s|$|[.,;)'"])/i);
        if (domainMatch) {
          url = domainMatch[1];
        }
      }
    }

    let instructions = rawInstructions;

    if (!url && !instructions) {
      return {
        success: false,
        error: 'Please provide either a URL or instructions',
      };
    }

    let initialized = false;
    let retries = 0;
    const maxRetries = 1;

    while (!initialized && retries <= maxRetries) {
      try {
        initialized = await browserManager.ensureInitialized();
        if (!initialized) {
          throw new Error('Failed to initialize browser');
        }
      } catch (initError) {
        retries++;
        if (retries > maxRetries) {
          return {
            success: false,
            error: initError instanceof Error ? initError.message : 'Failed to initialize browser',
          };
        }
        await new Promise(r => setTimeout(r, timeouts.retryDelay));
      }
    }

    try {
      let safeUrl: string | undefined;
      if (url) {
        try {
          safeUrl = sanitizeUrl(url);
          await browserManager.navigateTo(safeUrl);
        } catch (urlError) {
          return {
            success: false,
            error: urlError instanceof Error ? urlError.message : 'Invalid URL provided',
          };
        }
      }

      if (!instructions) {
        return {
          success: true,
          data: { url: safeUrl },
        };
      }

      const safeInstructions = sanitizeInput(instructions);
      
      const actions = parseInstructions(safeInstructions, url);
      const optimized = actions;
      const MAX_RETRIES = 2;
      const results = [];

      for (let i = 0; i < optimized.length; i++) {
        const action = optimized[i];
        let lastError: unknown;
        let result: unknown = null;
        let attempt = 0;

        for (attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            result = await browserManager.executeAction(action.type, action.params);
            if (attempt > 0) {
              console.log(`[execute_task] Action "${action.type}" succeeded on retry ${attempt}`);
            }
            break;
          } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES) {
              const delay = timeouts.retryDelay * Math.pow(2, attempt);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        }

        if (attempt > MAX_RETRIES) {
          results.push({ success: false, error: lastError instanceof Error ? lastError.message : String(lastError) });
        } else {
          results.push(result);
        }
      }

      return {
        success: true,
        data: { actions: results },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Task execution failed',
      };
    } finally {
      console.log('[execute_task] Tool execution completed — returning response');
    }
  },
};

function parseInstructions(instructions: string, existingUrl?: string): Array<{ type: string; params: Record<string, unknown> }> {
  const actions: Array<{ type: string; params: Record<string, unknown> }> = [];
  
  // Split instructions into logical parts (by "and", "then", or punctuation)
  // but don't split URLs or decimal numbers
  const parts = instructions
    .split(/\b(?:and|then)\b|[;,]|\n/i)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  for (const part of parts) {
    const lower = part.toLowerCase();

    // 1. Navigation (Internal)
    if (!existingUrl && actions.length === 0) {
      const navigateMatch = part.match(/(?:go to|open|navigate to|visit)(?:\s+this\s+website)?\s*([a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s,]*)/i);
      if (navigateMatch) {
        let targetUrl = navigateMatch[1];
        if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
        actions.push({ type: 'navigate', params: { url: targetUrl } });
        continue;
      }
    }

    // 2. Search
    const searchMatch = part.match(/(?:search\s+(?:for\s+)?|find\s+)["'](.+?)["']/i);
    if (searchMatch) {
      actions.push({ type: 'search', params: { query: searchMatch[1] } });
      continue;
    }

    // 3. Screenshot
    if (lower.includes('screenshot') || lower.includes('take a photo') || lower.includes('capture the page') || lower.includes('capture screen')) {
      actions.push({ type: 'screenshot', params: {} });
      continue;
    }

    // 4. Scroll Logic (More flexible regex)
    const isScrollToBottom = /scroll\s+.*(?:bottom|footer)/i.test(part);
    const isScrollToTop = /scroll\s+.*top/i.test(part);

    if (isScrollToBottom) {
      actions.push({ type: 'scroll', params: { direction: 'bottom' } });
      continue;
    } else if (isScrollToTop) {
      actions.push({ type: 'scroll', params: { direction: 'top' } });
      continue;
    }

    const scrollDownMatch = part.match(/scroll\s+down(?:\s+by\s+(\d+)\s*(?:px|pixels)?)?/i);
    if (scrollDownMatch) {
      actions.push({ type: 'scroll', params: { direction: 'down', amount: parseInt(scrollDownMatch[1] || '1000') } });
      continue;
    }

    const scrollUpMatch = part.match(/scroll\s+up(?:\s+by\s+(\d+)\s*(?:px|pixels)?)?/i);
    if (scrollUpMatch) {
      actions.push({ type: 'scroll', params: { direction: 'up', amount: parseInt(scrollUpMatch[1] || '1000') } });
      continue;
    }

    const scrollToElementMatch = part.match(/scroll\s+to\s+(?:the\s+)?(.+)/i);
    if (scrollToElementMatch) {
      actions.push({ type: 'scroll', params: { selector: scrollToElementMatch[1].trim() } });
      continue;
    }

    // 5. Click / Find / Open / Navigate / Press (Text-based clicking)
    // Updated to skip "on", "the", etc. correctly
    const clickMatch = part.match(/(?:click|find|open|navigate\s+to|press|select|hit)\s+(?:on\s+)?(?:the\s+)?(?:link|button|tab|page|section|element|item|text)?(?:\s+(?:named|called|with\s+text|with\s+name))?\s*["']?([^"']+)["']?/i);
    if (clickMatch) {
      const rawText = clickMatch[1].trim();
      const lowerText = rawText.toLowerCase();
      
      // Skip pointer words like "that", "this", "it" unless they are in quotes
      const isPointer = ['that', 'this', 'it', 'the', 'link', 'button', 'website', 'site', 'homepage'].includes(lowerText) || lowerText.startsWith('that ') || lowerText.startsWith('this ');
      const isQuoted = part.includes(`"${rawText}"`) || part.includes(`'${rawText}'`);

      // Skip if the text looks like a URL or is the same as the current site
      const isUrlLike = lowerText.includes('.') && !lowerText.includes(' ');
      const isAlreadyTarget = existingUrl && (existingUrl.toLowerCase().includes(lowerText) || lowerText.includes(existingUrl.toLowerCase()));

      if ((!isPointer || isQuoted) && !isUrlLike && !isAlreadyTarget) {
        // Clean up text if it ends with "page", "link", etc. that were part of the natural language
        const cleanedText = rawText.replace(/\s+(?:page|link|tab|button|section)$/i, '').trim();
        
        // Avoid duplicate clicks in the same task
        const isDuplicate = actions.some(a => a.type === 'click_link' && (a.params.text as string).toLowerCase() === cleanedText.toLowerCase());
        if (!isDuplicate) {
          actions.push({ type: 'click_link', params: { text: cleanedText } });
        }
        continue;
      }
    }

    // 6. Click by Selector
    const clickSelectorMatch = part.match(/click\s+(?:element\s+|selector\s+)?(#[\w-]+|\.[\w-]+|\[[\w]+\])/i);
    if (clickSelectorMatch) {
      actions.push({ type: 'click', params: { selector: clickSelectorMatch[1].trim() } });
      continue;
    }

    // 7. Fill / Type
    const fillMatch = part.match(/(?:enter|input|type)\s+(?:["']([^"']+)["']\s+(?:in|into|to)\s+(?:the\s+)?["']([^"']+)["'])/i);
    if (fillMatch) {
      actions.push({ type: 'type', params: { selector: fillMatch[2], text: fillMatch[1] } });
      continue;
    }

    // 8. Wait
    const waitMatch = part.match(/wait\s+(?:for\s+)?(\d+)\s*(ms|seconds?|s)?/i);
    if (waitMatch) {
      let ms = parseInt(waitMatch[1]);
      const unit = waitMatch[2]?.toLowerCase();
      if (unit === 's' || unit === 'second' || unit === 'seconds') ms *= 1000;
      actions.push({ type: 'wait', params: { ms } });
      continue;
    }

    const waitForSelectorMatch = part.match(/wait\s+for\s+(?:the\s+)?(.+)/i);
    if (waitForSelectorMatch) {
      actions.push({ type: 'wait', params: { selector: waitForSelectorMatch[1].trim() } });
      continue;
    }

    // 9. Hover
    const hoverMatch = part.match(/hover\s+(?:over\s+)?["']?([^"']+)["']?/i);
    if (hoverMatch) {
      actions.push({ type: 'hover', params: { selector: hoverMatch[1].trim() } });
      continue;
    }

    // 10. Press Key
    const pressKeyMatch = part.match(/press\s+(?:the\s+)?(?:key\s+)?["']?([^"']+)["']?/i);
    if (pressKeyMatch) {
      actions.push({ type: 'press_key', params: { key: pressKeyMatch[1].trim() } });
      continue;
    }

    // 11. Navigate Back / Forward
    if (lower.includes('go back') || lower.includes('navigate back') || lower.includes('previous page')) {
      actions.push({ type: 'go_back', params: {} });
      continue;
    }
    if (lower.includes('go forward') || lower.includes('navigate forward') || lower.includes('next page')) {
      actions.push({ type: 'go_forward', params: {} });
      continue;
    }

    // 12. Extraction
    if (lower.includes('get text') || lower.includes('extract text')) {
      const getTextMatch = part.match(/get\s+text\s+(?:from\s+)?["']?([^"']+)["']?/i);
      actions.push({ type: 'get_text', params: { selector: getTextMatch?.[1] } });
      continue;
    }
    if (lower.includes('get title') || lower.includes('page title')) {
      actions.push({ type: 'get_title', params: {} });
      continue;
    }
    if (lower.includes('get url') || lower.includes('current url')) {
      actions.push({ type: 'get_url', params: {} });
      continue;
    }
  }

  return actions;
}


/** Remove redundant scroll actions that are followed by click_link/click_text
 * (click actions already handle scrolling internally) */
function removeRedundantScroll(
  actions: Array<{ type: string; params: Record<string, unknown> }>
): Array<{ type: string; params: Record<string, unknown> }> {
  const result: Array<{ type: string; params: Record<string, unknown> }> = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const nextAction = actions[i + 1];

    if (
      action.type === 'scroll' &&
      nextAction &&
      ['click_link', 'click_text', 'click'].includes(nextAction.type)
    ) {
      continue;
    }

    result.push(action);
  }

  return result;
}
