import { BrowserManager, LogCallback } from './browser.js';
import { SquadBuilderRules, SquadBuilderFilters } from '../config/tasks.js';
import { UIHelper, DELAYS, TIMEOUTS } from './ui-helpers.js';

// ============================================================================
// Types
// ============================================================================

export interface UsedCardsInfo {
  cardType: 'Bronze' | 'Silver' | 'Gold' | null;
  rarity: 'Common' | 'Rare';
  count: number; // 11 for a full squad
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
  SELECTORS: {
    BUILD: [
      'button:has-text("Build")',
      'button:has-text("Создать")',
      'button:has-text("Собрать")',
      '.ut-squad-builder-build-btn',
      'button.call-to-action',
    ],
  },
  DEFAULTS: {
    QUALITY: 'Any',
    RARITY: 'Common',
  },
};

// ============================================================================
// SquadBuilder Class
// ============================================================================

/**
 * Handles Squad Builder automation for SBC tasks.
 * Uses squadBuilderRules (global) and squadBuilderFilters (per-task) from config.
 */
export class SquadBuilder {
  private browserManager: BrowserManager;
  private log: LogCallback;
  private rules: SquadBuilderRules;
  private filters: SquadBuilderFilters;
  private ui: UIHelper;

  constructor(
    browserManager: BrowserManager,
    rules: SquadBuilderRules,
    logCallback?: LogCallback,
    taskFilters?: SquadBuilderFilters
  ) {
    this.browserManager = browserManager;
    this.rules = rules;
    // Provide default values for optional filter properties
    this.filters = {
      isRarityRequired: false,
      ...taskFilters,
    };
    this.log = logCallback || ((msg) => console.log(msg));
    this.ui = new UIHelper(browserManager, this.log);

    this.log(`[SquadBuilder] Filters from config: ${JSON.stringify(this.filters)}`, 'info');
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Build squad: apply rules/filters from config, then click Build
   */
  async buildSquad(): Promise<boolean> {
    this.log('=== Building Squad ===', 'info');

    await this.applyRules();
    return await this.clickBuild();
  }

  /**
   * Apply all squad builder rules and filters from config
   */
  async applyRules(): Promise<void> {
    this.log('=== APPLYING SQUAD BUILDER RULES ===', 'info');
    this.logFilters();
    await this.sleep(DELAYS.LONG);

    // Step 1: Toggles (from global rules)
    await this.applyToggles();

    // Step 2: Sort By
    await this.applySortBy();

    // Step 3: Max OVR
    await this.applyMaxOVR();

    // Step 4: Quality (from squadBuilderFilters)
    await this.applyQuality();

    // Step 5: Rarity (from squadBuilderFilters)
    await this.applyRarity();

    this.log('=== ALL RULES APPLIED ===', 'success');

    // Brief pause before Build
    await this.sleep(DELAYS.LONG);
  }

  /**
   * Click Build button
   */
  async clickBuild(): Promise<boolean> {
    this.log('Clicking Build button...');
    const success = await this.ui.tryClickSelectors(CONFIG.SELECTORS.BUILD, TIMEOUTS.LONG);

    if (success) {
      this.log('✓ Clicked Build button', 'success');
      await this.sleep(DELAYS.EXTRA_LONG);
      return true;
    }

    this.log('✗ Could not find Build button', 'error');
    return false;
  }

  /**
   * Get info about cards that will be used based on current filters
   * Called after buildSquad() to track what was used
   */
  getUsedCardsInfo(): UsedCardsInfo {
    const quality = this.filters.quality || CONFIG.DEFAULTS.QUALITY;
    const rarity = (this.filters.rarity || CONFIG.DEFAULTS.RARITY) as 'Common' | 'Rare';

    // Quality can be 'Any' which means mixed - we can't know exact types
    const cardType = quality === 'Any' ? null : quality as 'Bronze' | 'Silver' | 'Gold';

    return {
      cardType,
      rarity,
      count: 11, // Standard SBC squad size
    };
  }

  // ==========================================================================
  // Private: Apply Settings from Config
  // ==========================================================================

  private async applyToggles(): Promise<void> {
    this.log('Step 1: Setting toggles...', 'info');

    await this.ui.setToggle('Untradeables Only', this.rules.untradablesOnly);
    await this.sleep(DELAYS.MICRO);

    await this.ui.setToggle('Exclude Active Squad', this.rules.excludeActiveSquad);
    await this.sleep(DELAYS.MICRO);

    // ignorePosition: task filter overrides global rules
    const ignorePosition = this.filters.ignorePosition ?? this.rules.ignorePosition;
    await this.ui.setToggle('Ignore Position', ignorePosition);
    await this.sleep(DELAYS.MICRO);
  }

  private async applySortBy(): Promise<void> {
    this.log('Step 2: Setting Sort By...', 'info');
    await this.ui.setStandardDropdown('Sort', 'Rating Low to High');
    await this.sleep(DELAYS.SHORT);
  }

  private async applyMaxOVR(): Promise<void> {
    this.log(`Step 3: Setting Max OVR = ${this.rules.maxOVR}...`, 'info');
    await this.ui.setOvrInput(this.rules.maxOVR, true);
    await this.sleep(DELAYS.SHORT);
  }

  private async applyQuality(): Promise<void> {
    const quality = this.filters.quality || CONFIG.DEFAULTS.QUALITY;
    this.log(`Step 4: Setting Quality = "${quality}"...`, 'info');
    await this.ui.setInlineDropdown(CONFIG.FILTERS.QUALITY, quality);
    await this.sleep(DELAYS.SHORT);
  }

  private async applyRarity(): Promise<void> {
    const rarity = this.filters.rarity || CONFIG.DEFAULTS.RARITY;
    this.log(`Step 5: Setting Rarity = "${rarity}"...`, 'info');
    await this.ui.setInlineDropdown(CONFIG.FILTERS.RARITY, rarity);
    await this.sleep(DELAYS.SHORT);
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  private logFilters(): void {
    const effective = {
      quality: this.filters.quality || CONFIG.DEFAULTS.QUALITY,
      rarity: this.filters.rarity || CONFIG.DEFAULTS.RARITY,
      ignorePosition: this.filters.ignorePosition ?? this.rules.ignorePosition,
    };
    this.log(`Effective filters: ${JSON.stringify(effective)}`, 'info');
  }

  private async sleep(ms: number): Promise<void> {
    await this.browserManager.sleep(ms);
  }
}
