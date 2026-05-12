import { z } from 'zod';

export const executeTaskInputSchema = z.object({
  url: z.string().url().max(2048).optional(),
  instructions: z.string().min(1).max(10000).optional(),
  // Accept 'instruction' as alias (model may send either)
  instruction: z.string().min(1).max(10000).optional(),
  timeout: z.number().int().min(1000).max(60000).optional(),
});

export const checkConsoleInputSchema = z.object({
  level: z.enum(['all', 'log', 'warn', 'error']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
});

export const checkNetworkInputSchema = z.object({
  urlPattern: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'all']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
});

export const takeScreenshotInputSchema = z.object({
  fullPage: z.boolean().default(false),
  path: z.string().optional(),
  format: z.enum(['png', 'jpeg']).default('png'),
  quality: z.number().int().min(1).max(100).optional(),
});

export const generateReportInputSchema = z.object({
  includeScreenshot: z.boolean().default(false),
  includeConsole: z.boolean().default(true),
  includeNetwork: z.boolean().default(true),
});

export const clearSessionInputSchema = z.object({
  clearCookies: z.boolean().default(true),
  clearCache: z.boolean().default(true),
});


export const getPageContentInputSchema = z.object({
  selector: z.string().optional(),
  includeHtml: z.boolean().default(false),
});

export type ExecuteTaskInput = z.infer<typeof executeTaskInputSchema>;
export type CheckConsoleInput = z.infer<typeof checkConsoleInputSchema>;
export type CheckNetworkInput = z.infer<typeof checkNetworkInputSchema>;
export type TakeScreenshotInput = z.infer<typeof takeScreenshotInputSchema>;
export type GenerateReportInput = z.infer<typeof generateReportInputSchema>;
export type ClearSessionInput = z.infer<typeof clearSessionInputSchema>;
export type GetPageContentInput = z.infer<typeof getPageContentInputSchema>;
