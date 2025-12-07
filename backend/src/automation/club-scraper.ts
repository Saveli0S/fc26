import { BrowserManager, LogCallback } from './browser.js';
import { UIHelper, TIMEOUTS, DELAYS } from './ui-helpers.js';
import { inventoryService, PlayerCard, generateCardId } from '../services/inventory.js';

// ============================================================================
// Types
// ============================================================================

interface FilterCombination {
  quality: 'Bronze' | 'Silver' | 'Gold';
  rarity: 'Common' | 'Rare';
}

// ============================================================================
// Selectors
// ============================================================================

const SELECTORS = {
  // Navigation
  CLUB_TAB: [
    '.ut-tab-bar-item:has(.ut-tab-bar-item-icon--club)',
    '.ut-tab-bar-item:has-text("Club")',
    'button:has(.icon-club)',
    '[class*="club"]',
  ],
  PLAYERS_TILE: [
    '.ut-tile-transfer-market:has-text("Players")',
    '.tile:has-text("Players")',
    'div:has-text("Players"):has(.ut-tile-view)',
    '.ut-tile-view:has-text("Players")',
  ],

  // Filter controls
  SEARCH_PANEL: '.ut-player-search-control',
  SEARCH_BUTTON: [
    'button:has-text("Search")',
    'button:has-text("Поиск")',
    '.btn-standard.call-to-action:has-text("Search")',
  ],
  RESET_BUTTON: [
    'button:has-text("Reset")',
    'button:has-text("Сброс")',
    '.btn-standard:has-text("Reset")',
  ],

  // Toggle filters
  UNTRADEABLE_TOGGLE: '.ut-toggle-cell:has-text("Untradeables")',
  EXCLUDE_SQUAD_TOGGLE: '.ut-toggle-cell:has-text("Exclude Active Squad")',
  EXCLUDE_LOAN_TOGGLE: '.ut-toggle-cell:has-text("Exclude Loan")',

  // Dropdowns
  QUALITY_DROPDOWN: {
    identifiers: [
      'SearchFilters/level/any.png',
      'SearchFilters/level/bronze.png',
      'SearchFilters/level/silver.png',
      'SearchFilters/level/gold.png',
    ],
    fallbackIndex: 0,
  },
  RARITY_DROPDOWN: {
    identifiers: [
      'SearchFilters/rarity/any.png',
      'backgrounds/itemBGs/929f3299',
      'backgrounds/itemBGs/7535d322',
    ],
    fallbackIndex: 1,
  },

  // Card list
  CARD_LIST: '.ut-pinned-list',
  CARD_ITEM: '.listFUTItem',
  CARD_NAME: '.name',
  CARD_RATING: '.rating',
  CARD_POSITION: '.position',

  // Pagination
  PAGINATION: '.ut-navigation-container-view--content .pagingContainer',
  NEXT_BUTTON: [
    'button.next:not(.disabled)',
    '.pagingContainer button.next:not(.disabled)',
    'button:has-text("Next"):not(.disabled)',
  ],

  // Entity container for card details
  ENTITY_CONTAINER: '.entityContainer',
  PLAYER_ITEM: '.small.player.item',
};

// ============================================================================
// Filter Combinations
// ============================================================================

const FILTER_COMBINATIONS: FilterCombination[] = [
  { quality: 'Bronze', rarity: 'Common' },
  { quality: 'Bronze', rarity: 'Rare' },
  { quality: 'Silver', rarity: 'Common' },
  { quality: 'Silver', rarity: 'Rare' },
  { quality: 'Gold', rarity: 'Common' },
  { quality: 'Gold', rarity: 'Rare' },
];

// ============================================================================
// ClubScraper Class
// ============================================================================

export class ClubScraper {
  private browserManager: BrowserManager;
  private log: LogCallback;
  private ui: UIHelper;
  private shouldStop = false;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || ((msg) => console.log(msg));
    this.ui = new UIHelper(browserManager, this.log);
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  async syncInventory(): Promise<boolean> {
    this.log('=== Starting Inventory Sync ===', 'info');
    this.shouldStop = false;

    try {
      // Clear existing inventory and start fresh
      this.log('Clearing existing inventory...', 'info');
      inventoryService.startSync();
      this.log('Inventory cleared. Starting new sync...', 'success');

      // Navigate to Club > Players
      await this.navigateToClubPlayers();

      // Process each filter combination
      for (const filter of FILTER_COMBINATIONS) {
        if (this.shouldStop) {
          this.log('Sync stopped by user', 'warning');
          break;
        }

        await this.processFilterCombination(filter);
      }

      inventoryService.finishSync();
      const summary = inventoryService.getSummary();
      this.log(`=== Sync Complete: ${summary.total} cards found ===`, 'success');
      return true;

    } catch (error) {
      this.log(`Sync failed: ${error}`, 'error');
      inventoryService.setSyncInProgress(false);
      return false;
    }
  }

  stop(): void {
    this.shouldStop = true;
  }

  // ==========================================================================
  // Navigation
  // ==========================================================================

  private async navigateToClubPlayers(): Promise<void> {
    const page = this.browserManager.getPage();
    this.log('Navigating to Club...', 'info');

    // Click Club tab
    const clubClicked = await this.ui.tryClickSelectors(SELECTORS.CLUB_TAB, TIMEOUTS.LONG);
    if (!clubClicked) {
      throw new Error('Could not find Club tab');
    }
    await this.sleep(DELAYS.LONG);

    // Click Players tile
    this.log('Looking for Players tile...', 'info');

    // Try multiple approaches to find Players
    const playersSelectors = [
      '.ut-tile-transfer-market',
      '.tile',
      '.ut-tile-view',
    ];

    let playersClicked = false;
    for (const selector of playersSelectors) {
      if (playersClicked) break;
      const tiles = page.locator(selector);
      const count = await tiles.count();

      for (let i = 0; i < count; i++) {
        const tile = tiles.nth(i);
        const text = await tile.textContent().catch(() => '') || '';

        if (text.toLowerCase().includes('player')) {
          await tile.click();
          this.log('Clicked Players tile', 'success');
          playersClicked = true;
          break;
        }
      }
    }

    // Fallback: try clicking by text
    if (!playersClicked) {
      const playersText = page.getByText('Players', { exact: false }).first();
      if (await playersText.isVisible({ timeout: TIMEOUTS.MEDIUM }).catch(() => false)) {
        await playersText.click();
        this.log('Clicked Players (by text)', 'success');
        playersClicked = true;
      }
    }

    if (!playersClicked) {
      throw new Error('Could not find Players tile');
    }

    await this.sleep(DELAYS.EXTRA_LONG);

    // Click Search button to open filter panel
    await this.openSearchFilterPanel();
  }

  /**
   * Click the Search button to open the filter panel
   * The button is typically in the header area: .ut-list-header-action button
   */
  private async openSearchFilterPanel(): Promise<void> {
    const page = this.browserManager.getPage();
    this.log('Opening filter panel (clicking Search)...', 'info');

    const searchButtonSelectors = [
      '.ut-list-header-action button',
      'button.btn-standard.mini.primary',
      '.ut-list-header button',
      'button:has-text("Search")',
      'button:has-text("Поиск")',
    ];

    for (const selector of searchButtonSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: TIMEOUTS.SHORT })) {
          await btn.click({ force: true });
          this.log('Clicked Search button to open filters', 'success');
          await this.sleep(DELAYS.LONG);
          return;
        }
      } catch {
        continue;
      }
    }

    // Fallback: use JavaScript to click
    try {
      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('.ut-list-header-action button') as HTMLButtonElement;
        if (btn) {
          btn.click();
          return true;
        }
        const miniBtn = document.querySelector('button.btn-standard.mini.primary') as HTMLButtonElement;
        if (miniBtn) {
          miniBtn.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        this.log('Clicked Search button via JavaScript', 'success');
        await this.sleep(DELAYS.LONG);
        return;
      }
    } catch (error) {
      this.log(`JavaScript click failed: ${error}`, 'warning');
    }

    this.log('Warning: Could not find Search button to open filter panel', 'warning');
  }

  // ==========================================================================
  // Filter Processing
  // ==========================================================================

  private async processFilterCombination(filter: FilterCombination): Promise<void> {
    this.log(`Processing: ${filter.quality} ${filter.rarity}...`, 'info');

    // Apply base filters first
    await this.applyBaseFilters();

    // Apply specific quality
    this.log(`  Setting Quality = ${filter.quality}...`);
    await this.ui.setInlineDropdown(SELECTORS.QUALITY_DROPDOWN, filter.quality);
    await this.sleep(DELAYS.SHORT);

    // Apply rarity - try multiple variations since EA might display it differently
    this.log(`  Setting Rarity = ${filter.rarity}...`);
    const raritySet = await this.setRarityFilter(filter.rarity);
    if (!raritySet) {
      this.log(`  Warning: Could not set rarity filter to ${filter.rarity}`, 'warning');
    }
    await this.sleep(DELAYS.SHORT);

    // Click Search
    await this.clickSearch();
    await this.sleep(DELAYS.EXTRA_LONG);

    // Scrape all pages
    let pageNum = 1;
    let hasNextPage = true;

    while (hasNextPage && !this.shouldStop) {
      this.log(`  Scraping page ${pageNum}...`);

      const cards = await this.scrapeCurrentPage(filter);

      if (cards.length > 0) {
        inventoryService.addCards(cards);
        this.log(`    Found ${cards.length} cards on page ${pageNum}`, 'success');
      } else {
        this.log(`    No cards found on page ${pageNum}`);
      }

      hasNextPage = await this.goToNextPage();
      if (hasNextPage) {
        pageNum++;
        await this.sleep(DELAYS.LONG);
      }
    }

    this.log(`  Finished ${filter.quality} ${filter.rarity}: scraped ${pageNum} page(s)`, 'success');

    // Reset filters and reopen filter panel for next combination
    await this.clickReset();
    await this.sleep(DELAYS.MEDIUM);

    // Click Search button to reopen filter panel for next filter combination
    await this.openSearchFilterPanel();
  }

  private async applyBaseFilters(): Promise<void> {
    // Set toggles
    await this.ui.setToggle('Untradeables', true);
    await this.sleep(DELAYS.MICRO);

    await this.ui.setToggle('Exclude Active Squad', true);
    await this.sleep(DELAYS.MICRO);

    await this.ui.setToggle('Exclude Loan', true);
    await this.sleep(DELAYS.MICRO);
  }

  /**
   * Set rarity filter with fallback approaches
   * EA might display rarity as "Common", "Rare", or have different UI
   */
  private async setRarityFilter(rarity: 'Common' | 'Rare'): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Try standard inline dropdown first
    const success = await this.ui.setInlineDropdown(SELECTORS.RARITY_DROPDOWN, rarity);
    if (success) return true;

    // Fallback: try finding dropdown by clicking on rarity-related elements
    const raritySelectors = [
      `.ut-search-filter-control:has-text("Rarity")`,
      `.ut-search-filter-control--row:has-text("Rarity")`,
      `.inline-list-select:has(img[src*="rarity"])`,
    ];

    for (const selector of raritySelectors) {
      try {
        const dropdown = page.locator(selector).first();
        if (await dropdown.isVisible({ timeout: TIMEOUTS.SHORT })) {
          // Click to open
          await dropdown.click();
          await this.sleep(DELAYS.SHORT);

          // Find and click the option
          const option = page.locator(`li:has-text("${rarity}")`).first();
          if (await option.isVisible({ timeout: TIMEOUTS.SHORT })) {
            await option.click();
            this.log(`    ✓ Set Rarity = ${rarity} (fallback)`, 'success');
            await this.sleep(DELAYS.SHORT);
            return true;
          }

          // Close dropdown if option not found
          await page.keyboard.press('Escape');
        }
      } catch {
        continue;
      }
    }

    // Last resort: try by index - Common is usually index 1, Rare is usually index 2
    const dropdownIndex = rarity === 'Common' ? 1 : 2;
    try {
      const allDropdowns = page.locator('.inline-list-select.ut-search-filter-control');
      const count = await allDropdowns.count();

      // Rarity dropdown is typically the second one (after Quality)
      if (count >= 2) {
        const rarityDropdown = allDropdowns.nth(1);
        await rarityDropdown.locator('.ut-search-filter-control--row').first().click();
        await this.sleep(DELAYS.SHORT);

        const options = rarityDropdown.locator('ul.inline-list li');
        const optCount = await options.count();

        if (dropdownIndex < optCount) {
          await options.nth(dropdownIndex).click();
          this.log(`    ✓ Set Rarity = ${rarity} (by index ${dropdownIndex})`, 'success');
          return true;
        }
      }
    } catch (error) {
      this.log(`    Failed to set rarity by index: ${error}`, 'warning');
    }

    return false;
  }

  private async clickSearch(): Promise<boolean> {
    const clicked = await this.ui.tryClickSelectors(SELECTORS.SEARCH_BUTTON, TIMEOUTS.MEDIUM);
    if (clicked) {
      this.log('  Clicked Search');
    }
    return clicked;
  }

  private async clickReset(): Promise<boolean> {
    const clicked = await this.ui.tryClickSelectors(SELECTORS.RESET_BUTTON, TIMEOUTS.SHORT);
    return clicked;
  }

  // ==========================================================================
  // Card Scraping
  // ==========================================================================

  private async scrapeCurrentPage(filter: FilterCombination): Promise<PlayerCard[]> {
    const page = this.browserManager.getPage();
    const cards: PlayerCard[] = [];

    // Wait for card list to load
    await this.sleep(DELAYS.MEDIUM);

    // Find all card items
    const cardItems = page.locator(SELECTORS.CARD_ITEM);
    const count = await cardItems.count();

    this.log(`    Found ${count} card elements to scrape`);

    for (let i = 0; i < count; i++) {
      try {
        const cardItem = cardItems.nth(i);

        // Extract card data
        const nameEl = cardItem.locator(SELECTORS.CARD_NAME).first();
        const ratingEl = cardItem.locator(SELECTORS.CARD_RATING).first();
        const positionEl = cardItem.locator(SELECTORS.CARD_POSITION).first();

        const playerName = await nameEl.textContent().catch(() => '') || '';
        const ratingText = await ratingEl.textContent().catch(() => '') || '';
        const position = await positionEl.textContent().catch(() => '') || '';

        const rating = parseInt(ratingText) || 0;

        if (playerName && rating > 0) {
          const cardData: Omit<PlayerCard, 'id' | 'scrapedAt'> = {
            cardType: filter.quality,
            rarity: filter.rarity,
            playerName: playerName.trim(),
            rating,
            position: position.trim(),
          };

          cards.push({
            ...cardData,
            id: generateCardId(cardData),
            scrapedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        // Skip cards that fail to parse
        continue;
      }
    }

    return cards;
  }

  // ==========================================================================
  // Pagination
  // ==========================================================================

  private async goToNextPage(): Promise<boolean> {
    const page = this.browserManager.getPage();

    for (const selector of SELECTORS.NEXT_BUTTON) {
      const nextBtn = page.locator(selector).first();

      try {
        if (await nextBtn.isVisible({ timeout: TIMEOUTS.SHORT })) {
          const isDisabled = await nextBtn.getAttribute('class').then(c => c?.includes('disabled')).catch(() => true);

          if (!isDisabled) {
            await nextBtn.click();
            this.log('  Clicked Next page');
            return true;
          }
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private async sleep(ms: number): Promise<void> {
    await this.browserManager.sleep(ms);
  }
}
