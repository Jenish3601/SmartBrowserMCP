import { z } from 'zod';
import sanitizeHtmlLib from 'sanitize-html';

const urlValidationSchema = z.string().url().max(2048);

/**
 * Sanitize natural language input (instructions from user).
 * Uses sanitize-html to strip all dangerous HTML/script content.
 * This library is well-tested and handles edge cases like:
 * - Nested tags (<scscript>)
 * - Newline injection
 * - Encoded characters
 * - Obfuscated event handlers
 */
export function sanitizeInput(input: string): string {
  const trimmed = input.trim();

  // Strip all HTML/script content using sanitize-html
  const sanitized = sanitizeHtmlLib(trimmed, {
    allowedTags: [], // no HTML tags allowed
    allowedAttributes: {}, // no attributes allowed
    disallowedTagsMode: 'discard',
  });

  return sanitized.trim();
}

/**
 * Sanitize and validate URL.
 * Uses Zod for format validation + protocol whitelist.
 */
export function sanitizeUrl(url: string): string {
  let processedUrl = url.trim();

  if (!processedUrl) {
    throw new Error('URL is required');
  }

  if (!processedUrl.match(/^https?:\/\//i)) {
    processedUrl = 'https://' + processedUrl;
  }

  try {
    const validated = urlValidationSchema.parse(processedUrl);
    const parsed = new URL(validated);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols allowed');
    }

    return validated;
  } catch (error) {
    throw new Error('Invalid URL provided');
  }
}

export function sanitizeUrlOptional(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return sanitizeUrl(url);
}

/**
 * Sanitize a CSS selector string.
 * Removes characters that could break selector parsing.
 */
export function sanitizeSelector(selector: string): string {
  const dangerousChars = /[<>'"\\]/g;
  return selector.replace(dangerousChars, '');
}
