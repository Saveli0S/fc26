import { Page } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';
import { Task } from '../config/tasks.js';

export class SBCNavigator {
  private browserManager: BrowserManager;
  private log: LogCallback;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
  }

  async navigateToSBC(): Promise<void> {
    const page = this.browserManager.getPage();

    this.log('Navigating to SBC...');

    // Click on SBC in the navigation menu
    const sbcSelectors = [
      '.ut-tab-bar-item:has-text("SBC")',
      'button.ut-tab-bar-item:has(span.ut-tab-bar-item-icon--sbc)',
      '[class*="sbc"]',
      'button:has-text("SBC")',
    ];

    let clicked = false;
    for (const selector of sbcSelectors) {
      try {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          clicked = true;
          this.log('Clicked SBC menu item');
          break;
        }
      } catch {
        continue;
      }
    }

    if (!clicked) {
      // Try finding by icon class
      const iconSelector = '.icon-sbc';
      if (await page.isVisible(iconSelector)) {
        await page.click(iconSelector);
        clicked = true;
      }
    }

    if (!clicked) {
      throw new Error('Could not find SBC menu item');
    }

    await this.browserManager.sleep(2000);
    this.log('Navigated to SBC section', 'success');
  }

  async selectCategory(category: string): Promise<void> {
    const page = this.browserManager.getPage();

    this.log(`Selecting category: ${category}...`);

    // Category tabs are typically in a pill-bar or tab-bar
    const categorySelectors = [
      `.ut-tab-bar-item:has-text("${category}")`,
      `button:has-text("${category}")`,
      `.pill-item:has-text("${category}")`,
      `[class*="tab"]:has-text("${category}")`,
      `.ut-pill-toggle-item:has-text("${category}")`,
    ];

    let clicked = false;
    for (const selector of categorySelectors) {
      try {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          clicked = true;
          this.log(`Selected category: ${category}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!clicked) {
      // Try clicking by exact text match
      const elements = await page.locator(`text="${category}"`).all();
      for (const el of elements) {
        try {
          await el.click();
          clicked = true;
          this.log(`Selected category: ${category}`);
          break;
        } catch {
          continue;
        }
      }
    }

    if (!clicked) {
      this.log(`Could not find category tab: ${category}`, 'warning');
    }

    await this.browserManager.sleep(1500);
  }

  async findAndClickCard(cardTitle: string): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log(`Looking for card: ${cardTitle}...`);

    // Scroll through the SBC list to find the card
    const maxScrollAttempts = 10;

    for (let i = 0; i < maxScrollAttempts; i++) {
      // Try to find the card
      const cardSelectors = [
        `.ut-sbc-set-tile-view:has-text("${cardTitle}")`,
        `.ut-sbc-challenge-table-row-view:has-text("${cardTitle}")`,
        `[class*="sbc"]:has-text("${cardTitle}")`,
        `.tile:has-text("${cardTitle}")`,
      ];

      for (const selector of cardSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible()) {
            await element.click();
            this.log(`Clicked card: ${cardTitle}`, 'success');
            await this.browserManager.sleep(1500);
            return true;
          }
        } catch {
          continue;
        }
      }

      // Try finding by text content
      const textLocator = page.locator(`text="${cardTitle}"`).first();
      try {
        if (await textLocator.isVisible()) {
          // Click the parent card element
          await textLocator.click();
          this.log(`Clicked card: ${cardTitle}`, 'success');
          await this.browserManager.sleep(1500);
          return true;
        }
      } catch {
        // Continue scrolling
      }

      // Scroll down to find more cards
      await page.keyboard.press('PageDown');
      await this.browserManager.sleep(500);
    }

    this.log(`Could not find card: ${cardTitle}`, 'error');
    return false;
  }

  async isCardCompleted(): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Look for completion indicators
    const completedSelectors = [
      '.ut-sbc-challenge-status--complete',
      '.completed',
      '[class*="complete"]',
      '.checkmark',
      'svg.complete-icon',
    ];

    for (const selector of completedSelectors) {
      try {
        if (await page.isVisible(selector)) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  async clickUseSquadBuilder(): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('Looking for "Use Squad Builder" button...');

    const buttonSelectors = [
      'button:has-text("Use Squad Builder")',
      'button:has-text("Использовать конструктор")', // Russian
      '.ut-squad-builder-btn',
      '[class*="squad-builder"]',
      'button.call-to-action',
    ];

    for (const selector of buttonSelectors) {
      try {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          this.log('Clicked "Use Squad Builder"', 'success');
          await this.browserManager.sleep(2000);
          return true;
        }
      } catch {
        continue;
      }
    }

    this.log('Could not find "Use Squad Builder" button', 'error');
    return false;
  }

  async clickExchangePlayers(): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('Looking for "Exchange Players" button...');

    const buttonSelectors = [
      'button:has-text("Exchange Players")',
      'button:has-text("Обменять игроков")', // Russian
      'button:has-text("Submit")',
      '.ut-sbc-submit-btn',
      'button.call-to-action:has-text("Exchange")',
    ];

    for (const selector of buttonSelectors) {
      try {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          this.log('Clicked "Exchange Players"', 'success');
          await this.browserManager.sleep(2000);
          return true;
        }
      } catch {
        continue;
      }
    }

    this.log('Could not find "Exchange Players" button', 'error');
    return false;
  }

  async clickClaimRewards(): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('Looking for "Claim Rewards" button...');

    const buttonSelectors = [
      'button:has-text("Claim Rewards")',
      'button:has-text("Claim")',
      'button:has-text("Получить награды")', // Russian
      'button:has-text("Получить")',
      '.ut-sbc-rewards-btn',
      'button.call-to-action',
    ];

    for (const selector of buttonSelectors) {
      try {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          this.log('Clicked "Claim Rewards"', 'success');
          await this.browserManager.sleep(3000);
          return true;
        }
      } catch {
        continue;
      }
    }

    // Also handle any reward dialogs
    await this.handleRewardDialogs();

    return true;
  }

  async handleRewardDialogs(): Promise<void> {
    const page = this.browserManager.getPage();

    // Click through any reward screens/dialogs
    const dialogButtons = [
      'button:has-text("OK")',
      'button:has-text("Continue")',
      'button:has-text("Продолжить")',
      '.ut-button-group button',
      '.dialog-body button',
    ];

    for (let i = 0; i < 5; i++) {
      for (const selector of dialogButtons) {
        try {
          if (await page.isVisible(selector)) {
            await page.click(selector);
            await this.browserManager.sleep(1000);
          }
        } catch {
          continue;
        }
      }
      await this.browserManager.sleep(500);
    }
  }

  async goBack(): Promise<void> {
    const page = this.browserManager.getPage();

    const backSelectors = [
      '.ut-navigation-button-control',
      'button.ut-navigation-button-control',
      '[class*="back"]',
      '.ut-back-button',
    ];

    for (const selector of backSelectors) {
      try {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          await this.browserManager.sleep(1000);
          return;
        }
      } catch {
        continue;
      }
    }
  }
}
