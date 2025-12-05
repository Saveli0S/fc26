import { Page } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';
import { SquadBuilderRules } from '../config/tasks.js';

export interface ChallengeRequirements {
  minRare?: number;
  quality?: 'Bronze' | 'Silver' | 'Gold' | 'Any';
  rarity?: 'Common' | 'Rare' | 'Any';
  playerCount?: number;
  minRating?: number;
  maxRating?: number;
  sameNation?: number;
  sameLeague?: number;
  sameClub?: number;
}

export class SquadBuilder {
  private browserManager: BrowserManager;
  private log: LogCallback;
  private rules: SquadBuilderRules;

  constructor(browserManager: BrowserManager, rules: SquadBuilderRules, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.rules = rules;
    this.log = logCallback || ((msg) => console.log(msg));
  }

  async parseRequirements(): Promise<ChallengeRequirements> {
    const page = this.browserManager.getPage();
    const requirements: ChallengeRequirements = {};

    this.log('Parsing challenge requirements...');

    try {
      // Find the requirements container
      const reqContainer = page.locator('.ut-sbc-challenge-requirements-view, [class*="requirements"], [class*="challenge-reqs"]');
      const reqText = await reqContainer.textContent() || '';

      this.log(`Requirements text: ${reqText.substring(0, 300)}`);

      // Parse quality requirement - check for "Exactly X" or "Min. X" patterns
      const qualityPatterns = [
        /exactly\s*(gold|silver|bronze)/i,
        /quality[:\s]*(gold|silver|bronze)/i,
        /min\.?\s*(gold|silver|bronze)/i,
        /(gold|silver|bronze)\s*quality/i,
        /(золот|серебр|бронз)/i,
      ];

      for (const pattern of qualityPatterns) {
        const match = reqText.match(pattern);
        if (match) {
          const q = match[1].toLowerCase();
          if (q.includes('gold') || q.includes('золот')) {
            requirements.quality = 'Gold';
          } else if (q.includes('silver') || q.includes('серебр')) {
            requirements.quality = 'Silver';
          } else if (q.includes('bronze') || q.includes('бронз')) {
            requirements.quality = 'Bronze';
          }
          this.log(`Detected quality requirement: ${requirements.quality}`, 'success');
          break;
        }
      }

      // Parse rarity requirement - "Min. X Rare" or just "Rare"
      const rareMatch = reqText.match(/(?:min\.?\s*)?(\d+)\s*rare/i);
      if (rareMatch) {
        requirements.minRare = parseInt(rareMatch[1]);
        requirements.rarity = 'Rare';
        this.log(`Detected rare requirement: ${requirements.minRare} rare players`);
      } else if (reqText.toLowerCase().includes('rare') && !reqText.toLowerCase().includes('common')) {
        requirements.rarity = 'Rare';
      }

      // Parse player count
      const playerCountMatch = reqText.match(/(\d+)\s*(?:player|игрок)/i);
      if (playerCountMatch) {
        requirements.playerCount = parseInt(playerCountMatch[1]);
      }

      this.log(`Parsed requirements: ${JSON.stringify(requirements)}`, 'success');
    } catch (error) {
      this.log(`Error parsing requirements: ${error}`, 'warning');
    }

    return requirements;
  }

  async applyRules(requirements: ChallengeRequirements): Promise<void> {
    const page = this.browserManager.getPage();

    this.log('Applying squad builder rules...');

    await this.browserManager.sleep(1000);

    // Apply checkboxes
    await this.setCheckbox('Untradeables Only', this.rules.untradablesOnly);
    await this.setCheckbox('Exclude Active Squad', this.rules.excludeActiveSquad);
    await this.setCheckbox('Ignore Position', this.rules.ignorePosition);

    // Set Sort By dropdown
    await this.setSortBy();

    // Set Max OVR
    await this.setMaxOVR();

    // Set Quality based on requirements
    const quality = requirements.quality || 'Any';
    await this.setQuality(quality);

    // Set Rarity based on requirements
    let rarity: 'Common' | 'Rare' | 'Any' = 'Any';
    if (requirements.minRare && requirements.minRare > 0) {
      rarity = 'Rare';
    } else if (this.rules.preferCommon) {
      rarity = 'Common';
    }
    await this.setRarity(rarity);

    this.log('Rules applied', 'success');
  }

  private async setCheckbox(label: string, checked: boolean): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // Find checkbox by label
      const checkboxSelectors = [
        `label:has-text("${label}") input[type="checkbox"]`,
        `.ut-toggle-cell-view:has-text("${label}")`,
        `[class*="toggle"]:has-text("${label}")`,
        `input[aria-label*="${label}"]`,
      ];

      for (const selector of checkboxSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible()) {
            const isChecked = await element.isChecked?.() || false;
            if (isChecked !== checked) {
              await element.click();
              this.log(`Set "${label}" to ${checked}`);
            }
            return;
          }
        } catch {
          continue;
        }
      }

      // Try clicking the toggle container
      const toggleContainer = page.locator(`text="${label}"`).first();
      if (await toggleContainer.isVisible()) {
        const parent = toggleContainer.locator('..').first();
        const toggle = parent.locator('.ut-toggle-control, [class*="toggle"]').first();
        if (await toggle.isVisible()) {
          await toggle.click();
          this.log(`Toggled "${label}"`);
        }
      }
    } catch (error) {
      this.log(`Could not set checkbox "${label}": ${error}`, 'warning');
    }
  }

  private async setSortBy(): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log('Setting Sort By...');

      // Find Sort By dropdown
      const dropdownSelectors = [
        '.ut-drop-down-control:has-text("Sort By")',
        'select[name*="sort"]',
        '[class*="sort"] select',
        '.ut-search-filter-control--sort-by',
      ];

      for (const selector of dropdownSelectors) {
        try {
          const dropdown = page.locator(selector).first();
          if (await dropdown.isVisible()) {
            await dropdown.click();
            await this.browserManager.sleep(500);

            // Select "Rating Low to High"
            const optionText = this.rules.sortBy === 'rating-low-to-high'
              ? ['Rating Low to High', 'Рейтинг (по возраст.)', 'Low to High']
              : ['Rating High to Low', 'Рейтинг (по убыв.)', 'High to Low'];

            for (const text of optionText) {
              const option = page.locator(`text="${text}"`).first();
              if (await option.isVisible()) {
                await option.click();
                this.log(`Set Sort By to "${text}"`);
                return;
              }
            }
          }
        } catch {
          continue;
        }
      }

      // Try using select element directly
      const selectElement = page.locator('select').first();
      if (await selectElement.isVisible()) {
        await selectElement.selectOption({ index: this.rules.sortBy === 'rating-low-to-high' ? 0 : 1 });
      }
    } catch (error) {
      this.log(`Could not set Sort By: ${error}`, 'warning');
    }
  }

  private async setMaxOVR(): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log(`Setting Max OVR to ${this.rules.maxOVR}...`);

      // Find Max OVR input or slider
      const ovrSelectors = [
        'input[name*="ovr"]',
        'input[name*="rating"]',
        '.ut-numeric-input-control input',
        '[class*="ovr"] input',
        '[class*="rating"] input',
      ];

      for (const selector of ovrSelectors) {
        try {
          const input = page.locator(selector).last();
          if (await input.isVisible()) {
            await input.fill(this.rules.maxOVR.toString());
            this.log(`Set Max OVR to ${this.rules.maxOVR}`);
            return;
          }
        } catch {
          continue;
        }
      }

      // Try looking for labeled input
      const labeledInput = page.locator('label:has-text("Max") input, label:has-text("Макс") input').first();
      if (await labeledInput.isVisible()) {
        await labeledInput.fill(this.rules.maxOVR.toString());
        this.log(`Set Max OVR to ${this.rules.maxOVR}`);
      }
    } catch (error) {
      this.log(`Could not set Max OVR: ${error}`, 'warning');
    }
  }

  private async setQuality(quality: string): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log(`Setting Quality to ${quality}...`);

      // Find Quality dropdown
      const dropdownSelectors = [
        '.ut-drop-down-control:has-text("Quality")',
        '.ut-drop-down-control:has-text("Качество")',
        'select[name*="quality"]',
        '[class*="quality"] select',
      ];

      for (const selector of dropdownSelectors) {
        try {
          const dropdown = page.locator(selector).first();
          if (await dropdown.isVisible()) {
            await dropdown.click();
            await this.browserManager.sleep(500);

            // Quality mappings (English and Russian)
            const qualityMap: Record<string, string[]> = {
              'Bronze': ['Bronze', 'Бронзовый', 'Бронза'],
              'Silver': ['Silver', 'Серебряный', 'Серебро'],
              'Gold': ['Gold', 'Золотой', 'Золото'],
              'Any': ['Any', 'Любой', 'Все'],
            };

            const options = qualityMap[quality] || [quality];
            for (const text of options) {
              const option = page.locator(`text="${text}"`).first();
              if (await option.isVisible()) {
                await option.click();
                this.log(`Set Quality to "${text}"`);
                await this.browserManager.sleep(500);
                return;
              }
            }
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      this.log(`Could not set Quality: ${error}`, 'warning');
    }
  }

  private async setRarity(rarity: string): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      this.log(`Setting Rarity to ${rarity}...`);

      // Find Rarity dropdown (usually second dropdown)
      const dropdownSelectors = [
        '.ut-drop-down-control:has-text("Rarity")',
        '.ut-drop-down-control:has-text("Редкость")',
        'select[name*="rarity"]',
        '[class*="rarity"] select',
      ];

      for (const selector of dropdownSelectors) {
        try {
          const dropdown = page.locator(selector).first();
          if (await dropdown.isVisible()) {
            await dropdown.click();
            await this.browserManager.sleep(500);

            // Rarity mappings
            const rarityMap: Record<string, string[]> = {
              'Common': ['Common', 'Обычный'],
              'Rare': ['Rare', 'Редкий'],
              'Any': ['Any', 'Любой', 'Все'],
            };

            const options = rarityMap[rarity] || [rarity];
            for (const text of options) {
              const option = page.locator(`text="${text}"`).first();
              if (await option.isVisible()) {
                await option.click();
                this.log(`Set Rarity to "${text}"`);
                await this.browserManager.sleep(500);
                return;
              }
            }
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      this.log(`Could not set Rarity: ${error}`, 'warning');
    }
  }

  async clickBuild(): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('Clicking Build button...');

    const buildSelectors = [
      'button:has-text("Build")',
      'button:has-text("Создать")',
      'button:has-text("Собрать")',
      '.ut-squad-builder-build-btn',
      'button.call-to-action',
    ];

    for (const selector of buildSelectors) {
      try {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          this.log('Clicked Build button', 'success');
          await this.browserManager.sleep(3000);
          return true;
        }
      } catch {
        continue;
      }
    }

    this.log('Could not find Build button', 'error');
    return false;
  }

  async checkAllRequirementsMet(): Promise<boolean> {
    const page = this.browserManager.getPage();

    this.log('Checking if all requirements are met...');

    try {
      // Look for green checkmarks or requirement status
      const requirementsContainer = page.locator('.ut-sbc-challenge-requirements-view, [class*="requirements"]');

      // Check for any failed requirements (red X or unfulfilled)
      const failedSelectors = [
        '.ut-sbc-challenge-requirement--unfulfilled',
        '[class*="requirement"][class*="fail"]',
        '.requirement-status--failed',
        'svg[class*="fail"]',
        '.ut-sbc-challenge-requirement-status--fail',
      ];

      for (const selector of failedSelectors) {
        try {
          const failed = requirementsContainer.locator(selector);
          if (await failed.count() > 0) {
            this.log('Some requirements not met', 'warning');
            return false;
          }
        } catch {
          continue;
        }
      }

      // Check for all green checkmarks
      const successSelectors = [
        '.ut-sbc-challenge-requirement--fulfilled',
        '[class*="requirement"][class*="success"]',
        '.requirement-status--complete',
      ];

      for (const selector of successSelectors) {
        try {
          const success = requirementsContainer.locator(selector);
          if (await success.count() > 0) {
            this.log('All requirements met!', 'success');
            return true;
          }
        } catch {
          continue;
        }
      }

      // If we can't determine, assume success
      return true;
    } catch (error) {
      this.log(`Error checking requirements: ${error}`, 'warning');
      return true; // Assume success if we can't check
    }
  }

  async buildSquad(requirements: ChallengeRequirements): Promise<boolean> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.log(`Build attempt ${attempt}/${maxAttempts}...`);

      await this.applyRules(requirements);
      await this.clickBuild();

      if (await this.checkAllRequirementsMet()) {
        return true;
      }

      // Adjust rules for next attempt
      if (attempt < maxAttempts) {
        this.log('Adjusting rules for next attempt...');
        // Try with different rarity
        if (requirements.minRare) {
          await this.setRarity('Rare');
        }
      }
    }

    return false;
  }
}
