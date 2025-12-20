import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { DelayService, SpeedProfile, SpeedProfileType } from './delays.js';

// ============================================================================
// Types
// ============================================================================

export type LogCallback = (message: string, type?: 'info' | 'error' | 'success' | 'warning') => void;

// ============================================================================
// Configuration
// ============================================================================

// Use STORAGE_PATH env var if set (for Electron), otherwise default to ./storage
const STORAGE_BASE = process.env.STORAGE_PATH || join(process.cwd(), 'storage');

const CONFIG = {
  PATHS: {
    STORAGE: STORAGE_BASE,
    get COOKIES() { return join(this.STORAGE, 'cookies.json'); },
    get USER_DATA_DIR() { return join(this.STORAGE, 'browser-profile'); },
    get SCREENSHOTS() { return join(this.STORAGE, 'screenshots'); },
  },

  BROWSER: {
    HEADLESS: false,
    VIEWPORT: { width: 1920, height: 1080 },
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ARGS: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    IGNORE_DEFAULT_ARGS: ['--enable-automation'],
  },

  TIMEOUTS: {
    DEFAULT: 30000,
  },
};

// ============================================================================
// Stealth Scripts
// ============================================================================

const STEALTH_SCRIPTS = {
  hideWebdriver: () => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  },

  mockPlugins: () => {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  },

  mockLanguages: () => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'ru'],
    });
  },
};

// ============================================================================
// BrowserManager Class
// ============================================================================

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private log: LogCallback;
  private delayService: DelayService;
  private isAborting = false;

  constructor(logCallback?: LogCallback, speedProfile?: SpeedProfileType) {
    this.log = logCallback || ((msg) => console.log(msg));
    this.delayService = new DelayService(speedProfile || SpeedProfile.Normal);
  }

  // ==========================================================================
  // Delay Service Access
  // ==========================================================================

  getDelayService(): DelayService {
    return this.delayService;
  }

  setSpeedProfile(profile: SpeedProfileType): void {
    this.delayService.setProfile(profile);
    this.log(`Speed profile set to: ${profile}`, 'info');
  }

  getSpeedProfile(): SpeedProfileType {
    return this.delayService.getProfile();
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  async initialize(): Promise<Page> {
    this.log('Launching browser with persistent profile...');

    this.ensureStorageDirectory();

    this.context = await this.createPersistentContext();
    this.page = await this.getOrCreatePage();

    await this.injectStealthScripts();

    this.log('Browser initialized with persistent profile', 'success');
    this.log(`Profile saved at: ${CONFIG.PATHS.USER_DATA_DIR}`, 'info');

    return this.page;
  }

  async close(): Promise<void> {
    await this.saveCookies();

    if (this.page) {
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.log('Browser closed - session preserved in profile', 'success');
  }

  /**
   * Abort any in-flight Playwright actions by closing the current page and creating a fresh one.
   * This is used for "Stop" so we can cancel immediately (Playwright actions are not cancellable otherwise).
   */
  async abortCurrentPage(reason = 'stop'): Promise<void> {
    if (this.isAborting) return;
    this.isAborting = true;

    try {
      this.log(`Aborting current browser page (${reason})...`, 'warning');

      const existingPage = this.page;
      this.page = null;

      // Closing the page forces any pending locators/clicks/waits to reject immediately.
      if (existingPage) {
        await existingPage.close({ runBeforeUnload: false }).catch(() => undefined);
      }

      if (this.context) {
        this.page = await this.getOrCreatePage();
        await this.injectStealthScripts();
        this.log('Browser page reset', 'success');
      }
    } finally {
      this.isAborting = false;
    }
  }

  // ==========================================================================
  // Page Access
  // ==========================================================================

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  async saveCookies(): Promise<void> {
    if (!this.context) return;

    try {
      this.ensureDirectory(dirname(CONFIG.PATHS.COOKIES));

      const storage = await this.context.storageState();
      writeFileSync(CONFIG.PATHS.COOKIES, JSON.stringify(storage, null, 2));

      this.log('Session state saved', 'success');
    } catch (error) {
      this.log(`Failed to save session: ${error}`, 'warning');
    }
  }

  // ==========================================================================
  // Element Interactions
  // ==========================================================================

  async waitForSelector(selector: string, timeout = CONFIG.TIMEOUTS.DEFAULT): Promise<void> {
    await this.getPage().waitForSelector(selector, { timeout });
  }

  async click(selector: string): Promise<void> {
    await this.getPage().click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.getPage().fill(selector, value);
  }

  async getText(selector: string): Promise<string> {
    return await this.getPage().textContent(selector) || '';
  }

  async isVisible(selector: string): Promise<boolean> {
    try {
      return await this.getPage().isVisible(selector);
    } catch {
      return false;
    }
  }

  async waitAndClick(selector: string, timeout = CONFIG.TIMEOUTS.DEFAULT): Promise<void> {
    await this.waitForSelector(selector, timeout);
    await this.click(selector);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Sleep for specified duration
   * @param ms - Duration in milliseconds. If 0 or negative, uses profile-based action delay
   */
  async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      await this.delayService.actionDelay();
    } else {
    await new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  /**
   * Wait with profile-based delay
   */
  async actionDelay(): Promise<void> {
    await this.delayService.actionDelay();
  }

  /**
   * Short delay for rapid sequences
   */
  async shortDelay(): Promise<void> {
    await this.delayService.shortDelay();
  }

  /**
   * Long delay for important actions
   */
  async longDelay(): Promise<void> {
    await this.delayService.longDelay();
  }

  /**
   * Human-like mouse movement to coordinates
   */
  async humanMove(x: number, y: number): Promise<void> {
    if (!this.page) return;
    await this.delayService.mouseMove(this.page, x, y);
  }

  /**
   * Human-like click at coordinates
   */
  async humanClick(x: number, y: number): Promise<void> {
    if (!this.page) return;
    await this.delayService.click(this.page, x, y);
  }

  /**
   * Human-like text typing
   */
  async humanType(selector: string, text: string): Promise<void> {
    if (!this.page) return;
    await this.delayService.typeText(this.page, selector, text);
  }

  async screenshot(name: string): Promise<void> {
    if (!this.page) return;

    this.ensureDirectory(CONFIG.PATHS.SCREENSHOTS);

    const path = join(CONFIG.PATHS.SCREENSHOTS, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path, fullPage: false });

    this.log(`Screenshot saved: ${path}`);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async createPersistentContext(): Promise<BrowserContext> {
    return await chromium.launchPersistentContext(CONFIG.PATHS.USER_DATA_DIR, {
      headless: CONFIG.BROWSER.HEADLESS,
      viewport: CONFIG.BROWSER.VIEWPORT,
      userAgent: CONFIG.BROWSER.USER_AGENT,
      args: CONFIG.BROWSER.ARGS,
      ignoreDefaultArgs: CONFIG.BROWSER.IGNORE_DEFAULT_ARGS,
    });
  }

  private async getOrCreatePage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Context not initialized');
    }

    const pages = this.context.pages();
    return pages.length > 0 ? pages[0] : await this.context.newPage();
  }

  private async injectStealthScripts(): Promise<void> {
    if (!this.page) return;

    await this.page.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'ru'],
      });
    });
  }

  private ensureStorageDirectory(): void {
    this.ensureDirectory(CONFIG.PATHS.STORAGE);
  }

  private ensureDirectory(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
}
