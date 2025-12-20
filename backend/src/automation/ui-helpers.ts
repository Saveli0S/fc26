import { Page, Locator } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';
import { DelayService } from './delays.js';

// ============================================================================
// Types
// ============================================================================

export interface DropdownConfig {
  identifiers: string[];     // List of possible identifiers to find the dropdown
  fallbackIndex?: number;    // Fallback index if not found by identifier
}

// ============================================================================
// Selectors - EA Web App UI Components
// ============================================================================

export const EA_SELECTORS = {
  // Dropdowns
  INLINE_DROPDOWN: '.inline-list-select.ut-search-filter-control',
  DROPDOWN_ROW: '.ut-search-filter-control--row',
  DROPDOWN_OPTIONS: 'ul.inline-list li',
  STANDARD_DROPDOWN: '.ut-drop-down-control',

  // Buttons
  CLEAR_SQUAD: [
    'button:has-text("Clear Squad")',
    '.ut-squad-tab-button-control:has-text("Clear")',
    '[class*="clear"]:has-text("Clear")',
    'button.btn-standard:has-text("Clear")',
  ],
  CONFIRM_MODAL: [
    'button:has-text("Ok")',
    'button:has-text("OK")',
    'button:has-text("Yes")',
    'button:has-text("Confirm")',
    'button:has-text("Да")',
    '.ut-button-group button.btn-standard',
    '.modal button.call-to-action',
  ],
  ADD_PLAYER: [
    'button:has-text("Add Player")',
    '.btn-standard:has-text("Add Player")',
    '.ut-button-group button:has-text("Add")',
    '.call-to-action:has-text("Add")',
  ],
  SEARCH: [
    'button:has-text("Search")',
    '.btn-standard:has-text("Search")',
    '.call-to-action:has-text("Search")',
  ],
  ADD_CARD: [
    'button.ut-image-button-control.btnAction.add',
    'button.btnAction.add',
    '.ut-image-button-control.add',
    'button[class*="btnAction"][class*="add"]',
    'button.add',
  ],
  EXCHANGE_PLAYERS: [
    'button:has-text("Exchange Players")',
    'button:has-text("Обменять")',
  ],

  // Empty slots
  EMPTY_SLOT: [
    'div.small.player.item.ut-item-loading.empty.has-chemistry-breakdown.droppable',
    'div.item.ut-item-loading.empty.droppable',
    'div.ut-item-loading.empty',
    '.ut-squad-slot-view div.empty.droppable',
    '.ut-squad-slot-view .item.empty',
    'div[class*="ut-item-loading"][class*="empty"]',
  ],

  // Sidebar
  SIDEBAR: [
    '.ut-player-search-control',
    '.ut-navigation-container-view--content',
    '.ut-pinned-list-container',
    '.DetailPanel',
    '[class*="player-detail"]',
  ],

  // Player cards in results
  PLAYER_CARDS: [
    '.ut-pinned-list .listFUTItem',
    '.listFUTItem',
    '.ut-item-view',
    '.player.item:not(.empty)',
  ],

  // Toggle cells
  TOGGLE_CELL: '.ut-toggle-cell',
  TOGGLE_CONTROL: '.ut-toggle-control',

  // Inputs
  OVR_INPUT: 'input[type="tel"].ut-number-input-control',

  // Squad slots
  SQUAD_SLOT: '.ut-squad-slot-view',
};

// ============================================================================
// Timeouts
// ============================================================================

export const TIMEOUTS = {
  INSTANT: 200,
  SHORT: 500,
  MEDIUM: 1000,
  LONG: 2000,
  EXTRA_LONG: 5000,
};

// ============================================================================
// Delays
// ============================================================================

export const DELAYS = {
  MICRO: 300,
  SHORT: 500,
  MEDIUM: 1000,
  LONG: 1500,
  EXTRA_LONG: 2000,
};

// ============================================================================
// UIHelper Class
// ============================================================================

export class UIHelper {
  private browserManager: BrowserManager;
  private log: LogCallback;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
  }

  private get page(): Page {
    return this.browserManager.getPage();
  }

  private get delays(): DelayService {
    return this.browserManager.getDelayService();
  }

  // ==========================================================================
  // Core Element Operations
  // ==========================================================================

  /**
   * Try clicking first visible element from a list of selectors
   */
  async tryClickSelectors(selectors: string[], timeout = TIMEOUTS.MEDIUM): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout })) {
          await element.click({ force: true });
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Check if any selector from the list is visible
   */
  async isAnyVisible(selectors: string[], timeout = TIMEOUTS.MEDIUM): Promise<boolean> {
    for (const selector of selectors) {
      try {
        if (await this.page.locator(selector).first().isVisible({ timeout })) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Find first visible element from selectors
   */
  async findFirstVisible(selectors: string[], timeout = TIMEOUTS.SHORT): Promise<Locator | null> {
    for (const selector of selectors) {
      try {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout })) {
          return element;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Click element if visible and enabled
   */
  async clickIfEnabled(locator: Locator, timeout = TIMEOUTS.MEDIUM): Promise<boolean> {
    try {
      if (await locator.isVisible({ timeout })) {
        const isDisabled = await locator.isDisabled().catch(() => false);
        if (!isDisabled) {
          await locator.click({ force: true });
          return true;
        }
      }
    } catch {
      // Ignore
    }
    return false;
  }

  // ==========================================================================
  // EA-Specific UI Components
  // ==========================================================================

  /**
   * Handle Clear Squad button and confirmation modal
   * @param delayAfterClick - Optional delay in ms after clicking Clear Squad (default: 500ms)
   */
  async handleClearSquad(delayAfterClick = DELAYS.SHORT): Promise<boolean> {
    this.log('Checking for "Clear Squad" button...');

    // Try using getByRole first (most reliable)
    const clearBtn = this.page.getByRole('button', { name: /Clear Squad|Очистить/i }).first();
    if (await clearBtn.isVisible({ timeout: TIMEOUTS.LONG }).catch(() => false)) {
      const classAttr = await clearBtn.getAttribute('class') || '';
      const isDisabled = classAttr.includes('disabled') || await clearBtn.isDisabled().catch(() => false);

      if (!isDisabled) {
        this.log('Found "Clear Squad" button, clicking...');
        await clearBtn.click({ force: true });

        if (delayAfterClick > DELAYS.SHORT) {
          this.log(`Waiting ${delayAfterClick / 1000}s after Clear Squad...`, 'info');
        }
        await this.sleep(delayAfterClick);

        await this.handleConfirmationModal();
        return true;
      } else {
        this.log('Clear Squad button is disabled');
        return false;
      }
    }

    // Fallback to selector-based search
    for (const selector of EA_SELECTORS.CLEAR_SQUAD) {
      const btn = this.page.locator(selector).first();
      if (await btn.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)) {
        const isDisabled = await btn.isDisabled().catch(() => false);
        if (!isDisabled) {
          this.log('Found "Clear Squad" button (fallback), clicking...');
          await btn.click({ force: true });

          if (delayAfterClick > DELAYS.SHORT) {
            this.log(`Waiting ${delayAfterClick / 1000}s after Clear Squad...`, 'info');
          }
          await this.sleep(delayAfterClick);

          await this.handleConfirmationModal();
          return true;
        }
      }
    }

    this.log('No active "Clear Squad" button found');
    return false;
  }

  /**
   * Handle confirmation modal (Ok/Yes/Confirm)
   */
  async handleConfirmationModal(): Promise<boolean> {
    this.log('Looking for confirmation modal...');
    await this.sleep(DELAYS.SHORT);

    for (const selector of EA_SELECTORS.CONFIRM_MODAL) {
      const btn = this.page.locator(selector).first();
      if (await btn.isVisible({ timeout: TIMEOUTS.LONG }).catch(() => false)) {
        this.log(`Clicking confirmation button`);
        await btn.click({ force: true });
        await this.sleep(DELAYS.MEDIUM);
        this.log('✓ Confirmed', 'success');
        return true;
      }
    }

    this.log('No confirmation button found', 'warning');
    return false;
  }

  /**
   * Set EA toggle/checkbox by label
   */
  async setToggle(label: string, enabled: boolean): Promise<boolean> {
    const selectors = [
      `${EA_SELECTORS.TOGGLE_CELL}:has-text("${label}")`,
      `.ut-search-filter-control:has-text("${label}")`,
      `div:has-text("${label}"):has(input[type="checkbox"])`,
      `label:has-text("${label}")`,
    ];

    for (const selector of selectors) {
      const element = this.page.locator(selector).first();
      if (await element.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)) {
        const classList = await element.getAttribute('class') || '';
        const isCurrentlyChecked = classList.includes('toggled') ||
                                   classList.includes('checked') ||
                                   classList.includes('selected');

        if (isCurrentlyChecked !== enabled) {
          const clickTarget = element.locator(`${EA_SELECTORS.TOGGLE_CONTROL}, input, .toggle`).first();
          if (await clickTarget.isVisible({ timeout: TIMEOUTS.INSTANT }).catch(() => false)) {
            await clickTarget.click({ force: true });
          } else {
            await element.click({ force: true });
          }
          this.log(`  ✓ Set "${label}" = ${enabled}`, 'success');
        } else {
          this.log(`  "${label}" already ${enabled ? 'enabled' : 'disabled'}`);
        }
        return true;
      }
    }

    // Fallback: by text
    const textElement = this.page.getByText(label, { exact: false }).first();
    if (await textElement.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await textElement.click({ force: true });
      this.log(`  ✓ Toggled "${label}" (by text)`, 'success');
      return true;
    }

    this.log(`  ✗ Could not find toggle "${label}"`, 'warning');
    return false;
  }

  /**
   * Set inline dropdown by finding it via HTML content identifier
   * IMPORTANT: Matches options by TEXT VALUE, not by index/order
   */
  async setInlineDropdown(config: DropdownConfig, value: string): Promise<boolean> {
    this.log(`  [DROPDOWN] Requested value: "${value}"`, 'info');
    const valueLower = value.toLowerCase().trim();

    const allDropdowns = this.page.locator(EA_SELECTORS.INLINE_DROPDOWN);
    const count = await allDropdowns.count();

    // Find dropdown by checking all identifiers in the list
    let targetDropdown: Locator | null = null;
    let dropdownIndex = -1;
    let matchedIdentifier = '';

    for (let i = 0; i < count; i++) {
      const dropdown = allDropdowns.nth(i);
      const html = await dropdown.innerHTML().catch(() => '');

      // Check each identifier
      for (const identifier of config.identifiers) {
        if (html.includes(identifier)) {
          targetDropdown = dropdown;
          dropdownIndex = i;
          matchedIdentifier = identifier;
          this.log(`  [DROPDOWN] Found dropdown with "${identifier}" at index ${i}`);
          break;
        }
      }

      if (targetDropdown) break;
    }

    // Fallback to index
    if (!targetDropdown && config.fallbackIndex !== undefined && count > config.fallbackIndex) {
      targetDropdown = allDropdowns.nth(config.fallbackIndex);
      dropdownIndex = config.fallbackIndex;
      this.log(`  [DROPDOWN] Using fallback dropdown at index ${config.fallbackIndex}`, 'warning');
    }

    if (!targetDropdown) {
      this.log(`  [DROPDOWN] ✗ Dropdown not found`, 'error');
      return false;
    }

    const dropdownRow = targetDropdown.locator(EA_SELECTORS.DROPDOWN_ROW).first();
    const resetBtn = targetDropdown.locator('button.flat.ut-search-filter-control--row-button, button.flat').first();

    // If already selected, no-op. If selected to something else, try resetting first (EA UI sometimes breaks otherwise).
    const currentRowText = (await dropdownRow.textContent().catch(() => '') || '').trim().toLowerCase();
    if (currentRowText && currentRowText.includes(valueLower)) {
      this.log(`  [DROPDOWN] Already set to "${value}"`, 'info');
      return true;
    }

    const resetVisible = await resetBtn.isVisible({ timeout: TIMEOUTS.INSTANT }).catch(() => false);
    if (resetVisible) {
      this.log('  [DROPDOWN] Reset button visible, clearing current selection...', 'info');
      await resetBtn.click({ force: true }).catch(() => undefined);
      await this.sleep(DELAYS.MICRO);
    }

    // Click to open dropdown (retry because EA sometimes renders options in a portal outside the dropdown node)
    const options = this.page.locator(EA_SELECTORS.DROPDOWN_OPTIONS);
    const altOptions = this.page.locator('[role="listbox"] [role="option"], li[role="option"], li[class*="option"]');

    await dropdownRow.scrollIntoViewIfNeeded().catch(() => undefined);
    for (let attempt = 0; attempt < 3; attempt++) {
      await dropdownRow.click({ force: true });
      await this.sleep(DELAYS.SHORT);

      const appeared = await Promise.race([
        options.first().waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false),
        altOptions.first().waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false),
      ]);

      if (appeared) break;

      // Close and retry
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await this.sleep(DELAYS.MICRO);
    }

    // Log all available options with their indices for debugging
    const optionCount = await options.count();
    const altOptionCount = await altOptions.count();
    this.log(`  [DROPDOWN] Found ${optionCount} options (inline) / ${altOptionCount} options (alt):`);
    const availableOptions: { index: number; text: string }[] = [];
    const optionLocatorToUse = optionCount > 0 ? options : altOptions;
    const totalToScan = optionCount > 0 ? optionCount : altOptionCount;

    for (let i = 0; i < totalToScan; i++) {
      const opt = optionLocatorToUse.nth(i);
      const isVisible = await opt.isVisible({ timeout: TIMEOUTS.INSTANT }).catch(() => false);
      if (!isVisible) continue;

      const text = (await opt.textContent().catch(() => '') || '').trim();
      if (!text) continue;

      availableOptions.push({ index: i, text });
      this.log(`    [${i}] "${text}"`);
    }

    if (availableOptions.length === 0) {
      // Targeted debug (cheap counts) for the "Found 0 options" case
      const ulCount = await this.page.locator('ul.inline-list').count().catch(() => 0);
      const liCount = await this.page.locator('ul.inline-list li').count().catch(() => 0);
      const roleOptionCount = await this.page.locator('[role="option"]').count().catch(() => 0);
      const roleListboxCount = await this.page.locator('[role="listbox"]').count().catch(() => 0);
      const rowText = (await dropdownRow.textContent().catch(() => '') || '').trim();
      this.log(
        `  [DROPDOWN] Debug: ul.inline-list=${ulCount}, ul.inline-list li=${liCount}, role=listbox=${roleListboxCount}, role=option=${roleOptionCount}, rowText="${rowText}"`,
        'warning'
      );
    }

    // Find and click option by EXACT TEXT VALUE match (case-insensitive)
    for (const opt of availableOptions) {
      if (opt.text.toLowerCase() === valueLower) {
        this.log(`  [DROPDOWN] EXACT MATCH: Clicking option [${opt.index}] "${opt.text}"`, 'success');
        await optionLocatorToUse.nth(opt.index).click({ force: true });
        await this.sleep(DELAYS.SHORT);

        // Verify what was selected
        const selectedText = await dropdownRow.textContent().catch(() => '') || '';
        this.log(`  [DROPDOWN] After click, selected text: "${selectedText.trim()}"`, 'info');
        return true;
      }
    }

    // Try partial match as last resort (e.g., "Gold" matches "Gold Players")
    for (const opt of availableOptions) {
      const textLower = opt.text.toLowerCase();
      if (textLower.includes(valueLower) || valueLower.includes(textLower)) {
        this.log(`  [DROPDOWN] PARTIAL MATCH: Clicking option [${opt.index}] "${opt.text}" for requested "${value}"`, 'warning');
        await optionLocatorToUse.nth(opt.index).click({ force: true });
        await this.sleep(DELAYS.SHORT);

        // Verify what was selected
        const selectedText = await dropdownRow.textContent().catch(() => '') || '';
        this.log(`  [DROPDOWN] After click, selected text: "${selectedText.trim()}"`, 'info');
        return true;
      }
    }

    await this.page.keyboard.press('Escape');
    this.log(`  [DROPDOWN] ✗ No match for "${value}" in options`, 'error');
    return false;
  }

  /**
   * Set standard dropdown (ut-drop-down-control)
   */
  async setStandardDropdown(labelHint: string, value: string): Promise<boolean> {
    const dropdowns = this.page.locator(EA_SELECTORS.STANDARD_DROPDOWN);
    const count = await dropdowns.count();

    for (let i = 0; i < count; i++) {
      const dropdown = dropdowns.nth(i);
      const text = await dropdown.textContent() || '';

      if (text.toLowerCase().includes(labelHint.toLowerCase()) ||
          text.includes('Sort') || text.includes('Rating')) {

        await dropdown.click({ force: true });
        await this.sleep(DELAYS.SHORT);

        const optionTexts = [value, 'Rating Low to High', 'Low to High'];
        for (const optText of optionTexts) {
          const option = this.page.locator('li, [class*="option"]').filter({ hasText: optText }).first();
          if (await option.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)) {
            await option.click({ force: true });
            this.log(`  ✓ Set "${labelHint}" = "${optText}"`, 'success');
            return true;
          }
        }

        await this.page.keyboard.press('Escape');
      }
    }

    this.log(`  ✗ Could not find "${labelHint}" dropdown`, 'warning');
    return false;
  }

  /**
   * Set OVR input (Min or Max)
   */
  async setOvrInput(value: number, isMax = true): Promise<boolean> {
    try {
      const inputs = this.page.locator(EA_SELECTORS.OVR_INPUT);
      const count = await inputs.count();

      if (count >= 2) {
        const input = inputs.nth(isMax ? 1 : 0);
        await input.click();
        await input.clear();
        await input.fill(value.toString());
        await input.press('Tab');
        this.log(`  ✓ Set ${isMax ? 'Max' : 'Min'} OVR = ${value}`, 'success');
        return true;
      } else if (count === 1) {
        const input = inputs.first();
        await input.click();
        await input.clear();
        await input.fill(value.toString());
        await input.press('Tab');
        this.log(`  ✓ Set OVR = ${value}`, 'success');
        return true;
      }

      this.log(`  ✗ OVR input not found`, 'warning');
      return false;
    } catch (error) {
      this.log(`  ✗ Error setting OVR: ${error}`, 'warning');
      return false;
    }
  }

  /**
   * Reset position filter
   */
  async resetPositionFilter(): Promise<boolean> {
    const allFilters = this.page.locator(EA_SELECTORS.INLINE_DROPDOWN);
    const filterCount = await allFilters.count();

    for (let i = 0; i < filterCount; i++) {
      const filter = allFilters.nth(i);
      const html = await filter.innerHTML().catch(() => '');

      if (html.includes('/positions/') || html.includes('GK') || html.includes('ST') || html.includes('CM')) {
        const resetBtn = filter.locator('button.flat.ut-search-filter-control--row-button, button.flat').first();
        if (await resetBtn.isVisible({ timeout: TIMEOUTS.MEDIUM }).catch(() => false)) {
          await resetBtn.click({ force: true });
          this.log('  ✓ Reset Position filter', 'success');
          return true;
        }
      }
    }

    this.log('  ✗ Could not find Position reset button', 'warning');
    return false;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async sleep(ms: number): Promise<void> {
    await this.browserManager.sleep(ms);
  }

  async pressEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }
}
