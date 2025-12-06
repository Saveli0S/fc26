import { Page, Frame } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';
import 'dotenv/config';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  EA_WEB_APP_URL: process.env.EA_WEB_APP_URL || 'https://www.ea.com/ru-ru/ea-sports-fc/ultimate-team/web-app/',
  EA_EMAIL: process.env.EA_EMAIL || '',
  EA_PASSWORD: process.env.EA_PASSWORD || '',
  TIMEOUTS: {
    PAGE_LOAD: 6000,
    ELEMENT_VISIBLE: 2000,
    ELEMENT_VISIBLE_LONG: 5000,
    APP_LOAD: 60000,
    TWO_FA: 5 * 60 * 1000, // 5 minutes
  },
  DELAYS: {
    SHORT: 500,
    MEDIUM: 2000,
    LONG: 3000,
  },
};

// ============================================================================
// Selectors
// ============================================================================

const SELECTORS = {
  // App loaded indicators
  APP_LOADED: [
    '.ut-navigation-container-view',
    '.ut-home-view',
    '.ut-navigation-bar-view',
    '[class*="UTNavigationBar"]',
    '[class*="NavigationBar"]',
  ],

  // Splash screen login button
  SPLASH_LOGIN: [
    'button:has-text("Login")',
    'button:has-text("Sign In")',
    'button:has-text("Log In")',
    'button:has-text("Войти")',
    'a:has-text("Login")',
    '.btn-login',
    '[class*="login-btn"]',
    'button.btn-standard.call-to-action',
    'button[class*="call-to-action"]',
    '.ut-login-button',
  ],

  // Email input field
  EMAIL_INPUT: [
    '#email',
    'input[name="email"]',
    'input[type="email"]',
    '#signInEmailField',
    'input[placeholder*="email" i]',
    'input[placeholder*="Email" i]',
  ],

  // Password input field
  PASSWORD_INPUT: [
    '#password',
    'input[name="password"]',
    'input[type="password"]',
    '#signInPasswordField',
    'input[placeholder*="password" i]',
    'input[placeholder*="Password" i]',
  ],

  // Next/Continue button
  NEXT_BUTTON: [
    'button:has-text("Next")',
    'button:has-text("Далее")',
    'button:has-text("Continue")',
    'button[type="submit"]',
    '#btnNext',
    '.btn-next',
    'button.primary',
  ],

  // Submit/Sign In button
  SUBMIT_BUTTON: [
    'button:has-text("Next")',
    'button:has-text("Sign in")',
    'button:has-text("Sign In")',
    'button:has-text("Log In")',
    'button:has-text("Login")',
    'button:has-text("Далее")',
    'button:has-text("Войти")',
    'button[type="submit"]',
    '#logInBtn',
    'input[type="submit"]',
    '.otkbtn-primary',
    'button.primary',
  ],

  // Verification screen indicators
  VERIFICATION: [
    'text="Verify your identity"',
    'text="Send Code"',
    'text="SEND CODE"',
    'button:has-text("Send Code")',
    'button:has-text("SEND CODE")',
    'text="verification code"',
    'text="Подтвердите"',
  ],

  // Send code button
  SEND_CODE: [
    'button:has-text("Send Code")',
    'button:has-text("SEND CODE")',
    'button:has-text("Отправить код")',
    'a:has-text("Send Code")',
  ],

  // 2FA code input
  TWO_FA_INPUT: [
    'input[name="codeInput"]',
    'input[name="twoFactorCode"]',
    '#twoFactorCode',
    'input[name="oneTimeCode"]',
    'input[placeholder*="code" i]',
    'input[type="text"][maxlength="6"]',
    'input[type="tel"]',
  ],
};

// ============================================================================
// AuthManager Class
// ============================================================================

export class AuthManager {
  private browserManager: BrowserManager;
  private log: LogCallback;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  async login(): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('Navigating to EA Web App...');
    await page.goto(CONFIG.EA_WEB_APP_URL, {
      waitUntil: 'networkidle',
      timeout: CONFIG.TIMEOUTS.PAGE_LOAD,
    });

    await this.sleep(CONFIG.DELAYS.LONG);

    if (await this.isLoggedIn(page)) {
      this.log('Already logged in!', 'success');
      return true;
    }

    return await this.performLogin(page);
  }

  async ensureLoggedIn(): Promise<boolean> {
    const page = this.browserManager.getPage();
    return (await this.isLoggedIn(page)) || (await this.login());
  }

  // ==========================================================================
  // Login Flow
  // ==========================================================================

  private async performLogin(page: Page): Promise<boolean> {
    try {
      // Step 1: Click splash login button
      await this.clickSplashLoginButton(page);

      // Step 2: Find login form (may be in iframe)
      const loginFrame = await this.findLoginFrame(page);

      // Step 3: Fill email and submit
      await this.fillEmail(loginFrame);
      await this.clickNextButton(loginFrame);

      // Step 4: Fill password and submit
      await this.fillPassword(loginFrame);
      await this.clickSubmitButton(loginFrame);

      // Step 5: Handle verification if needed
      await this.handleVerificationIfNeeded(page);

      // Step 6: Handle 2FA if needed
      await this.handle2FAIfNeeded(page);

      // Step 7: Wait for app to load
      await this.waitForAppLoad(page);

      // Step 8: Save session
      await this.browserManager.saveCookies();
      this.log('Login successful! Session saved.', 'success');

      return true;
    } catch (error) {
      this.log(`Login failed: ${error}`, 'error');
      return false;
    }
  }

  // ==========================================================================
  // Login Steps
  // ==========================================================================

  private async clickSplashLoginButton(page: Page): Promise<void> {
    this.log('Looking for Login button on splash screen...');

    const clicked = await this.tryClickSelectors(page, SELECTORS.SPLASH_LOGIN);

    if (clicked) {
      this.log('Clicked Login button on splash screen', 'success');
    } else {
      // Fallback: try exact text
      try {
        await page.getByText('Login', { exact: true }).click();
        this.log('Clicked Login button', 'success');
      } catch {
        this.log('No splash login button found, checking for login form...', 'warning');
      }
    }

    await this.sleep(CONFIG.DELAYS.LONG);
  }

  private async findLoginFrame(page: Page): Promise<Page | Frame> {
    this.log('Waiting for EA login form...');

    for (const frame of page.frames()) {
      const emailField = frame.locator(SELECTORS.EMAIL_INPUT[0]).first();
      if (await emailField.isVisible({ timeout: 1000 }).catch(() => false)) {
        this.log('Found login form in iframe');
        return frame;
      }
    }

    return page;
  }

  private async fillEmail(frame: Page | Frame): Promise<void> {
    const filled = await this.tryFillInput(frame, SELECTORS.EMAIL_INPUT, CONFIG.EA_EMAIL);

    if (filled) {
      this.log(`Filled email: ${CONFIG.EA_EMAIL}`, 'success');
    } else {
      throw new Error('Could not find email input field');
    }

    await this.sleep(CONFIG.DELAYS.SHORT);
  }

  private async clickNextButton(frame: Page | Frame): Promise<void> {
    const clicked = await this.tryClickSelectors(frame, SELECTORS.NEXT_BUTTON);

    if (clicked) {
      this.log('Clicked Next after email', 'success');
    } else {
      await frame.locator('body').press('Enter');
      this.log('Pressed Enter after email');
    }

    await this.sleep(CONFIG.DELAYS.MEDIUM);
  }

  private async fillPassword(frame: Page | Frame): Promise<void> {
    const filled = await this.tryFillInput(frame, SELECTORS.PASSWORD_INPUT, CONFIG.EA_PASSWORD);

    if (filled) {
      this.log('Filled password', 'success');
    } else {
      throw new Error('Could not find password input field');
    }

    await this.sleep(CONFIG.DELAYS.SHORT);
  }

  private async clickSubmitButton(frame: Page | Frame): Promise<void> {
    const clicked = await this.tryClickSelectors(frame, SELECTORS.SUBMIT_BUTTON);

    if (clicked) {
      this.log('Clicked Sign In', 'success');
    } else {
      await frame.locator('body').press('Enter');
      this.log('Pressed Enter to submit');
    }

    await this.sleep(CONFIG.DELAYS.LONG);
  }

  // ==========================================================================
  // Verification & 2FA
  // ==========================================================================

  private async handleVerificationIfNeeded(page: Page): Promise<void> {
    if (await this.isVisible(page, SELECTORS.VERIFICATION)) {
      this.log('Verification screen detected - clicking "Send Code"...', 'warning');

      await this.tryClickSelectors(page, SELECTORS.SEND_CODE);
      this.log('Clicked "Send Code" - check your email!', 'warning');
      this.log('Waiting for you to enter the verification code...', 'warning');

      await this.sleep(CONFIG.DELAYS.LONG);
    }
  }

  private async handle2FAIfNeeded(page: Page): Promise<void> {
    if (await this.isVisible(page, SELECTORS.TWO_FA_INPUT)) {
      this.log('2FA code input detected! Please enter code manually...', 'warning');
      await this.waitFor2FACompletion(page);
    }
  }

  private async waitFor2FACompletion(page: Page): Promise<void> {
    this.log('Waiting for 2FA completion (max 5 minutes)...', 'warning');

    const startTime = Date.now();

    while (Date.now() - startTime < CONFIG.TIMEOUTS.TWO_FA) {
      if (!(await this.isVisible(page, SELECTORS.TWO_FA_INPUT))) {
        this.log('2FA completed!', 'success');
        return;
      }
      await this.sleep(CONFIG.DELAYS.MEDIUM);
    }

    throw new Error('2FA timeout - please complete verification faster next time');
  }

  // ==========================================================================
  // State Checks
  // ==========================================================================

  private async isLoggedIn(page: Page): Promise<boolean> {
    return await this.isVisible(page, SELECTORS.APP_LOADED);
  }

  private async waitForAppLoad(page: Page): Promise<void> {
    this.log('Waiting for app to load...');

    const startTime = Date.now();

    while (Date.now() - startTime < CONFIG.TIMEOUTS.APP_LOAD) {
      if (await this.isVisible(page, SELECTORS.APP_LOADED)) {
        this.log('App loaded successfully');
        return;
      }
      await this.sleep(CONFIG.DELAYS.MEDIUM);
    }

    throw new Error('App failed to load within timeout');
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async tryClickSelectors(context: Page | Frame, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const element = context.locator(selector).first();
        if (await element.isVisible({ timeout: CONFIG.TIMEOUTS.ELEMENT_VISIBLE })) {
          await element.click();
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  private async tryFillInput(context: Page | Frame, selectors: string[], value: string): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const input = context.locator(selector).first();
        if (await input.isVisible({ timeout: CONFIG.TIMEOUTS.ELEMENT_VISIBLE_LONG })) {
          await input.click();
          await input.fill(value);
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  private async isVisible(context: Page | Frame, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      try {
        if (await context.locator(selector).first().isVisible({ timeout: 1000 })) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  private async sleep(ms: number): Promise<void> {
    await this.browserManager.sleep(ms);
  }
}
