/** Centralized timeout configuration for all operations */

export const timeouts = {
  // Browser lifecycle
  browserLaunch: 30000,

  // Navigation
  pageNavigate: 15000,
  pageGoBack: 15000,
  pageGoForward: 15000,
  postNavigateDelay: 500,

  // Actions
  defaultActionTimeout: 5000,
  defaultWaitMs: 1000,
  defaultWaitSelectorTimeout: 10000,
  boundingBox: 5000,
  boundingBoxRetry: 3000,
  scrollIntoView: 5000,

  // Scrolling
  postScrollDelay: 2000,
  postScrollToDelay: 2000,
  perStepScrollDelay: 40,
  baseScrollDuration: 2000,
  scrollPixelsPerSecond: 400,
  maxScrollSteps: 150,
  minScrollSteps: 40,

  // Mouse movement
  perStepMouseDelay: 30,

  // Click human-like delays (randomized ranges)
  preClickMin: 300,
  preClickMax: 700,
  postClickMin: 500,    
  postClickMax: 1000,
  postScrollReadMin: 2000,
  postScrollReadMax: 2500,
  linkPreClickMin: 600,
  linkPreClickMax: 1000,
  linkPostClickMin: 1500,
  linkPostClickMax: 2500,
  textPreClickMin: 500,
  textPreClickMax: 1000,
  textPostClickMin: 800,
  textPostClickMax: 1500,
  scrollPreStartMin: 400,
  scrollPreStartMax: 700,

  // Misc
  retryDelay: 200,
} as const;

/** Random delay between min and max (inclusive) */
export function randomDelay(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
