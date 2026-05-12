import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { sanitizeUrl } from './inputSanitizer';
import { spawn } from 'child_process';
import path from 'path';
import { timeouts, randomDelay } from '../config/timeouts';

interface BrowserConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

interface SessionConfig {
  storageState?: string;
  proxy?: { server: string; bypass?: string };
  extraHTTPHeaders?: Record<string, string>;
}

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(config: BrowserConfig = {}): Promise<void> {
    // Reuse existing init promise if browser is already initialized or initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create promise once, atomically, before any async work
    this.initPromise = (async () => {
      // Close existing browser if any (from a previous completed initialization)
      if (this.browser) {
        try {
          await this.close();
        } catch {
          // Ignore close errors during reinit
        }
      }

      this.browser = await chromium.launch({
        headless: config.headless ?? false,
        timeout: timeouts.browserLaunch,
        channel: 'chrome', // Use Google Chrome instead of Chromium
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--start-maximized', // Open window maximized
        ],
      });

      this.context = await this.browser.newContext({
        viewport: null, // null = use actual window size
        userAgent: config.userAgent,
        ignoreHTTPSErrors: true,
      });

      this.page = await this.context.newPage();
    })();

    return this.initPromise;
  }

  async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const safeUrl = sanitizeUrl(url);
    const response = await this.page.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: timeouts.pageNavigate });

    if (!response) {
      throw new Error(`Navigation failed: no response from ${safeUrl}`);
    }

    const status = response.status();
    if (status >= 400) {
      const statusText = response.statusText() || '';
      throw new Error(`Navigation failed: ${safeUrl} returned ${status} ${statusText}`);
    }

    await this.page.waitForTimeout(timeouts.postNavigateDelay);
  }

  async executeAction(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const timeout = (params.timeout as number) || timeouts.defaultActionTimeout;

    switch (action) {
      case 'click':

        await this.page.waitForTimeout(randomDelay(timeouts.preClickMin, timeouts.preClickMax));
        await this.page.click(params.selector as string, { timeout });
        await this.page.waitForTimeout(randomDelay(timeouts.postClickMin, timeouts.postClickMax));
        break;

      case 'type':
        await this.page.fill(params.selector as string, params.text as string, { timeout });
        break;

      case 'navigate':
        await this.navigateTo(params.url as string);
        break;

      case 'scroll': {
        const direction = (params.direction as string) || 'down';
        const amount = (params.amount as number) || 1000;
        const selector = params.selector as string | undefined;

        if (selector) {
          const box = await this.page.locator(selector).first().boundingBox().catch(() => null);
          if (box) {
            const currentScroll = await this.page.evaluate(() => window.scrollY);
            const viewportHeight = await this.page.evaluate(() => window.innerHeight);
            const elementAbsoluteY = box.y + currentScroll + box.height / 2;
            
            if (elementAbsoluteY < currentScroll || elementAbsoluteY > currentScroll + viewportHeight) {
              const targetScrollY = Math.max(0, elementAbsoluteY - viewportHeight / 2);
              const dist = targetScrollY - currentScroll;
              
              if (Math.abs(dist) > 50) {
                await this._smoothScroll(0, dist);
              }
            }
          }
        } else if (direction === 'up') {
          await this._smoothScroll(0, -amount);
        } else if (direction === 'top') {
          const currentScroll = await this.page.evaluate(() => window.scrollY);
          await this._smoothScroll(0, -currentScroll);
        } else if (direction === 'bottom') {
          // Robust scroll to bottom with lazy-loading support
          let lastHeight = await this.page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
          for (let i = 0; i < 5; i++) { // Allow up to 5 height expansions
            const currentScroll = await this.page.evaluate(() => window.scrollY);
            const viewportHeight = await this.page.evaluate(() => window.innerHeight);
            const distance = lastHeight - viewportHeight - currentScroll;

            if (distance > 0) {
              await this._smoothScroll(0, distance);
              // Wait briefly for lazy content
              await this.page.waitForTimeout(800);
            }

            const newHeight = await this.page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
            if (newHeight <= lastHeight) {
              break;
            }
            lastHeight = newHeight;
          }
          // Final fallback jump to absolute bottom
          await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        } else {
          await this._smoothScroll(0, amount);
        }
        break;
      }

      case 'click_link': {
        const text = params.text as string;
        const exact = (params.exact as boolean) ?? false;
        let locator = exact
          ? this.page.getByRole('link', { name: text, exact: true })
          : this.page.getByRole('link', { name: text, exact: false });

        let count = await locator.count().catch(() => 0);

        if (count === 0) {
          locator = this.page.locator('a').filter({ hasText: new RegExp(text, 'i') });
          count = await locator.count().catch(() => 0);
        }

        if (count === 0) {
          const allLinks = await this.page.locator('a').allTextContents().catch(() => []);
          const uniqueTexts = [...new Set(allLinks.map(t => t.trim()).filter(t => t.length > 0))];

          let bestMatch: string | null = null;
          let bestScore = Infinity;
          const threshold = Math.max(2, Math.floor(text.length * 0.4));

          for (const linkText of uniqueTexts) {
            const dist = levenshtein(text.toLowerCase(), linkText.toLowerCase());
            if (dist < bestScore && dist <= threshold) {
              bestScore = dist;
              bestMatch = linkText;
            }
          }

          if (bestMatch) {
            locator = this.page.getByRole('link', { name: bestMatch, exact: true });
            count = await locator.count().catch(() => 0);
          }
        }

        if (count === 0) {
          throw new Error(`No link found matching "${text}"`);
        }

        const initialBox = await locator.first().boundingBox({ timeout: timeouts.boundingBox }).catch(() => null);
        if (!initialBox) {
          throw new Error('Cannot get element position');
        }

        const vp = this.page.viewportSize();
        const viewportHeight = vp ? vp.height : 1080;
        const currentScrollY = await this.page.evaluate(() => window.scrollY);

        // initialBox.y is relative to the viewport. 
        // We add currentScrollY to get the absolute position on the page.
        const elementAbsoluteY = initialBox.y + currentScrollY + initialBox.height / 2;
        const targetScrollY = Math.max(0, elementAbsoluteY - viewportHeight / 2);
        const scrollNeeded = targetScrollY - currentScrollY;

        if (Math.abs(scrollNeeded) > 50) {
          await this._smoothScroll(0, scrollNeeded);
          await this.page.waitForTimeout(randomDelay(timeouts.postScrollReadMin, timeouts.postScrollReadMax));
        }

        const clickInfo = await locator.first().evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const chromeHeight = window.outerHeight - window.innerHeight;
          return {
            viewportX: rect.left + rect.width / 2,
            viewportY: rect.top + rect.height / 2,
            screenX: window.screenX + rect.left + rect.width / 2,
            screenY: window.screenY + chromeHeight + rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height,
          };
        }).catch(() => null);

        if (!clickInfo) {
          throw new Error('Element lost after scroll');
        }

        const { viewportX, viewportY, screenX, screenY, width, height } = clickInfo;

        const vp2 = this.page.viewportSize();
        const startX = vp2 ? vp2.width / 2 : 960;
        const startY = vp2 ? vp2.height / 2 : 540;
        const screenStart = await this._getScreenCoords(startX, startY);
        const mouseDistance = Math.sqrt(Math.pow(viewportX - startX, 2) + Math.pow(viewportY - startY, 2));
        const mouseSteps = Math.max(15, Math.floor(mouseDistance / 40));

        await this._moveMousePyautogui(screenStart.x, screenStart.y, screenX, screenY, mouseSteps);

        await this.page.mouse.move(viewportX, viewportY);

        await this.page.waitForTimeout(randomDelay(timeouts.linkPreClickMin, timeouts.linkPreClickMax));

        await this.page.mouse.click(viewportX, viewportY);

        await this.page.waitForTimeout(randomDelay(timeouts.linkPostClickMin, timeouts.linkPostClickMax));
        break;
      }

      case 'click_text': {
        const text = params.text as string;
        const exact = (params.exact as boolean) ?? false;

        const locator = exact
          ? this.page.getByText(text, { exact: true })
          : this.page.getByText(text, { exact: false });

        await this.page.waitForTimeout(randomDelay(timeouts.textPreClickMin, timeouts.textPreClickMax));

        await locator.first().click({ timeout });

        await this.page.waitForTimeout(randomDelay(timeouts.textPostClickMin, timeouts.textPostClickMax));
        break;
      }

      case 'wait': {
        const ms = (params.ms as number) || timeouts.defaultWaitMs;
        const selector = params.selector as string | undefined;

        if (selector) {
          const waitTimeout = (params.timeout as number) || timeouts.defaultWaitSelectorTimeout;
          await this.page.waitForSelector(selector, { state: 'visible', timeout: waitTimeout });
        } else {
          await this.page.waitForTimeout(ms);
        }
        break;
      }

      case 'get_text': {
        const selector = params.selector as string | undefined;
        const content = selector
          ? await this.page.locator(selector).first().textContent({ timeout })
          : await this.page.evaluate(() => document.body.innerText);

        return { success: true, text: content };
      }

      case 'hover': {
        const selector = params.selector as string;
        await this.page.locator(selector).first().hover({ timeout });
        break;
      }

      case 'press_key': {
        const key = params.key as string;
        await this.page.keyboard.press(key);
        break;
      }

      case 'go_back':
        await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: timeouts.pageGoBack });
        break;

      case 'go_forward':
        await this.page.goForward({ waitUntil: 'domcontentloaded', timeout: timeouts.pageGoForward });
        break;

      case 'screenshot': {
        const path = (params.path as string) || `./screenshot-${Date.now()}.png`;
        await this.page.screenshot({ path, fullPage: (params.fullPage as boolean) ?? false });
        return { success: true, path };
      }

      case 'get_url':
        return { success: true, url: this.page.url() };

      case 'get_title':
        return { success: true, title: await this.page.title() };

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return { success: true };
  }

  async getPage(): Promise<Page | null> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }
    return null;
  }

  async ensureInitialized(): Promise<boolean> {
    try {
      if (this.page && !this.page.isClosed()) {
        return true;
      }

      if (this.browser && this.context) {
        this.page = await this.context.newPage();
        return true;
      }

      await this.initialize({ headless: false });
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.page) {
      try { await this.page.close(); } catch { /* ignore */ }
    }
    if (this.context) {
      try { await this.context.close(); } catch { /* ignore */ }
    }
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
    }

    this.page = null;
    this.context = null;
    this.browser = null;
    this.initPromise = null; // Reset so next call creates a new browser
  }

  async createIsolatedContext(config: SessionConfig): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    return await this.browser.newContext({
      storageState: config.storageState,
      proxy: config.proxy,
      extraHTTPHeaders: config.extraHTTPHeaders,
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
  }

  async clearCookies(): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    await this.context.clearCookies();
  }

  async clearCache(): Promise<void> {
    if (!this.page) {
      throw new Error('Browser page not initialized');
    }

    await this.page.evaluate(() => {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    });
  }

  private async _moveMousePyautogui(startX: number, startY: number, targetX: number, targetY: number, steps: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const scriptPath = path.join(__dirname, '..', '..', 'src', 'services', 'move_mouse.py');
      const child = spawn('python3', [
        scriptPath,
        startX.toFixed(1),
        startY.toFixed(1),
        targetX.toFixed(1),
        targetY.toFixed(1),
        String(steps),
      ]);

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pyautogui move exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  private async _getScreenCoords(viewportX: number, viewportY: number): Promise<{ x: number; y: number }> {
    const info = await this.page!.evaluate(({ x, y }) => {
      return {
        screenX: window.screenX,
        screenY: window.screenY,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        chromeLeft: window.outerWidth - window.innerWidth,
        chromeHeight: window.outerHeight - window.innerHeight,
        viewportX: x,
        viewportY: y,
      };
    }, { x: viewportX, y: viewportY });

    const screenX = info.screenX + info.viewportX;
    const screenY = info.screenY + info.chromeHeight + info.viewportY;

    return { x: screenX, y: screenY };
  }

  private async _smoothScroll(deltaX: number, deltaY: number): Promise<void> {
    if (!this.page) return;

    await this.page.waitForTimeout(randomDelay(timeouts.scrollPreStartMin, timeouts.scrollPreStartMax));

    const totalDistance = Math.abs(deltaY);
    if (totalDistance < 1) return;

    const scrollBefore = await this.page.evaluate(() => window.scrollY);

    // Dynamic duration calculation: target ~15px per step on average
    const steps = Math.min(200, Math.max(20, Math.floor(totalDistance / 15)));
    const delay = Math.min(50, Math.max(15, (timeouts.baseScrollDuration + (totalDistance / timeouts.scrollPixelsPerSecond) * 1000) / steps));

    let variableMomentum = 1.0;
    let lastPauseStep = -10; // Cooldown for pauses
    let pixelsSinceLastPause = 0;

    for (let i = 1; i <= steps; i++) {
      // Randomly change scroll momentum every 10 steps to simulate human speed changes
      if (i % 10 === 0) {
        variableMomentum = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
      }

      const t = i / steps;
      // Linear mapping for consistent reading speed (no slow-fast-slow jump)
      const targetY = scrollBefore + deltaY * Math.min(1, t);

      // Add a small random "vibration" to the scroll position
      const jitterPos = (Math.random() - 0.5) * 5;

      await this.page.evaluate((y) => window.scrollTo(0, y), targetY + jitterPos);

      // Natural jitter in timing (±10ms)
      const jitter = Math.random() * 20 - 10;
      // Apply momentum changes to the DELAY instead of the distance
      // This varies the speed while keeping the movement linear and readable
      const effectiveDelay = (delay + jitter) / variableMomentum;
      await this.page.waitForTimeout(Math.max(10, effectiveDelay));

      // Occasional "reading" pauses
      // Maintains a base probability (2.5%) throughout
      const pauseProbability = 0.02 + 0.02 * (1 - t);
      const minStepsBetweenPauses = 15; // Prevent consecutive pauses

      const stepDistance = Math.abs(deltaY / steps);
      pixelsSinceLastPause += stepDistance;

      // Force a pause if we've scrolled a lot without one (e.g., 800px)
      const shouldForcePause = pixelsSinceLastPause > 800;

      if ((Math.random() < pauseProbability || shouldForcePause) && i < steps - 1 && (i - lastPauseStep) > minStepsBetweenPauses) {
        const pauseTime = Math.random() * 600 + 200; // 200ms to 800ms
        await this.page.waitForTimeout(pauseTime);
        lastPauseStep = i;
        pixelsSinceLastPause = 0;
      }

      if (i % 15 === 0 || i === steps) {
        const currentPos = await this.page.evaluate(() => window.scrollY);
      }
    }

    const scrollAfter = await this.page.evaluate(() => window.scrollY);
  }

  private async _smoothScrollTo(targetY: number): Promise<void> {
    if (!this.page) return;

    await this.page.waitForTimeout(randomDelay(timeouts.scrollPreStartMin, timeouts.scrollPreStartMax));

    const currentScroll = await this.page.evaluate(() => window.scrollY);

    await this.page.evaluate((y: number) => {
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, targetY);

    await this.page.waitForTimeout(timeouts.postScrollToDelay);

    const finalScroll = await this.page.evaluate(() => window.scrollY);
  }

  private async _moveToAndClick(element: any): Promise<void> {
    if (!this.page) return;

    const box = await element.boundingBox({ timeout: timeouts.boundingBox }).catch(() => null);
    if (!box) {
      await element.click();
      return;
    }

    const viewport = this.page.viewportSize();
    const viewportHeight = viewport ? viewport.height : 1080;
    const viewportWidth = viewport ? viewport.width : 1920;
    const currentScrollY = await this.page.evaluate(() => window.scrollY);
    const elementCenterY = box.y + box.height / 2;
    const elementCenterX = box.x + box.width / 2;
    const elementInViewport = elementCenterY > currentScrollY && elementCenterY < currentScrollY + viewportHeight;

    if (!elementInViewport) {
      const dist = elementCenterY - currentScrollY - viewportHeight / 2;
      await this._smoothScroll(0, dist);
    } else {
      // Element is already visible
    }

    const newBox = await element.boundingBox({ timeout: timeouts.boundingBoxRetry }).catch(() => null);
    if (!newBox) {
      await element.click();
      return;
    }

    await this.page.waitForTimeout(randomDelay(timeouts.scrollPreStartMin, timeouts.scrollPreStartMax));

    const targetX = newBox.x + newBox.width / 2;
    const targetY = newBox.y + newBox.height / 2;
    const startX = viewport ? viewport.width / 2 : 960;
    const startY = viewport ? viewport.height / 2 : 540;

    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const x = startX + (targetX - startX) * ease;
      const y = startY + (targetY - startY) * ease;

      await this.page.mouse.move(x, y);
      await this.page.waitForTimeout(timeouts.perStepMouseDelay);
    }

    await this.page.waitForTimeout(randomDelay(timeouts.preClickMin, timeouts.preClickMax));

    await element.click();
  }
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export const browserManager = new BrowserManager();
