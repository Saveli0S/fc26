import { BrowserManager, LogCallback } from './browser.js';
import { UIHelper, TIMEOUTS, DELAYS } from './ui-helpers.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_SCROLL_ATTEMPTS: 10,
  REWARD_DIALOG_RETRIES: 5,
};

// ============================================================================
// Selectors
// ============================================================================

const SELECTORS = {
  // Navigation
  SBC_MENU: [
    '.ut-tab-bar-item:has-text("SBC")',
    'button.ut-tab-bar-item:has(span.ut-tab-bar-item-icon--sbc)',
    '[class*="sbc"]',
    'button:has-text("SBC")',
    '.icon-sbc',
  ],

  BACK_BUTTON: [
    '.ut-navigation-button-control',
    'button.ut-navigation-button-control',
    '[class*="back"]',
    '.ut-back-button',
  ],

  // Card tiles
  CARD_TITLE: 'h1.tileTitle, .tileTitle, .ut-sbc-set-tile-view--title',
  CARD_TILE: 'div[class*="ut-sbc-set-tile-view"]',

  // Status
  COMPLETED: [
    '.ut-sbc-challenge-status--complete',
    '.completed',
    '[class*="complete"]',
    '.checkmark',
    'svg.complete-icon',
  ],

  REPEATABLE_LABEL: [
    '.ut-squad-building-set-status-label-view.repeat',
    '.ut-squad-building-set-status-label-view.repeat span.text',
    '.ut-squad-building-set-status-label-view span.text',
    '.ut-squad-building-set-status-label-view',
    '[class*="status-label"]',
    'span.text:has-text("Repeatable")',
  ],

  // Buttons
  USE_SQUAD_BUILDER: [
    'button:has-text("Use Squad Builder")',
    'button:has-text("Использовать конструктор")',
    '.ut-squad-builder-btn',
    '[class*="squad-builder"]',
    'button.call-to-action',
  ],

  EXCHANGE_PLAYERS: [
    'button:has-text("Exchange Players")',
    'button:has-text("Обменять игроков")',
    'button:has-text("Submit")',
    '.ut-sbc-submit-btn',
    'button.call-to-action:has-text("Exchange")',
  ],

  CLAIM_REWARDS: [
    'button:has-text("Claim Rewards")',
    'button:has-text("Claim")',
    'button:has-text("Получить награды")',
    'button:has-text("Получить")',
    '.ut-sbc-rewards-btn',
    'button.call-to-action',
  ],

  DIALOG_BUTTONS: [
    'button:has-text("OK")',
    'button:has-text("Continue")',
    'button:has-text("Продолжить")',
    '.ut-button-group button',
    '.dialog-body button',
  ],
};

// ============================================================================
// SBCNavigator Class
// ============================================================================

export class SBCNavigator {
  private browserManager: BrowserManager;
  private log: LogCallback;
  private ui: UIHelper;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
    this.ui = new UIHelper(browserManager, this.log);
  }

  // ==========================================================================
  // Navigation
  // ==========================================================================

  async navigateToSBC(): Promise<void> {
    const page = this.browserManager.getPage();
    this.log('Navigating to SBC...');

    const clicked = await this.ui.tryClickSelectors(SELECTORS.SBC_MENU, TIMEOUTS.MEDIUM);

    if (!clicked) {
      throw new Error('Could not find SBC menu item');
    }

    await this.sleep(DELAYS.EXTRA_LONG);
    this.log('Navigated to SBC section', 'success');
  }

  async goBack(): Promise<void> {
    await this.ui.tryClickSelectors(SELECTORS.BACK_BUTTON, TIMEOUTS.MEDIUM);
    await this.sleep(DELAYS.MEDIUM);
  }

  // ==========================================================================
  // Category Selection
  // ==========================================================================

  async selectCategory(category: string): Promise<void> {
    const page = this.browserManager.getPage();
    this.log(`Selecting category: ${category}...`);

    const categorySelectors = [
      `.ut-tab-bar-item:has-text("${category}")`,
      `button:has-text("${category}")`,
      `.pill-item:has-text("${category}")`,
      `[class*="tab"]:has-text("${category}")`,
      `.ut-pill-toggle-item:has-text("${category}")`,
    ];

    let clicked = await this.ui.tryClickSelectors(categorySelectors, TIMEOUTS.MEDIUM);

    if (!clicked) {
      // Fallback: try by exact text
      const elements = await page.locator(`text="${category}"`).all();
      for (const el of elements) {
        try {
          await el.click();
          clicked = true;
          break;
        } catch {
          continue;
        }
      }
    }

    if (clicked) {
      this.log(`Selected category: ${category}`);
    } else {
      this.log(`Could not find category tab: ${category}`, 'warning');
    }

    await this.sleep(DELAYS.LONG);
  }

  // ==========================================================================
  // Card Operations
  // ==========================================================================

  async findAndClickCard(cardTitle: string): Promise<boolean> {
    const page = this.browserManager.getPage();
    this.log(`Looking for card: "${cardTitle}"...`);

    for (let attempt = 0; attempt < CONFIG.MAX_SCROLL_ATTEMPTS; attempt++) {
      const titleElements = page.locator(SELECTORS.CARD_TITLE);
      const count = await titleElements.count();
      this.log(`  Found ${count} card titles`);

      for (let i = 0; i < count; i++) {
        const titleEl = titleElements.nth(i);
        const titleText = await titleEl.textContent().catch(() => '') || '';

        if (titleText.trim() === cardTitle) {
          this.log(`  Found exact match: "${titleText.trim()}"`);

          // Click the parent card tile or the title itself
          const parentCard = titleEl.locator(`xpath=ancestor::${SELECTORS.CARD_TILE.replace('div[', 'div[')}`).first();
          if (await parentCard.isVisible().catch(() => false)) {
            await parentCard.click();
          } else {
            await titleEl.click();
          }

          this.log(`✓ Clicked card: "${cardTitle}"`, 'success');
          await this.sleep(DELAYS.LONG);
          return true;
        }
      }

      // Scroll down to find more cards
      await page.keyboard.press('PageDown');
      await this.sleep(DELAYS.SHORT);
    }

    this.log(`✗ Could not find card: "${cardTitle}"`, 'error');
    return false;
  }

  async isCardCompleted(): Promise<boolean> {
    return await this.ui.isAnyVisible(SELECTORS.COMPLETED, TIMEOUTS.SHORT);
  }

  // ==========================================================================
  // Repeat Count
  // ==========================================================================

  async getRepeatCountFromPage(): Promise<number | null> {
    const page = this.browserManager.getPage();

    try {
      // Try selectors first
      for (const selector of SELECTORS.REPEATABLE_LABEL) {
        const elements = page.locator(selector);
        const count = await elements.count();

        for (let i = 0; i < count; i++) {
          const text = await elements.nth(i).textContent();
          const repeatCount = this.parseRepeatCount(text);
          if (repeatCount !== null) {
            this.log(`Found repeat count: ${repeatCount}`);
            return repeatCount;
          }
        }
      }

      // Fallback: search page content
      const pageContent = await page.content();
      const repeatCount = this.parseRepeatCount(pageContent);
      if (repeatCount !== null) {
        this.log(`Found repeat count from page content: ${repeatCount}`);
        return repeatCount;
      }

    } catch (error) {
      this.log(`Could not parse repeat count: ${error}`, 'warning');
    }

    this.log('Could not find repeat count on page', 'warning');
    return null;
  }

  private parseRepeatCount(text: string | null): number | null {
    if (!text) return null;

    const match = text.match(/Repeatable[:\s]*(\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  // ==========================================================================
  // Squad Builder Actions
  // ==========================================================================

  async clickUseSquadBuilder(): Promise<boolean> {
    this.log('Looking for "Use Squad Builder" button...');

    const clicked = await this.ui.tryClickSelectors(SELECTORS.USE_SQUAD_BUILDER, TIMEOUTS.MEDIUM);

    if (clicked) {
      this.log('Clicked "Use Squad Builder"', 'success');
      await this.sleep(DELAYS.EXTRA_LONG);
      return true;
    }

    this.log('Could not find "Use Squad Builder" button', 'error');
    return false;
  }

  async clickExchangePlayers(): Promise<boolean> {
    this.log('Looking for "Exchange Players" button...');

    const clicked = await this.ui.tryClickSelectors(SELECTORS.EXCHANGE_PLAYERS, TIMEOUTS.MEDIUM);

    if (clicked) {
      this.log('Clicked "Exchange Players"', 'success');
      await this.sleep(DELAYS.EXTRA_LONG);
      return true;
    }

    this.log('Could not find "Exchange Players" button', 'error');
    return false;
  }

  // ==========================================================================
  // Rewards
  // ==========================================================================

  async clickClaimRewards(): Promise<boolean> {
    this.log('Looking for "Claim Rewards" button...');

    const clicked = await this.ui.tryClickSelectors(SELECTORS.CLAIM_REWARDS, TIMEOUTS.MEDIUM);

    if (clicked) {
      this.log('Clicked "Claim Rewards"', 'success');
      await this.sleep(DELAYS.EXTRA_LONG + DELAYS.MEDIUM);
    }

    // Handle any reward dialogs
    await this.handleRewardDialogs();

    return true;
  }

  private async handleRewardDialogs(): Promise<void> {
    for (let i = 0; i < CONFIG.REWARD_DIALOG_RETRIES; i++) {
      await this.ui.tryClickSelectors(SELECTORS.DIALOG_BUTTONS, TIMEOUTS.SHORT);
      await this.sleep(DELAYS.SHORT);
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private async sleep(ms: number): Promise<void> {
    await this.browserManager.sleep(ms);
  }
}
