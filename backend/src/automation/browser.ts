import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const STORAGE_PATH = join(process.cwd(), 'storage');
const COOKIES_PATH = join(STORAGE_PATH, 'cookies.json');
const USER_DATA_DIR = join(STORAGE_PATH, 'browser-profile');

export type LogCallback = (message: string, type?: 'info' | 'error' | 'success' | 'warning') => void;

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private log: LogCallback;

  constructor(logCallback?: LogCallback) {
    this.log = logCallback || ((msg) => console.log(msg));
  }

  async initialize(): Promise<Page> {
    this.log('Launching browser with persistent profile...');

    // Ensure storage directory exists
    if (!existsSync(STORAGE_PATH)) {
      mkdirSync(STORAGE_PATH, { recursive: true });
    }

    // Use persistent context - this saves ALL browser data including:
    // cookies, localStorage, sessionStorage, IndexedDB, service workers, etc.
    // This is the key to avoiding re-verification!
    this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Get existing page or create new one
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    // Add stealth mode scripts
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

    this.log('Browser initialized with persistent profile', 'success');
    this.log(`Profile saved at: ${USER_DATA_DIR}`, 'info');
    return this.page;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }

  async saveCookies(): Promise<void> {
    if (!this.context) return;

    try {
      const storageDir = dirname(COOKIES_PATH);
      if (!existsSync(storageDir)) {
        mkdirSync(storageDir, { recursive: true });
      }

      const storage = await this.context.storageState();
      writeFileSync(COOKIES_PATH, JSON.stringify(storage, null, 2));
      this.log('Session state saved', 'success');
    } catch (error) {
      this.log(`Failed to save session: ${error}`, 'warning');
    }
  }

  async close(): Promise<void> {
    // Save session state before closing
    await this.saveCookies();

    if (this.page) {
      // Don't close the page, just clear reference
      this.page = null;
    }
    if (this.context) {
      // Close persistent context - this saves all browser data automatically
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.log('Browser closed - session preserved in profile', 'success');
  }

  async screenshot(name: string): Promise<void> {
    if (!this.page) return;

    const screenshotDir = join(STORAGE_PATH, 'screenshots');
    if (!existsSync(screenshotDir)) {
      mkdirSync(screenshotDir, { recursive: true });
    }

    const path = join(screenshotDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path, fullPage: false });
    this.log(`Screenshot saved: ${path}`);
  }

  async waitForSelector(selector: string, timeout = 30000): Promise<void> {
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

  async waitAndClick(selector: string, timeout = 30000): Promise<void> {
    await this.waitForSelector(selector, timeout);
    await this.click(selector);
  }

  async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}
