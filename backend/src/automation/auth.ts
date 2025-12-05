import { Page } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';
import 'dotenv/config';

const EA_WEB_APP_URL = process.env.EA_WEB_APP_URL || 'https://www.ea.com/ru-ru/ea-sports-fc/ultimate-team/web-app/';
const EA_EMAIL = process.env.EA_EMAIL || '';
const EA_PASSWORD = process.env.EA_PASSWORD || '';

export class AuthManager {
  private browserManager: BrowserManager;
  private log: LogCallback;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
  }

  async login(): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('Navigating to EA Web App...');
    await page.goto(EA_WEB_APP_URL, { waitUntil: 'networkidle', timeout: 6000 });

    // Wait for page to load
    await this.browserManager.sleep(3000);

    // Check if already logged in by looking for the main app container
    const isLoggedIn = await this.checkIfLoggedIn(page);
    if (isLoggedIn) {
      this.log('Already logged in!', 'success');
      return true;
    }

    // Handle login flow
    return await this.performLogin(page);
  }

  private async checkIfLoggedIn(page: Page): Promise<boolean> {
    try {
      // Check for main app elements that indicate we're logged in
      const selectors = [
        '.ut-navigation-container-view', // Main navigation
        '.ut-home-view', // Home view
        '[class*="NavigationBar"]',
        '.ut-click-shield', // Loading shield is gone
      ];

      for (const selector of selectors) {
        if (await page.isVisible(selector)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async performLogin(page: Page): Promise<boolean> {
    try {
      this.log('Looking for Login button on splash screen...');

      // Step 1: Click the initial "Login" button on splash screen
      const splashLoginSelectors = [
        'button:has-text("Login")',
        'a:has-text("Login")',
        '.btn-login',
        '[class*="login-btn"]',
        'button.btn-standard.call-to-action',
        'button[class*="call-to-action"]',
        '.ut-login-button',
        'button:has-text("Войти")',
        'button:has-text("Sign In")',
        'button:has-text("Log In")',
      ];

      let loginButtonFound = false;
      for (const selector of splashLoginSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            await element.click();
            loginButtonFound = true;
            this.log('Clicked Login button on splash screen', 'success');
            break;
          }
        } catch {
          continue;
        }
      }

      if (!loginButtonFound) {
        // Try clicking by text directly
        try {
          await page.getByText('Login', { exact: true }).click();
          loginButtonFound = true;
          this.log('Clicked Login button', 'success');
        } catch {
          this.log('No splash login button found, checking for login form...', 'warning');
        }
      }

      // Wait for EA login form to appear
      this.log('Waiting for EA login form...');
      await this.browserManager.sleep(3000);

      // Step 2: Handle EA Account login form (may be in iframe)
      // First check if there's an iframe
      const frames = page.frames();
      let loginFrame = page;

      for (const frame of frames) {
        try {
          const emailField = frame.locator('#email, input[name="email"]').first();
          if (await emailField.isVisible({ timeout: 1000 })) {
            loginFrame = frame as any;
            this.log('Found login form in iframe');
            break;
          }
        } catch {
          continue;
        }
      }

      // Step 3: Fill email
      const emailSelectors = [
        '#email',
        'input[name="email"]',
        'input[type="email"]',
        '#signInEmailField',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email" i]',
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const emailInput = loginFrame.locator(selector).first();
          if (await emailInput.isVisible({ timeout: 5000 })) {
            await emailInput.click();
            await emailInput.fill(EA_EMAIL);
            emailFilled = true;
            this.log(`Filled email: ${EA_EMAIL}`, 'success');
            break;
          }
        } catch {
          continue;
        }
      }

      if (!emailFilled) {
        this.log('Could not find email input field', 'error');
        return false;
      }

      await this.browserManager.sleep(500);

      // Step 4: Click "Next" button after email
      const nextButtonSelectors = [
        'button:has-text("Next")',
        'button:has-text("Далее")',
        'button:has-text("Continue")',
        'button[type="submit"]',
        '#btnNext',
        '.btn-next',
        'button.primary',
      ];

      let nextClicked = false;
      for (const selector of nextButtonSelectors) {
        try {
          const nextBtn = loginFrame.locator(selector).first();
          if (await nextBtn.isVisible({ timeout: 2000 })) {
            await nextBtn.click();
            nextClicked = true;
            this.log('Clicked Next after email', 'success');
            break;
          }
        } catch {
          continue;
        }
      }

      if (!nextClicked) {
        await page.keyboard.press('Enter');
        this.log('Pressed Enter after email');
      }

      // Wait for password field to appear
      await this.browserManager.sleep(2000);

      // Step 5: Fill password
      const passwordSelectors = [
        '#password',
        'input[name="password"]',
        'input[type="password"]',
        '#signInPasswordField',
        'input[placeholder*="password" i]',
        'input[placeholder*="Password" i]',
      ];

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const passwordInput = loginFrame.locator(selector).first();
          if (await passwordInput.isVisible({ timeout: 5000 })) {
            await passwordInput.click();
            await passwordInput.fill(EA_PASSWORD);
            passwordFilled = true;
            this.log('Filled password', 'success');
            break;
          }
        } catch {
          continue;
        }
      }

      if (!passwordFilled) {
        this.log('Could not find password input field', 'error');
        return false;
      }

      await this.browserManager.sleep(500);

      // Step 6: Click "Next" or "Sign In" button after password
      const submitSelectors = [
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
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          const submitBtn = loginFrame.locator(selector).first();
          if (await submitBtn.isVisible({ timeout: 2000 })) {
            await submitBtn.click();
            submitted = true;
            this.log('Clicked Next/Sign In after password', 'success');
            break;
          }
        } catch {
          continue;
        }
      }

      if (!submitted) {
        await page.keyboard.press('Enter');
        this.log('Pressed Enter to submit');
      }

      // Wait for potential verification
      await this.browserManager.sleep(3000);

      // Check for "Verify your identity" / "Send Code" screen
      const needsVerification = await this.checkVerificationScreen(page);
      if (needsVerification) {
        await this.handleVerificationScreen(page);
      }

      // Check for 2FA code input
      const needs2FA = await this.check2FA(page);
      if (needs2FA) {
        this.log('2FA code input detected! Please enter code manually...', 'warning');
        await this.waitFor2FACompletion(page);
      }

      // Wait for app to load after login
      this.log('Waiting for app to load...');
      await this.waitForAppLoad(page);

      // Save session - important for avoiding re-verification next time!
      await this.browserManager.saveCookies();

      this.log('Login successful! Session saved.', 'success');
      return true;

    } catch (error) {
      this.log(`Login failed: ${error}`, 'error');
      return false;
    }
  }

  private async checkVerificationScreen(page: Page): Promise<boolean> {
    // Check for "Verify your identity" / "Send Code" screen
    const verificationIndicators = [
      'text="Verify your identity"',
      'text="Send Code"',
      'text="SEND CODE"',
      'button:has-text("Send Code")',
      'button:has-text("SEND CODE")',
      'text="verification code"',
      'text="Подтвердите"',
    ];

    for (const selector of verificationIndicators) {
      try {
        if (await page.locator(selector).first().isVisible({ timeout: 1000 })) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  private async handleVerificationScreen(page: Page): Promise<void> {
    this.log('Verification screen detected - clicking "Send Code"...', 'warning');

    // Click "Send Code" button
    const sendCodeSelectors = [
      'button:has-text("Send Code")',
      'button:has-text("SEND CODE")',
      'button:has-text("Отправить код")',
      'a:has-text("Send Code")',
    ];

    for (const selector of sendCodeSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          this.log('Clicked "Send Code" - check your email!', 'warning');
          break;
        }
      } catch {
        continue;
      }
    }

    // Wait for code input to appear and user to complete
    this.log('Waiting for you to enter the verification code from email...', 'warning');
    await this.browserManager.sleep(3000);
  }

  private async check2FA(page: Page): Promise<boolean> {
    const twoFASelectors = [
      'input[name="codeInput"]',
      'input[name="twoFactorCode"]',
      '#twoFactorCode',
      'input[name="oneTimeCode"]',
      'input[placeholder*="code" i]',
      'input[type="text"][maxlength="6"]',
      'input[type="tel"]',
    ];

    for (const selector of twoFASelectors) {
      try {
        if (await page.locator(selector).first().isVisible({ timeout: 1000 })) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  private async waitFor2FACompletion(page: Page): Promise<void> {
    this.log('Waiting for 2FA completion (max 5 minutes)...', 'warning');

    const maxWait = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const is2FA = await this.check2FA(page);
      if (!is2FA) {
        this.log('2FA completed!', 'success');
        return;
      }
      await this.browserManager.sleep(2000);
    }

    throw new Error('2FA timeout - please complete verification faster next time');
  }

  private async waitForAppLoad(page: Page, timeout = 60000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for various app loaded indicators
      const appSelectors = [
        '.ut-navigation-container-view',
        '.ut-home-view',
        '.ut-navigation-bar-view',
        '[class*="UTNavigationBar"]',
      ];

      for (const selector of appSelectors) {
        try {
          if (await page.isVisible(selector)) {
            this.log('App loaded successfully');
            return;
          }
        } catch {
          continue;
        }
      }

      await this.browserManager.sleep(2000);
    }

    throw new Error('App failed to load within timeout');
  }

  async ensureLoggedIn(): Promise<boolean> {
    const page = this.browserManager.getPage();

    if (await this.checkIfLoggedIn(page)) {
      return true;
    }

    return await this.login();
  }
}
