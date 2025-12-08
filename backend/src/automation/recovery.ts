import { Page } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';

// ============================================================================
// Types
// ============================================================================

export interface RecoveryContext {
  page: Page;
  browserManager: BrowserManager;
  error: Error;
  attemptCount: number;
  lastAction?: string;
}

export interface RecoveryStrategy {
  name: string;
  condition: (error: Error, context: RecoveryContext) => boolean;
  action: (context: RecoveryContext) => Promise<boolean>;
  maxAttempts: number;
}

export type RecoveryResult = {
  recovered: boolean;
  strategy?: string;
  attempts: number;
};

// ============================================================================
// Error Detection Helpers
// ============================================================================

const ERROR_PATTERNS = {
  NETWORK: [
    'net::ERR_',
    'NetworkError',
    'Failed to fetch',
    'timeout',
    'ECONNREFUSED',
    'ENOTFOUND',
    'socket hang up',
  ],
  SESSION_EXPIRED: [
    'session expired',
    'not logged in',
    'login required',
    'unauthorized',
    '401',
    'authentication failed',
    'Session has expired',
  ],
  ELEMENT_NOT_FOUND: [
    'element not found',
    'no element found',
    'waiting for selector',
    'Target closed',
    'Protocol error',
  ],
  PAGE_CRASHED: [
    'page crashed',
    'Target closed',
    'browser disconnected',
    'Context destroyed',
  ],
};

function matchesPattern(error: Error, patterns: string[]): boolean {
  const message = error.message.toLowerCase();
  return patterns.some(p => message.includes(p.toLowerCase()));
}

// ============================================================================
// Selectors for Recovery Actions
// ============================================================================

const RECOVERY_SELECTORS = {
  // Modal/Dialog dismissal
  MODAL_CLOSE: [
    'button.ut-button-icon.icon-close',
    '.ut-navigation-button-control.icon-back',
    'button:has-text("Close")',
    'button:has-text("Cancel")',
    'button:has-text("OK")',
    'button:has-text("Закрыть")',
    'button:has-text("Отмена")',
    '.modal button.btn-standard',
    '.dialog-body button',
  ],
  // Error dialogs
  ERROR_DIALOG: [
    '.ut-error-dialog',
    '.ut-dialog-view',
    '[class*="error-dialog"]',
    '[class*="dialog"]',
  ],
  // Session indicators
  LOGIN_SCREEN: [
    'button:has-text("Login")',
    'button:has-text("Sign In")',
    '.ut-login-button',
    '#email',
    'input[name="email"]',
  ],
  // App loaded indicators
  APP_LOADED: [
    '.ut-navigation-container-view',
    '.ut-home-view',
    '.ut-navigation-bar-view',
  ],
  // SBC section
  SBC_MENU: [
    '.ut-tab-bar-item:has-text("SBC")',
    'button.ut-tab-bar-item:has(span.ut-tab-bar-item-icon--sbc)',
  ],
};

// ============================================================================
// Recovery Strategies
// ============================================================================

const createStrategies = (log: LogCallback): RecoveryStrategy[] => [
  // 1. Dismiss blocking modals
  {
    name: 'DismissModal',
    maxAttempts: 3,
    condition: (error) => {
      // Try this for most errors - modals often block UI
      return (
        matchesPattern(error, ERROR_PATTERNS.ELEMENT_NOT_FOUND) ||
        error.message.includes('button') ||
        error.message.includes('click')
      );
    },
    action: async (ctx) => {
      log('🔧 Recovery: Attempting to dismiss blocking modal...', 'warning');

      // Try pressing Escape first
      await ctx.page.keyboard.press('Escape').catch(() => {});
      await sleep(500);

      // Try clicking close buttons
      for (const selector of RECOVERY_SELECTORS.MODAL_CLOSE) {
        try {
          const element = ctx.page.locator(selector).first();
          if (await element.isVisible({ timeout: 500 }).catch(() => false)) {
            await element.click({ force: true });
            log(`🔧 Closed modal using: ${selector}`, 'success');
            await sleep(500);
            return true;
          }
        } catch {
          continue;
        }
      }

      // Check if any error dialog visible
      for (const selector of RECOVERY_SELECTORS.ERROR_DIALOG) {
        const dialog = ctx.page.locator(selector).first();
        if (await dialog.isVisible({ timeout: 300 }).catch(() => false)) {
          // Find and click any button in the dialog
          const btn = dialog.locator('button').first();
          if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
            await btn.click({ force: true });
            log('🔧 Dismissed error dialog', 'success');
            await sleep(500);
            return true;
          }
        }
      }

      return false;
    },
  },

  // 2. Handle network errors with retry delay
  {
    name: 'NetworkRetry',
    maxAttempts: 3,
    condition: (error) => matchesPattern(error, ERROR_PATTERNS.NETWORK),
    action: async (ctx) => {
      const delay = 2000 * Math.pow(2, ctx.attemptCount); // Exponential backoff
      log(`🔧 Recovery: Network error - waiting ${delay / 1000}s before retry...`, 'warning');
      await sleep(delay);

      // Check if page is still responsive
      try {
        await ctx.page.evaluate(() => document.readyState);
        log('🔧 Page is responsive', 'success');
        return true;
      } catch {
        log('🔧 Page unresponsive after network error', 'error');
        return false;
      }
    },
  },

  // 3. Session expired - navigate to detect login state
  {
    name: 'SessionCheck',
    maxAttempts: 1,
    condition: (error) => matchesPattern(error, ERROR_PATTERNS.SESSION_EXPIRED),
    action: async (ctx) => {
      log('🔧 Recovery: Session may have expired - checking state...', 'warning');

      // Check for login screen
      for (const selector of RECOVERY_SELECTORS.LOGIN_SCREEN) {
        if (await ctx.page.locator(selector).first().isVisible({ timeout: 1000 }).catch(() => false)) {
          log('🔧 Login screen detected - session expired. Please re-login.', 'error');
          return false; // Can't auto-recover, need user intervention
        }
      }

      // Check if app is loaded
      for (const selector of RECOVERY_SELECTORS.APP_LOADED) {
        if (await ctx.page.locator(selector).first().isVisible({ timeout: 1000 }).catch(() => false)) {
          log('🔧 App still loaded - session valid', 'success');
          return true;
        }
      }

      // Try refreshing
      log('🔧 Attempting page refresh...', 'warning');
      await ctx.page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await sleep(3000);

      // Check again
      for (const selector of RECOVERY_SELECTORS.APP_LOADED) {
        if (await ctx.page.locator(selector).first().isVisible({ timeout: 2000 }).catch(() => false)) {
          log('🔧 App reloaded successfully', 'success');
          return true;
        }
      }

      return false;
    },
  },

  // 4. Navigate back to SBC section
  {
    name: 'NavigateToSBC',
    maxAttempts: 2,
    condition: (error) => {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('card not found') ||
        msg.includes('could not find') ||
        msg.includes('navigation') ||
        msg.includes('wrong page')
      );
    },
    action: async (ctx) => {
      log('🔧 Recovery: Navigating back to SBC...', 'warning');

      // Press Escape to close any open panels
      await ctx.page.keyboard.press('Escape').catch(() => {});
      await sleep(300);

      // Click SBC menu
      for (const selector of RECOVERY_SELECTORS.SBC_MENU) {
        try {
          const element = ctx.page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
            await element.click();
            log('🔧 Navigated to SBC section', 'success');
            await sleep(2000);
            return true;
          }
        } catch {
          continue;
        }
      }

      log('🔧 Could not navigate to SBC', 'error');
      return false;
    },
  },

  // 5. Page crashed - try to recover browser state
  {
    name: 'PageCrash',
    maxAttempts: 1,
    condition: (error) => matchesPattern(error, ERROR_PATTERNS.PAGE_CRASHED),
    action: async (ctx) => {
      log('🔧 Recovery: Page crash detected - this requires browser restart', 'error');
      // Can't recover from page crash without reinitializing browser
      return false;
    },
  },
];

// ============================================================================
// RecoveryService Class
// ============================================================================

export class RecoveryService {
  private browserManager: BrowserManager;
  private log: LogCallback;
  private strategies: RecoveryStrategy[];
  private attemptCounts: Map<string, number> = new Map();

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(`[Recovery] ${msg}`));
    this.strategies = createStrategies(this.log);
  }

  /**
   * Attempt to recover from an error using registered strategies
   */
  async attemptRecovery(error: Error, lastAction?: string): Promise<RecoveryResult> {
    const page = this.browserManager.getPage();

    const context: RecoveryContext = {
      page,
      browserManager: this.browserManager,
      error,
      attemptCount: 0,
      lastAction,
    };

    this.log(`🔧 Attempting recovery from: ${error.message}`, 'warning');

    for (const strategy of this.strategies) {
      if (!strategy.condition(error, context)) {
        continue;
      }

      // Track attempts per strategy
      const key = strategy.name;
      const attempts = this.attemptCounts.get(key) || 0;

      if (attempts >= strategy.maxAttempts) {
        this.log(`🔧 ${strategy.name}: Max attempts (${strategy.maxAttempts}) reached`, 'warning');
        continue;
      }

      context.attemptCount = attempts;

      try {
        this.log(`🔧 Trying strategy: ${strategy.name} (attempt ${attempts + 1}/${strategy.maxAttempts})`, 'info');

        const recovered = await strategy.action(context);
        this.attemptCounts.set(key, attempts + 1);

        if (recovered) {
          this.log(`🔧 Recovery successful using: ${strategy.name}`, 'success');
          return { recovered: true, strategy: strategy.name, attempts: attempts + 1 };
        }
      } catch (strategyError) {
        this.log(`🔧 Strategy ${strategy.name} threw error: ${strategyError}`, 'error');
        this.attemptCounts.set(key, attempts + 1);
      }
    }

    this.log('🔧 All recovery strategies exhausted', 'error');
    return { recovered: false, attempts: this.getTotalAttempts() };
  }

  /**
   * Reset attempt counters (call when starting a new task)
   */
  resetAttempts(): void {
    this.attemptCounts.clear();
  }

  /**
   * Get total recovery attempts made
   */
  private getTotalAttempts(): number {
    let total = 0;
    this.attemptCounts.forEach((count) => {
      total += count;
    });
    return total;
  }

  /**
   * Check if browser/page is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const page = this.browserManager.getPage();

      // Check page is responsive
      await page.evaluate(() => document.readyState);

      // Check app is loaded
      for (const selector of RECOVERY_SELECTORS.APP_LOADED) {
        if (await page.locator(selector).first().isVisible({ timeout: 500 }).catch(() => false)) {
          return true;
        }
      }

      // If no app loaded indicator, check if we're on login screen (still healthy, just not logged in)
      for (const selector of RECOVERY_SELECTORS.LOGIN_SCREEN) {
        if (await page.locator(selector).first().isVisible({ timeout: 500 }).catch(() => false)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Quick health check - just checks if page responds
   */
  async quickHealthCheck(): Promise<boolean> {
    try {
      const page = this.browserManager.getPage();
      await page.evaluate(() => true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Dismiss any visible modals (can be called proactively)
   */
  async dismissModals(): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Try Escape
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);

    // Try close buttons
    for (const selector of RECOVERY_SELECTORS.MODAL_CLOSE) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 200 }).catch(() => false)) {
          await element.click({ force: true });
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
