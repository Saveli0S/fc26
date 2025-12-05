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

    this.log('=== APPLYING SQUAD BUILDER RULES ===', 'info');
    await this.browserManager.sleep(1500);

    // 1. Apply checkboxes/toggles
    this.log('Step 1: Setting toggles...', 'info');
    await this.setToggle('Untradeables Only', this.rules.untradablesOnly);
    await this.browserManager.sleep(300);
    await this.setToggle('Exclude Active Squad', this.rules.excludeActiveSquad);
    await this.browserManager.sleep(300);
    await this.setToggle('Ignore Position', this.rules.ignorePosition);
    await this.browserManager.sleep(300);

    // 2. Set Sort By dropdown - "Rating Low to High"
    this.log('Step 2: Setting Sort By to "Rating Low to High"...', 'info');
    await this.setSortByDropdown();
    await this.browserManager.sleep(500);

    // 3. Set Max OVR using the second input (type="tel" class="ut-number-input-control")
    this.log(`Step 3: Setting Max OVR to ${this.rules.maxOVR}...`, 'info');
    await this.setMaxOVRInput(this.rules.maxOVR);
    await this.browserManager.sleep(500);

    // 4. Set Quality based on requirements
    const quality = requirements.quality || 'Any';
    this.log(`Step 4: Setting Quality to "${quality}"...`, 'info');
    await this.setQualityDropdown(quality);
    await this.browserManager.sleep(500);

    // 5. Set Rarity - Rare if requirements mention rare, otherwise Common
    let rarity: string = 'Common'; // Default to Common
    if (requirements.rarity === 'Rare' || (requirements.minRare && requirements.minRare > 0)) {
      rarity = 'Rare';
    }
    this.log(`Step 5: Setting Rarity to "${rarity}"...`, 'info');
    await this.setRarityDropdown(rarity);
    await this.browserManager.sleep(500);

    this.log('=== ALL RULES APPLIED ===', 'success');

    // DEBUG PAUSE - remove after testing
    this.log('Pausing 6s for verification - check side panel...', 'warning');
    await this.browserManager.sleep(6000);
  }

  private async setToggle(label: string, shouldBeOn: boolean): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // Find toggle by looking for the label text, then find the toggle control
      const toggleRow = page.locator(`.ut-toggle-cell-view, [class*="toggle-cell"]`).filter({ hasText: label }).first();

      if (await toggleRow.isVisible({ timeout: 2000 })) {
        // Check current state by looking at the toggle's class or aria-checked
        const toggleBtn = toggleRow.locator('.ut-toggle-control, [class*="toggle-control"], [role="switch"]').first();

        if (await toggleBtn.isVisible()) {
          const isCurrentlyOn = await toggleBtn.evaluate((el) => {
            return el.classList.contains('is-checked') ||
                   el.classList.contains('toggled') ||
                   el.getAttribute('aria-checked') === 'true' ||
                   el.classList.contains('ut-toggle-control--checked');
          });

          if (isCurrentlyOn !== shouldBeOn) {
            await toggleBtn.click();
            this.log(`  ✓ Set "${label}" = ${shouldBeOn}`, 'success');
          } else {
            this.log(`  - "${label}" already ${shouldBeOn ? 'ON' : 'OFF'}`);
          }
          return;
        }
      }

      // Fallback: try clicking any element with the label
      const labelEl = page.getByText(label, { exact: false }).first();
      if (await labelEl.isVisible({ timeout: 1000 })) {
        await labelEl.click();
        this.log(`  ✓ Clicked "${label}"`, 'success');
        return;
      }

      this.log(`  ✗ Could not find toggle: "${label}"`, 'warning');
    } catch (error) {
      this.log(`  ✗ Error setting "${label}": ${error}`, 'error');
    }
  }

  private async setMaxOVRInput(value: number): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // EA Web App uses input type="tel" class="ut-number-input-control"
      // There are 2 inputs: Min OVR (first) and Max OVR (second)
      const ovrInputs = page.locator('input.ut-number-input-control[type="tel"]');
      const count = await ovrInputs.count();

      this.log(`  Found ${count} OVR inputs`);

      if (count >= 2) {
        // Second input is Max OVR
        const maxInput = ovrInputs.nth(1);
        await maxInput.click();
        await maxInput.clear();
        await maxInput.fill(value.toString());
        await maxInput.press('Tab'); // Confirm input
        this.log(`  ✓ Set Max OVR = ${value}`, 'success');
        return;
      } else if (count === 1) {
        // Only one input, assume it's Max OVR
        const input = ovrInputs.first();
        await input.click();
        await input.clear();
        await input.fill(value.toString());
        await input.press('Tab');
        this.log(`  ✓ Set OVR = ${value}`, 'success');
        return;
      }

      this.log(`  ✗ Could not find OVR inputs`, 'warning');
    } catch (error) {
      this.log(`  ✗ Error setting Max OVR: ${error}`, 'error');
    }
  }

  private async setSortByDropdown(): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // Find all dropdowns and look for Sort By
      const dropdowns = page.locator('.ut-drop-down-control');
      const count = await dropdowns.count();

      this.log(`  Found ${count} dropdowns`);

      // Sort By is usually the first dropdown
      for (let i = 0; i < count; i++) {
        const dropdown = dropdowns.nth(i);
        const text = await dropdown.textContent() || '';

        if (text.includes('Sort') || text.includes('Rating') || text.includes('Low') || text.includes('High')) {
          await dropdown.click();
          await this.browserManager.sleep(300);

          // Look for "Rating Low to High" option
          const options = ['Rating Low to High', 'Low to High', 'Рейтинг'];
          for (const optText of options) {
            const option = page.locator(`li, [class*="option"]`).filter({ hasText: optText }).first();
            if (await option.isVisible({ timeout: 500 })) {
              await option.click();
              this.log(`  ✓ Set Sort By = "${optText}"`, 'success');
              return;
            }
          }

          await page.keyboard.press('Escape');
        }
      }

      this.log(`  ✗ Could not find Sort By dropdown`, 'warning');
    } catch (error) {
      this.log(`  ✗ Error setting Sort By: ${error}`, 'error');
    }
  }

  private async setQualityDropdown(quality: string): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // Based on DOM: div.inline-list-select.ut-search-filter-control with img src containing "/level/"
      // Quality dropdown has image: images/SearchFilters/level/any.png
      const qualityDropdown = page.locator('.inline-list-select.ut-search-filter-control').filter({
        has: page.locator('img[src*="/level/"]')
      }).first();

      if (await qualityDropdown.isVisible({ timeout: 2000 })) {
        this.log(`  Found Quality dropdown (by /level/ image)`);
        await this.selectInlineListOption(qualityDropdown, quality, {
          'Bronze': ['bronze'],
          'Silver': ['silver'],
          'Gold': ['gold'],
          'Any': ['any'],
        });
        return;
      }

      // Fallback: try all inline-list-select elements
      const allSelects = page.locator('.inline-list-select.ut-search-filter-control');
      const count = await allSelects.count();
      this.log(`  Fallback: Found ${count} inline-list-select elements`);

      // Quality is typically the first one (index 0)
      if (count >= 1) {
        this.log(`  Using index 0 for Quality`);
        await this.selectInlineListOption(allSelects.nth(0), quality, {
          'Bronze': ['bronze'],
          'Silver': ['silver'],
          'Gold': ['gold'],
          'Any': ['any'],
        });
        return;
      }

      this.log(`  ✗ Could not find Quality dropdown`, 'warning');
    } catch (error) {
      this.log(`  ✗ Error setting Quality: ${error}`, 'error');
    }
  }

  private async setRarityDropdown(rarity: string): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // Based on DOM: div.inline-list-select.ut-search-filter-control with img src containing "/rarity/"
      // Rarity dropdown has image: images/SearchFilters/rarity/any.png
      const rarityDropdown = page.locator('.inline-list-select.ut-search-filter-control').filter({
        has: page.locator('img[src*="/rarity/"]')
      }).first();

      if (await rarityDropdown.isVisible({ timeout: 2000 })) {
        this.log(`  Found Rarity dropdown (by /rarity/ image)`);
        await this.selectInlineListOption(rarityDropdown, rarity, {
          'Common': ['common'],
          'Rare': ['rare'],
          'Any': ['any'],
        });
        return;
      }

      // Fallback: try all inline-list-select elements
      const allSelects = page.locator('.inline-list-select.ut-search-filter-control');
      const count = await allSelects.count();
      this.log(`  Fallback: Found ${count} inline-list-select elements`);

      // Rarity is typically the second one (index 1)
      if (count >= 2) {
        this.log(`  Using index 1 for Rarity`);
        await this.selectInlineListOption(allSelects.nth(1), rarity, {
          'Common': ['common'],
          'Rare': ['rare'],
          'Any': ['any'],
        });
        return;
      }

      this.log(`  ✗ Could not find Rarity dropdown`, 'warning');
    } catch (error) {
      this.log(`  ✗ Error setting Rarity: ${error}`, 'error');
    }
  }

  private async selectInlineListOption(dropdown: any, value: string, valueMap: Record<string, string[]>): Promise<void> {
    const page = this.browserManager.getPage();

    try {
      // Click the row or container to open dropdown (not the hidden button)
      const clickTarget = dropdown.locator('.ut-search-filter-control--row, .inline-container, div').first();
      await clickTarget.click({ force: true });
      await this.browserManager.sleep(400);

      const searchTerms = valueMap[value] || [value.toLowerCase()];

      // Index mapping: Any=0, Bronze/Common=1, Silver/Rare=2, Gold=3
      const indexMap: Record<string, number> = {
        'Any': 0,
        'Bronze': 1, 'Common': 1,
        'Silver': 2, 'Rare': 2,
        'Gold': 3,
      };

      // Get all list items quickly
      const listItems = page.locator('ul.inline-list li, ul li');
      const itemCount = await listItems.count();
      this.log(`  Found ${itemCount} options`);

      // Try by index first (fastest)
      const targetIndex = indexMap[value];
      if (targetIndex !== undefined && itemCount > targetIndex) {
        const targetItem = listItems.nth(targetIndex);
        await targetItem.click({ force: true, timeout: 2000 });
        this.log(`  ✓ Selected "${value}" (index ${targetIndex})`, 'success');
        return;
      }

      // Fallback: try by image src
      for (const term of searchTerms) {
        const optionByImg = page.locator(`li`).filter({
          has: page.locator(`img[src*="/${term}"]`)
        }).first();

        if (await optionByImg.count() > 0) {
          await optionByImg.click({ force: true, timeout: 2000 });
          this.log(`  ✓ Selected "${value}" (by image)`, 'success');
          return;
        }
      }

      // Close dropdown if nothing selected
      await page.keyboard.press('Escape');
      this.log(`  ✗ Could not find option "${value}"`, 'warning');
    } catch (error) {
      this.log(`  ✗ Error selecting option: ${error}`, 'error');
      await page.keyboard.press('Escape').catch(() => {});
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
          await this.setRarityDropdown('Rare');
        }
      }
    }

    return false;
  }
}
