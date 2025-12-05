import { Page } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';
import { ComplexTaskConfig, CardRequirement, CardQuality, CardRarity } from '../config/tasks.js';

/**
 * Handles complex tasks that require manual card selection
 * (doesn't use Squad Builder)
 */
export class ComplexTaskHandler {
  private browserManager: BrowserManager;
  private log: LogCallback;

  // Empty card slot background image
  private readonly EMPTY_CARD_BG = 'cards_bg_e_0_24_0.png';

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
  }

  /**
   * Execute complex task with manual card selection
   */
  async execute(config: ComplexTaskConfig): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('=== Starting Complex Task (Manual Card Selection) ===', 'info');

    try {
      // First, check if "Clear Squad" button is visible and click it
      await this.handleClearSquad();

      // Build list of card requirements in order
      const requirements: { requirement: CardRequirement; type: string }[] = [];

      if (config.bronzeCards) {
        requirements.push({ requirement: config.bronzeCards, type: 'Bronze' });
      }
      if (config.silverCards) {
        requirements.push({ requirement: config.silverCards, type: 'Silver' });
      }
      if (config.goldCards) {
        requirements.push({ requirement: config.goldCards, type: 'Gold' });
      }

      // Process each card type
      for (const { requirement, type } of requirements) {
        this.log(`Processing ${requirement.count}x ${requirement.rarity} ${type} cards...`, 'info');

        for (let i = 0; i < requirement.count; i++) {
          this.log(`  Card ${i + 1}/${requirement.count}...`);

          const success = await this.addSingleCard(requirement);
          if (!success) {
            this.log(`Failed to add ${type} card ${i + 1}`, 'error');
            return false;
          }

          await this.browserManager.sleep(500);
        }
      }

      // Check if Exchange Players is enabled and click it
      this.log('All cards added. Checking Exchange Players button...', 'info');
      const exchangeSuccess = await this.clickExchangePlayers();

      if (!exchangeSuccess) {
        this.log('Exchange Players button is disabled or not found', 'error');
        return false;
      }

      this.log('=== Complex Task Completed Successfully ===', 'success');
      return true;

    } catch (error) {
      this.log(`Complex task failed: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Handle "Clear Squad" button if visible, and confirm the modal
   */
  private async handleClearSquad(): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log('Checking for "Clear Squad" button...');

      // Look for Clear Squad button
      const clearSquadSelectors = [
        'button:has-text("Clear Squad")',
        '.ut-squad-tab-button-control:has-text("Clear")',
        '[class*="clear"]:has-text("Clear")',
        'button.btn-standard:has-text("Clear")',
      ];

      for (const selector of clearSquadSelectors) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          // Check if button is enabled (not disabled)
          const isDisabled = await btn.isDisabled().catch(() => false);
          if (!isDisabled) {
            this.log('Found "Clear Squad" button, clicking...');
            await btn.click({ force: true });
            await this.browserManager.sleep(500);

            // Handle confirmation modal - click "Ok"
            await this.handleConfirmationModal();
            return;
          }
        }
      }

      this.log('No active "Clear Squad" button found');

    } catch (error) {
      this.log(`Error handling Clear Squad: ${error}`, 'warning');
    }
  }

  /**
   * Handle confirmation modal (click "Ok" or "Yes")
   */
  private async handleConfirmationModal(): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log('Looking for confirmation modal...');
      await this.browserManager.sleep(500);

      // Look for Ok/Yes/Confirm button in modal
      const confirmSelectors = [
        'button:has-text("Ok")',
        'button:has-text("OK")',
        'button:has-text("Yes")',
        'button:has-text("Confirm")',
        '.ut-button-group button.btn-standard',
        '.modal button.call-to-action',
      ];

      for (const selector of confirmSelectors) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          this.log(`Clicking confirmation button: ${selector}`);
          await btn.click({ force: true });
          await this.browserManager.sleep(1000);
          this.log('✓ Confirmed Clear Squad', 'success');
          return;
        }
      }

      this.log('No confirmation button found', 'warning');

    } catch (error) {
      this.log(`Error handling confirmation: ${error}`, 'warning');
    }
  }

  /**
   * Find and click an empty card slot
   * Empty slots have: class="small player item ut-item-loading empty has-chemistry-breakdown droppable"
   * And background-image: url(../images/Items/cards_bg_e_0_24_0.png)
   */
  private async findEmptyCardSlot(): Promise<boolean> {
    const page = this.browserManager.getPage();

    try {
      this.log('Looking for empty card slot...');

      // Primary selector: exact class match for empty droppable slots
      const emptySlot = page.locator('div.small.player.item.ut-item-loading.empty.has-chemistry-breakdown.droppable').first();

      if (await emptySlot.isVisible({ timeout: 2000 }).catch(() => false)) {
        await emptySlot.click({ force: true });
        this.log('✓ Clicked empty card slot (droppable)', 'success');
        await this.browserManager.sleep(1500);
        return true;
      }

      // Alternative selectors
      const emptySelectors = [
        'div.item.ut-item-loading.empty.droppable',
        'div.ut-item-loading.empty',
        '.ut-squad-slot-view div.empty.droppable',
        '.ut-squad-slot-view .item.empty',
        'div[class*="ut-item-loading"][class*="empty"]',
      ];

      for (const selector of emptySelectors) {
        const slot = page.locator(selector).first();
        if (await slot.isVisible({ timeout: 500 }).catch(() => false)) {
          await slot.click({ force: true });
          this.log(`✓ Clicked empty slot (${selector})`, 'success');
          await this.browserManager.sleep(1500);
          return true;
        }
      }

      // Find all squad slot views and check for empty items inside
      const squadSlots = page.locator('.ut-squad-slot-view');
      const slotCount = await squadSlots.count();
      this.log(`Found ${slotCount} squad slots, checking for empty ones...`);

      for (let i = 0; i < slotCount; i++) {
        const slot = squadSlots.nth(i);
        const classList = await slot.getAttribute('class') || '';

        // Skip locked slots
        if (classList.includes('locked')) {
          continue;
        }

        // Check if this slot has an empty item inside
        const emptyItem = slot.locator('.ut-item-loading.empty, .item.empty, .droppable');
        if (await emptyItem.isVisible({ timeout: 200 }).catch(() => false)) {
          await emptyItem.click({ force: true });
          this.log(`✓ Clicked empty item in slot ${i}`, 'success');
          await this.browserManager.sleep(1500);
          return true;
        }

        // Check by innerHTML for the empty background image
        const html = await slot.innerHTML().catch(() => '');
        if (html.includes('cards_bg_e_0_24_0') || html.includes('ut-item-loading empty')) {
          // Click the item div inside
          const itemDiv = slot.locator('.item, .ut-item-view').first();
          if (await itemDiv.isVisible({ timeout: 200 }).catch(() => false)) {
            await itemDiv.click({ force: true });
            this.log(`✓ Clicked item in slot ${i} (by background)`, 'success');
            await this.browserManager.sleep(1500);
            return true;
          }
        }
      }

      this.log('✗ No empty card slots found', 'warning');
      return false;

    } catch (error) {
      this.log(`✗ Error finding empty slot: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Click "Add Player" in the sidebar
   */
  private async clickAddPlayer(): Promise<boolean> {
    const page = this.browserManager.getPage();

    try {
      this.log('Waiting for sidebar with "Add Player" button...');

      // Wait for sidebar/panel to appear (Player Details panel)
      const sidebarSelectors = [
        '.ut-player-search-control',
        '.ut-navigation-container-view--content',
        '.ut-pinned-list-container',
        '.DetailPanel',
        '[class*="player-detail"]',
      ];

      let sidebarVisible = false;
      for (const selector of sidebarSelectors) {
        if (await page.locator(selector).isVisible({ timeout: 1000 }).catch(() => false)) {
          sidebarVisible = true;
          this.log(`  Sidebar detected (${selector})`);
          break;
        }
      }

      if (!sidebarVisible) {
        this.log('  Sidebar not visible, waiting longer...', 'warning');
        await this.browserManager.sleep(1500);
      }

      // Find Add Player button with multiple selectors
      const addPlayerSelectors = [
        'button:has-text("Add Player")',
        '.btn-standard:has-text("Add Player")',
        '.ut-button-group button:has-text("Add")',
        'button.btn-standard',
        '.call-to-action:has-text("Add")',
      ];

      for (const selector of addPlayerSelectors) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          const text = await btn.textContent().catch(() => '');
          if (text?.toLowerCase().includes('add')) {
            await btn.click({ force: true });
            this.log(`✓ Clicked "Add Player" (${selector})`, 'success');
            await this.browserManager.sleep(1500);
            return true;
          }
        }
      }

      // Try by exact text
      const textBtn = page.getByText('Add Player').first();
      if (await textBtn.isVisible({ timeout: 1000 })) {
        await textBtn.click({ force: true });
        this.log('✓ Clicked "Add Player" (by text)', 'success');
        await this.browserManager.sleep(1500);
        return true;
      }

      // Try clicking first visible button in the panel
      const panelButtons = page.locator('.ut-button-group button, .DetailPanel button').first();
      if (await panelButtons.isVisible({ timeout: 500 })) {
        await panelButtons.click({ force: true });
        this.log('✓ Clicked first panel button', 'success');
        await this.browserManager.sleep(1500);
        return true;
      }

      this.log('✗ Could not find "Add Player" button', 'error');
      return false;

    } catch (error) {
      this.log(`✗ Error clicking Add Player: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Apply search filters
   */
  private async applyFilters(requirement: CardRequirement): Promise<void> {
    const page = this.browserManager.getPage();

    this.log('=== Applying filters ===', 'info');
    this.log(`  Target: Quality="${requirement.quality}", Rarity="${requirement.rarity}"`, 'info');

    // Wait for filter panel to be fully loaded
    this.log('  Waiting for filter panel...');
    await this.browserManager.sleep(2000);

    // Wait for filter dropdowns to appear
    const qualitySelector = '.inline-list-select.ut-search-filter-control';
    const dropdownsVisible = await page.locator(qualitySelector).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);

    if (!dropdownsVisible) {
      this.log('  ✗ Filter dropdowns not visible after 5s!', 'error');
    } else {
      this.log('  ✓ Filter panel loaded');
    }

    await this.browserManager.sleep(500);

    // 1. Untradeables Only checkbox
    await this.setCheckbox('Untradeables Only', true);
    await this.browserManager.sleep(300);

    // 2. Exclude Active Squad Players checkbox
    await this.setCheckbox('Exclude Active Squad', true);
    await this.browserManager.sleep(300);

	// 5. Quality filter (Bronze/Silver/Gold)
	this.log(`  Config quality: "${requirement.quality}"`, 'info');
	await this.setQualityFilter(requirement.quality);
	this.log('  Pausing 15s to verify Quality selection...');
	await this.browserManager.sleep(500);

    // 3. Sort By: Rating Low to High
    await this.setDropdown('Sort By', 'Low to High');
    await this.browserManager.sleep(300);

    // 4. Max OVR: 85
    await this.setMaxOVR(85);
    await this.browserManager.sleep(300);

    // 6. Rarity filter (Common/Rare)
    await this.setRarityFilter(requirement.rarity);
    await this.browserManager.sleep(300);

    // 7. Position - reset if not defined
    if (!requirement.isPositionDefined) {
      await this.resetPositionFilter();
      await this.browserManager.sleep(300);
    }

    this.log('Filters applied', 'success');
  }

  private async setCheckbox(label: string, checked: boolean): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // EA uses toggle cells with specific structure
      // Try multiple selector strategies
      const selectors = [
        `.ut-toggle-cell:has-text("${label}")`,
        `.ut-search-filter-control:has-text("${label}")`,
        `div:has-text("${label}"):has(input[type="checkbox"])`,
        `label:has-text("${label}")`,
      ];

      for (const selector of selectors) {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 500 }).catch(() => false)) {
          // Check current state by looking for "toggled" or "checked" class
          const classList = await element.getAttribute('class') || '';
          const isCurrentlyChecked = classList.includes('toggled') || classList.includes('checked') || classList.includes('selected');

          if (isCurrentlyChecked !== checked) {
            // Find clickable part - the toggle button or input
            const clickTarget = element.locator('.ut-toggle-control, input, .toggle').first();
            if (await clickTarget.isVisible({ timeout: 300 }).catch(() => false)) {
              await clickTarget.click({ force: true });
            } else {
              await element.click({ force: true });
            }
            this.log(`  ✓ Set "${label}" = ${checked}`, 'success');
          } else {
            this.log(`  "${label}" already ${checked ? 'checked' : 'unchecked'}`);
          }
          return;
        }
      }

      // Fallback: search by text and click the whole row
      const textElement = page.getByText(label, { exact: false }).first();
      if (await textElement.isVisible({ timeout: 500 })) {
        await textElement.click({ force: true });
        this.log(`  ✓ Toggled "${label}" (by text)`, 'success');
        return;
      }

      this.log(`  ✗ Could not find checkbox "${label}"`, 'warning');

    } catch (error) {
      this.log(`  ✗ Error setting "${label}": ${error}`, 'warning');
    }
  }

  private async setDropdown(label: string, value: string): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log(`  Looking for "${label}" dropdown...`);

      // For Sort By dropdown, use ut-drop-down-control
      const dropdowns = page.locator('.ut-drop-down-control');
      const count = await dropdowns.count();
      this.log(`  Found ${count} dropdowns`);

      for (let i = 0; i < count; i++) {
        const dropdown = dropdowns.nth(i);
        const text = await dropdown.textContent() || '';

        // Check if this dropdown matches the label
        if (text.toLowerCase().includes(label.toLowerCase()) ||
            text.includes('Sort') ||
            text.includes('Rating') ||
            text.includes('Low') ||
            text.includes('High')) {

          this.log(`  Found dropdown: "${text.trim().substring(0, 30)}..."`);
          await dropdown.click({ force: true });
          await this.browserManager.sleep(500);

          // Look for the option with the value
          const optionTexts = [value, 'Rating Low to High', 'Low to High', 'Рейтинг'];

          for (const optText of optionTexts) {
            const option = page.locator('li, [class*="option"]').filter({ hasText: optText }).first();
            if (await option.isVisible({ timeout: 500 }).catch(() => false)) {
              await option.click({ force: true });
              this.log(`  ✓ Set "${label}" = "${optText}"`, 'success');
              return;
            }
          }

          // Try by index - "Rating Low to High" is usually index 1 or 2
          const allOptions = page.locator('.ut-drop-down-control ul li, ul.drop-down-list li');
          const optCount = await allOptions.count();
          this.log(`  Found ${optCount} options`);

          if (optCount >= 2) {
            // Index 1 is usually "Rating Low to High"
            await allOptions.nth(1).click({ force: true });
            this.log(`  ✓ Set "${label}" (by index 1)`, 'success');
            return;
          }

          await page.keyboard.press('Escape');
          return;
        }
      }

      this.log(`  ✗ Could not find "${label}" dropdown`, 'warning');

    } catch (error) {
      this.log(`  ✗ Error setting "${label}": ${error}`, 'warning');
    }
  }

  private async setMaxOVR(value: number): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      const maxOvrInput = page.locator('input[type="tel"].ut-number-input-control, input[placeholder*="Max"]').last();

      if (await maxOvrInput.isVisible({ timeout: 1000 })) {
        await maxOvrInput.click();
        await maxOvrInput.fill(value.toString());
        this.log(`  Set Max OVR = ${value}`, 'success');
      }

    } catch (error) {
      this.log(`  Could not set Max OVR: ${error}`, 'warning');
    }
  }

  private async setQualityFilter(quality: string): Promise<void> {
    const page = this.browserManager.getPage();
    const qualityLower = quality.toLowerCase();

    this.log(`  === Setting Quality = "${quality}" ===`);

    try {
      // Wait for filter panel
      await this.browserManager.sleep(1000);

      // Try multiple selectors to find dropdowns
      const selectors = [
        '.inline-list-select.ut-search-filter-control',
        '.inline-list-select',
        '.ut-search-filter-control',
        '[class*="inline-list-select"]',
      ];

      let allDropdowns = null;
      let count = 0;

      for (const selector of selectors) {
        const dropdowns = page.locator(selector);
        count = await dropdowns.count();
        this.log(`  Selector "${selector}": found ${count} elements`);
        if (count > 0) {
          allDropdowns = dropdowns;
          break;
        }
      }

      if (!allDropdowns || count === 0) {
        this.log(`  ✗ No dropdowns found with any selector!`, 'error');
        return;
      }

      // Find dropdown with /level/ in innerHTML (Quality dropdown)
      for (let i = 0; i < count; i++) {
        const dd = allDropdowns.nth(i);
        const html = await dd.innerHTML().catch(() => '');
        const text = await dd.textContent().catch(() => '') || '';

        this.log(`    [${i}] text: "${text.substring(0, 50)}", hasLevel: ${html.includes('/level/')}`);

        if (html.includes('/level/') || text.includes('Quality')) {
          this.log(`  >>> Found Quality dropdown at [${i}]`);
          await this.clickQualityOption(dd, quality, qualityLower);
          return;
        }
      }

      this.log(`  ✗ Quality dropdown not found`, 'warning');

    } catch (error) {
      this.log(`  ✗ Error setting Quality: ${error}`, 'warning');
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  private async clickQualityOption(dropdown: any, quality: string, qualityLower: string): Promise<void> {
    const page = this.browserManager.getPage();

    // Click row to open dropdown
    const dropdownRow = dropdown.locator('.ut-search-filter-control--row').first();
    await dropdownRow.click({ force: true });
    await this.browserManager.sleep(1000);

    // Wait for dropdown to open (has class is-open)
    await this.browserManager.sleep(500);

    // Use getByText to find exact option
    const targetOption = dropdown.getByText(quality, { exact: true });

    if (await targetOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      this.log(`  Found "${quality}" option, clicking...`);
      await targetOption.click({ force: true });
      this.log(`  ✓ Set Quality = "${quality}"`, 'success');
      await this.browserManager.sleep(500);
      return;
    }

    // Fallback: iterate through li elements
    const optionsList = dropdown.locator('ul.inline-list li');
    const optionCount = await optionsList.count();
    this.log(`  Fallback: Found ${optionCount} Quality options`);

    for (let i = 0; i < optionCount; i++) {
      const option = optionsList.nth(i);
      const text = await option.textContent().catch(() => '') || '';
      this.log(`    [${i}]: "${text.trim()}"`);

      if (text.trim().toLowerCase() === qualityLower) {
        this.log(`  >>> Clicking "${quality}" at index ${i}`);
        await option.click({ force: true });
        this.log(`  ✓ Set Quality = "${quality}"`, 'success');
        await this.browserManager.sleep(500);
        return;
      }
    }

    await page.keyboard.press('Escape');
    this.log(`  ✗ Could not find "${quality}" option`, 'warning');
  }

  private async setRarityFilter(rarity: string): Promise<void> {
    const page = this.browserManager.getPage();
    const rarityLower = rarity.toLowerCase();

    try {
      this.log(`  Looking for Rarity dropdown...`);

      // Find rarity dropdown by position (has /rarity/ images)
      const allDropdowns = page.locator('.inline-list-select.ut-search-filter-control');
      const dropdownCount = await allDropdowns.count();

      // Rarity dropdown has /rarity/ images
      let rarityDropdown = null;
      for (let i = 0; i < dropdownCount; i++) {
        const dropdown = allDropdowns.nth(i);
        const html = await dropdown.innerHTML().catch(() => '');
        if (html.includes('/rarity/')) {
          rarityDropdown = dropdown;
          this.log(`  Found Rarity dropdown at index ${i}`);
          break;
        }
      }

      if (!rarityDropdown) {
        this.log(`  ✗ Rarity dropdown not found`, 'warning');
        return;
      }

      // Click row to open dropdown
      const dropdownRow = rarityDropdown.locator('.ut-search-filter-control--row').first();
      await dropdownRow.click({ force: true });
      await this.browserManager.sleep(800);

      // Get options from this dropdown
      const options = rarityDropdown.locator('ul.inline-list li');
      const optionCount = await options.count();
      this.log(`  Found ${optionCount} Rarity options`);

      // Find by text content (Common, Rare)
      for (let i = 0; i < optionCount; i++) {
        const option = options.nth(i);
        const text = await option.textContent().catch(() => '') || '';
        this.log(`    [${i}]: "${text.trim()}"`);

        if (text.trim().toLowerCase() === rarityLower) {
          this.log(`  >>> Clicking "${rarity}" at index ${i}`);
          await option.click({ force: true });
          this.log(`  ✓ Set Rarity = "${rarity}"`, 'success');
          await this.browserManager.sleep(500);
          return;
        }
      }

      await page.keyboard.press('Escape');
      this.log(`  ✗ Could not find Rarity option: ${rarity}`, 'warning');

    } catch (error) {
      this.log(`  ✗ Error setting Rarity: ${error}`, 'warning');
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  private async resetPositionFilter(): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log('  Looking for Position reset button...');

      // Position filter is the 4th inline-list-select (index 3)
      // It has class "has-selection" when a position is selected
      // The reset button is: button.flat.ut-search-filter-control--row-button

      const allFilters = page.locator('.inline-list-select.ut-search-filter-control');
      const filterCount = await allFilters.count();
      this.log(`  Found ${filterCount} inline filters`);

      // Position is typically at index 3 (4th dropdown)
      // Or find one with "has-selection" class that has position image
      for (let i = 0; i < filterCount; i++) {
        const filter = allFilters.nth(i);
        const classList = await filter.getAttribute('class') || '';
        const html = await filter.innerHTML().catch(() => '');

        // Position filter has images with /positions/ or /mobile/positions/
        if (html.includes('/positions/') || html.includes('GK') || html.includes('ST') || html.includes('CM')) {
          this.log(`  Found Position filter at index ${i}`);

          // Find and click the reset button inside this filter
          const resetBtn = filter.locator('button.flat.ut-search-filter-control--row-button, button.flat').first();

          if (await resetBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await resetBtn.click({ force: true });
            this.log('  ✓ Reset Position filter', 'success');
            return;
          }
        }
      }

      // Fallback: try clicking any visible reset button in filters
      const resetBtns = page.locator('.ut-search-filter-control--row button.flat, button.ut-search-filter-control--row-button');
      const btnCount = await resetBtns.count();
      this.log(`  Found ${btnCount} reset buttons`);

      for (let i = 0; i < btnCount; i++) {
        const btn = resetBtns.nth(i);
        if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
          await btn.click({ force: true });
          this.log('  ✓ Clicked reset button', 'success');
          return;
        }
      }

      this.log('  ✗ Could not find Position reset button', 'warning');

    } catch (error) {
      this.log(`  ✗ Error resetting Position: ${error}`, 'warning');
    }
  }

  /**
   * Click Search button
   */
  private async clickSearch(): Promise<boolean> {
    const page = this.browserManager.getPage();

    try {
      const searchBtn = page.locator('button:has-text("Search"), .btn-standard:has-text("Search"), .call-to-action:has-text("Search")').first();

      if (await searchBtn.isVisible({ timeout: 2000 })) {
        await searchBtn.click();
        this.log('Clicked Search', 'success');
        await this.browserManager.sleep(2000);
        return true;
      }

      this.log('Search button not found', 'error');
      return false;

    } catch (error) {
      this.log(`Error clicking Search: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Select first found card and add it
   * The add button has class: ut-image-button-control btnAction on add
   */
  private async selectFirstCardAndAdd(): Promise<boolean> {
    const page = this.browserManager.getPage();

    try {
      this.log('Waiting for search results...');
      await this.browserManager.sleep(1500);

      // Find first player card in results list
      const playerCardSelectors = [
        '.ut-pinned-list .listFUTItem',
        '.listFUTItem',
        '.ut-item-view',
        '.player.item:not(.empty)',
      ];

      let cardFound = false;
      for (const selector of playerCardSelectors) {
        const card = page.locator(selector).first();
        if (await card.isVisible({ timeout: 1000 }).catch(() => false)) {
          this.log(`Found card with selector: ${selector}`);
          cardFound = true;
          break;
        }
      }

      if (!cardFound) {
        this.log('✗ No cards found in search results', 'error');
        return false;
      }

      // Click the ADD button - class="ut-image-button-control btnAction on add"
      const addButtonSelectors = [
        'button.ut-image-button-control.btnAction.add',
        'button.btnAction.add',
        '.ut-image-button-control.add',
        'button[class*="btnAction"][class*="add"]',
        'button.add',
      ];

      for (const selector of addButtonSelectors) {
        const addBtn = page.locator(selector).first();
        if (await addBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await addBtn.click({ force: true });
          this.log(`✓ Clicked ADD button (${selector})`, 'success');
          await this.browserManager.sleep(1500);
          return true;
        }
      }

      // Try finding by the + icon or any button in the results
      const genericAddBtn = page.locator('.listFUTItem button, .ut-button-group button').first();
      if (await genericAddBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await genericAddBtn.click({ force: true });
        this.log('✓ Clicked generic add button', 'success');
        await this.browserManager.sleep(1500);
        return true;
      }

      this.log('✗ Could not find ADD button', 'error');
      return false;

    } catch (error) {
      this.log(`✗ Error selecting card: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Add a single card to the squad
   */
  private async addSingleCard(requirement: CardRequirement): Promise<boolean> {
    // Step 1: Find and click empty card slot
    const slotFound = await this.findEmptyCardSlot();
    if (!slotFound) {
      this.log('No empty slot found', 'error');
      return false;
    }

    // Step 2: Click "Add Player"
    const addPlayerClicked = await this.clickAddPlayer();
    if (!addPlayerClicked) {
      return false;
    }

    // Step 3: Apply filters
    await this.applyFilters(requirement);

    // Step 4: Click Search
    const searchClicked = await this.clickSearch();
    if (!searchClicked) {
      return false;
    }

    // Step 5: Select first card and add
    const cardAdded = await this.selectFirstCardAndAdd();
    if (!cardAdded) {
      return false;
    }

    return true;
  }

  /**
   * Click Exchange Players button
   */
  private async clickExchangePlayers(): Promise<boolean> {
    const page = this.browserManager.getPage();

    try {
      const exchangeBtn = page.locator('button:has-text("Exchange Players"), button:has-text("Обменять")').first();

      if (await exchangeBtn.isVisible({ timeout: 3000 })) {
        // Check if button is enabled
        const isDisabled = await exchangeBtn.isDisabled();
        if (isDisabled) {
          this.log('Exchange Players button is disabled', 'error');
          return false;
        }

        await exchangeBtn.click();
        this.log('Clicked Exchange Players', 'success');
        await this.browserManager.sleep(2000);

        // Handle confirmation dialog if present
        const confirmBtn = page.locator('button:has-text("Yes"), button:has-text("OK"), button:has-text("Confirm"), button:has-text("Да")').first();
        if (await confirmBtn.isVisible({ timeout: 2000 })) {
          await confirmBtn.click();
          this.log('Confirmed exchange', 'success');
          await this.browserManager.sleep(2000);
        }

        return true;
      }

      this.log('Exchange Players button not found', 'error');
      return false;

    } catch (error) {
      this.log(`Error clicking Exchange Players: ${error}`, 'error');
      return false;
    }
  }
}
