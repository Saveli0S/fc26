import { BrowserManager, LogCallback } from './browser.js';
import { ComplexTaskConfig, CardRequirement } from '../config/tasks.js';
import { UIHelper, EA_SELECTORS, DELAYS, TIMEOUTS } from './ui-helpers.js';

// ============================================================================
// Types
// ============================================================================

interface CardTypeRequirement {
  requirement: CardRequirement;
  type: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  FILTERS: {
    // Quality dropdown - check for all level images
    QUALITY: {
      identifiers: [
        'SearchFilters/level/any.png',
        'SearchFilters/level/bronze.png',
        'SearchFilters/level/silver.png',
        'SearchFilters/level/gold.png',
      ],
      fallbackIndex: 4,
    },
    // Rarity dropdown - check for rarity images or EA CDN background images
    RARITY: {
      identifiers: [
        'SearchFilters/rarity/any.png',
        'backgrounds/itemBGs/929f3299',
        'backgrounds/itemBGs/7535d322',
      ],
      fallbackIndex: 5,
    },
  },
  DEFAULT_MAX_OVR: 85,
};

// ============================================================================
// ComplexTaskHandler Class
// ============================================================================

/**
 * Handles complex SBC tasks that require manual card selection
 * (doesn't use EA's Squad Builder feature)
 */
export class ComplexTaskHandler {
  private browserManager: BrowserManager;
  private log: LogCallback;
  private ui: UIHelper;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
    this.ui = new UIHelper(browserManager, this.log);
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Execute complex task with manual card selection
   */
  async execute(config: ComplexTaskConfig): Promise<boolean> {
    this.log('=== Starting Complex Task (Manual Card Selection) ===', 'info');

    try {
      await this.ui.handleClearSquad();

      const requirements = this.buildRequirementsList(config);

      for (const { requirement, type } of requirements) {
        const success = await this.processCardType(requirement, type);
        if (!success) return false;
      }

      return await this.finalizeTask();
    } catch (error) {
      this.log(`Complex task failed: ${error}`, 'error');
      return false;
    }
  }

  // ==========================================================================
  // Task Flow
  // ==========================================================================

  private buildRequirementsList(config: ComplexTaskConfig): CardTypeRequirement[] {
    const requirements: CardTypeRequirement[] = [];

    if (config.bronzeCards) {
      requirements.push({ requirement: config.bronzeCards, type: 'Bronze' });
    }
    if (config.silverCards) {
      requirements.push({ requirement: config.silverCards, type: 'Silver' });
    }
    if (config.goldCards) {
      requirements.push({ requirement: config.goldCards, type: 'Gold' });
    }

    return requirements;
  }

  private async processCardType(requirement: CardRequirement, type: string): Promise<boolean> {
    this.log(`Processing ${requirement.count}x ${requirement.rarity} ${type} cards...`, 'info');

    for (let i = 0; i < requirement.count; i++) {
      this.log(`  Card ${i + 1}/${requirement.count}...`);

      const success = await this.addSingleCard(requirement);
      if (!success) {
        this.log(`Failed to add ${type} card ${i + 1}`, 'error');
        return false;
      }

      await this.sleep(DELAYS.SHORT);
    }

    return true;
  }

  private async finalizeTask(): Promise<boolean> {
    this.log('All cards added. Closing player details panel...', 'info');

    // Step 1: Close the Player Details sidebar by clicking outside it
    await this.closePlayerDetailsPanel();

    // Step 2: Wait for the Exchange Players button to appear
    this.log('Checking Exchange Players button...', 'info');
    const success = await this.clickExchangePlayers();
    if (!success) {
      this.log('Exchange Players button is disabled or not found', 'error');
      return false;
    }

    this.log('=== Complex Task Completed Successfully ===', 'success');
    return true;
  }

  private async closePlayerDetailsPanel(): Promise<void> {
    const page = this.browserManager.getPage();

    // Click outside the right panel to close Player Details
    // Try clicking on the squad area (left side of the screen)
    const clickTargets = [
      '.ut-squad-pitch-view',
      '.ut-squad-building-content',
      '.ut-sbc-challenge-content',
      '.ut-squad-summary-info',
      '.ut-navigation-bar-view',
    ];

    for (const selector of clickTargets) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)) {
        await element.click({ force: true, position: { x: 10, y: 10 } });
        this.log('Clicked outside panel to close it', 'info');
        await this.sleep(DELAYS.LONG);
        break;
      }
    }

    // Also try pressing Escape
    await page.keyboard.press('Escape');
    await this.sleep(DELAYS.MEDIUM);
  }

  // ==========================================================================
  // Card Operations
  // ==========================================================================

  private async addSingleCard(requirement: CardRequirement): Promise<boolean> {
    // Step 1: Find and click empty slot
    if (!await this.findAndClickEmptySlot()) {
      this.log('No empty slot found', 'error');
      return false;
    }

    // Step 2: Click "Add Player"
    if (!await this.clickAddPlayer()) {
      return false;
    }

    // Step 3: Apply filters
    await this.applyFilters(requirement);

    // Step 4: Click Search
    if (!await this.clickSearch()) {
      return false;
    }

    // Step 5: Select first card and add
    return await this.selectFirstCardAndAdd();
  }

  // ==========================================================================
  // Slot Operations
  // ==========================================================================

  private async findAndClickEmptySlot(): Promise<boolean> {
    const page = this.browserManager.getPage();
    this.log('Looking for empty card slot...');

    // Try primary selectors
    const emptySlot = await this.ui.findFirstVisible(EA_SELECTORS.EMPTY_SLOT, TIMEOUTS.LONG);
    if (emptySlot) {
      await emptySlot.click({ force: true });
      this.log('✓ Clicked empty card slot', 'success');
      await this.sleep(DELAYS.LONG);
      return true;
    }

    // Fallback: check squad slots manually
    const squadSlots = page.locator(EA_SELECTORS.SQUAD_SLOT);
    const slotCount = await squadSlots.count();
    this.log(`Checking ${slotCount} squad slots...`);

    for (let i = 0; i < slotCount; i++) {
      const slot = squadSlots.nth(i);
      const classList = await slot.getAttribute('class') || '';

      if (classList.includes('locked')) continue;

      const emptyItem = slot.locator('.ut-item-loading.empty, .item.empty, .droppable');
      if (await emptyItem.isVisible({ timeout: TIMEOUTS.INSTANT }).catch(() => false)) {
        await emptyItem.click({ force: true });
        this.log(`✓ Clicked empty item in slot ${i}`, 'success');
        await this.sleep(DELAYS.LONG);
        return true;
      }

      // Check by background image
      const html = await slot.innerHTML().catch(() => '');
      if (html.includes('cards_bg_e_0_24_0') || html.includes('ut-item-loading empty')) {
        const itemDiv = slot.locator('.item, .ut-item-view').first();
        if (await itemDiv.isVisible({ timeout: TIMEOUTS.INSTANT }).catch(() => false)) {
          await itemDiv.click({ force: true });
          this.log(`✓ Clicked item in slot ${i}`, 'success');
          await this.sleep(DELAYS.LONG);
          return true;
        }
      }
    }

    this.log('✗ No empty card slots found', 'warning');
    return false;
  }

  // ==========================================================================
  // Button Operations
  // ==========================================================================

  private async clickAddPlayer(): Promise<boolean> {
    const page = this.browserManager.getPage();
    this.log('Waiting for "Add Player" button...');

    // Wait for sidebar
    const sidebarVisible = await this.ui.isAnyVisible(EA_SELECTORS.SIDEBAR, TIMEOUTS.MEDIUM);
    if (!sidebarVisible) {
      this.log('  Sidebar not visible, waiting...', 'warning');
      await this.sleep(DELAYS.LONG);
    }

    // Try Add Player selectors
    for (const selector of EA_SELECTORS.ADD_PLAYER) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: TIMEOUTS.MEDIUM }).catch(() => false)) {
        const text = await btn.textContent().catch(() => '');
        if (text?.toLowerCase().includes('add')) {
          await btn.click({ force: true });
          this.log('✓ Clicked "Add Player"', 'success');
          await this.sleep(DELAYS.LONG);
          return true;
        }
      }
    }

    // Fallback: by exact text
    const textBtn = page.getByText('Add Player').first();
    if (await textBtn.isVisible({ timeout: TIMEOUTS.MEDIUM })) {
      await textBtn.click({ force: true });
      this.log('✓ Clicked "Add Player" (by text)', 'success');
      await this.sleep(DELAYS.LONG);
      return true;
    }

    this.log('✗ Could not find "Add Player" button', 'error');
    return false;
  }

  private async clickSearch(): Promise<boolean> {
    const success = await this.ui.tryClickSelectors(EA_SELECTORS.SEARCH, TIMEOUTS.LONG);

    if (success) {
      this.log('Clicked Search', 'success');
      await this.sleep(DELAYS.EXTRA_LONG);
      return true;
    }

    this.log('Search button not found', 'error');
    return false;
  }

  private async selectFirstCardAndAdd(): Promise<boolean> {
    const page = this.browserManager.getPage();
    this.log('Waiting for search results...');
    await this.sleep(DELAYS.LONG);

    // Check if cards found
    const cardFound = await this.ui.isAnyVisible(EA_SELECTORS.PLAYER_CARDS, TIMEOUTS.MEDIUM);
    if (!cardFound) {
      this.log('✗ No cards found in search results', 'error');
      return false;
    }

    // Click ADD button
    for (const selector of EA_SELECTORS.ADD_CARD) {
      const addBtn = page.locator(selector).first();
      if (await addBtn.isVisible({ timeout: TIMEOUTS.MEDIUM }).catch(() => false)) {
        await addBtn.click({ force: true });
        this.log('✓ Clicked ADD button', 'success');
        await this.sleep(DELAYS.LONG);
        return true;
      }
    }

    // Fallback
    const genericBtn = page.locator('.listFUTItem button, .ut-button-group button').first();
    if (await genericBtn.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)) {
      await genericBtn.click({ force: true });
      this.log('✓ Clicked generic add button', 'success');
      await this.sleep(DELAYS.LONG);
      return true;
    }

    this.log('✗ Could not find ADD button', 'error');
    return false;
  }

  private async clickExchangePlayers(): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Wait for the Exchange Players button to appear in the new panel
    await this.sleep(DELAYS.LONG);

    // Extended selectors for Exchange Players button
    const exchangeSelectors = [
      ...EA_SELECTORS.EXCHANGE_PLAYERS,
      'button.ut-squad-tab-button-control:has-text("Exchange")',
      '.ut-squad-tab-button-control:has-text("Exchange")',
      'button:has-text("Exchange Players")',
      'button:has-text("Обменять")',
    ];

    for (const selector of exchangeSelectors) {
      const exchangeBtn = page.locator(selector).first();

      if (await exchangeBtn.isVisible({ timeout: TIMEOUTS.LONG }).catch(() => false)) {
        // Check if button is enabled (not disabled)
        const classList = await exchangeBtn.getAttribute('class') || '';
        const isDisabled = classList.includes('disabled') || await exchangeBtn.isDisabled().catch(() => false);

        if (isDisabled) {
          this.log('Exchange Players button is disabled', 'warning');
          continue;
        }

        await exchangeBtn.click({ force: true });
        this.log('✓ Clicked Exchange Players', 'success');
        await this.sleep(DELAYS.EXTRA_LONG);

        // Handle confirmation modal
        const confirmed = await this.ui.handleConfirmationModal();
        if (confirmed) {
          this.log('✓ Confirmed exchange', 'success');
        }

        await this.sleep(DELAYS.EXTRA_LONG);
        return true;
      }
    }

    this.log('Exchange Players button not found or disabled', 'error');
    return false;
  }

  // ==========================================================================
  // Filter Operations
  // ==========================================================================

  private async applyFilters(requirement: CardRequirement): Promise<void> {
    this.log('=== Applying filters ===', 'info');
    this.log(`  Target: Quality="${requirement.quality}", Rarity="${requirement.rarity}"`, 'info');

    await this.waitForFilterPanel();

    // Apply toggles
    await this.ui.setToggle('Untradeables Only', true);
    await this.sleep(DELAYS.MICRO);

    await this.ui.setToggle('Exclude Active Squad', true);
    await this.sleep(DELAYS.MICRO);

    // Set Quality
    this.log(`  Setting Quality = "${requirement.quality}"...`);
    await this.ui.setInlineDropdown(CONFIG.FILTERS.QUALITY, requirement.quality);
    await this.sleep(DELAYS.SHORT);

    // Set Sort By
    await this.ui.setStandardDropdown('Sort', 'Low to High');
    await this.sleep(DELAYS.MICRO);

    // Set Max OVR
    await this.ui.setOvrInput(CONFIG.DEFAULT_MAX_OVR, true);
    await this.sleep(DELAYS.MICRO);

    // Set Rarity
    this.log(`  Setting Rarity = "${requirement.rarity}"...`);
    await this.ui.setInlineDropdown(CONFIG.FILTERS.RARITY, requirement.rarity);
    await this.sleep(DELAYS.MICRO);

    // Reset Position if needed
    if (!requirement.isPositionDefined) {
      await this.ui.resetPositionFilter();
      await this.sleep(DELAYS.MICRO);
    }

    this.log('Filters applied', 'success');
  }

  private async waitForFilterPanel(): Promise<void> {
    this.log('  Waiting for filter panel...');
    await this.sleep(DELAYS.EXTRA_LONG);

    const page = this.browserManager.getPage();
    const visible = await page.locator(EA_SELECTORS.INLINE_DROPDOWN)
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false);

    if (visible) {
      this.log('  ✓ Filter panel loaded');
    } else {
      this.log('  ✗ Filter panel not visible!', 'error');
    }

    await this.sleep(DELAYS.SHORT);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private async sleep(ms: number): Promise<void> {
    await this.browserManager.sleep(ms);
  }
}
