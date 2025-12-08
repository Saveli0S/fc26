import { Page } from 'playwright';
import { BrowserManager, LogCallback } from './browser.js';

export class PackOpener {
  private browserManager: BrowserManager;
  private log: LogCallback;
  private shouldStop = false;

  constructor(browserManager: BrowserManager, logCallback?: LogCallback) {
    this.browserManager = browserManager;
    this.log = logCallback || (() => {});
  }

  /**
   * Stop the pack opening process
   */
  stop() {
    this.shouldStop = true;
    this.log('🛑 Stopping pack opener...', 'warning');
  }

  /**
   * Main entry point - opens all untradeable packs
   */
  async openAllPacks(): Promise<{ opened: number; cardsStored: number }> {
    this.shouldStop = false;
    let packsOpened = 0;
    let totalCardsStored = 0;

    try {
      this.log('🎁📦 Starting Pack Opener...', 'info');
      this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');

      // Navigate to Store
      await this.navigateToStore();
      if (this.shouldStop) throw new Error('Stopped by user');

      // Check for unassigned items in Store (initial check)
      await this.checkAndHandleUnassignedItemsInStore();
      if (this.shouldStop) throw new Error('Stopped by user');

      // After handling unassigned items (or if none found), continue to Packs
      // Click on Packs card
      await this.clickPacksCard();
      if (this.shouldStop) throw new Error('Stopped by user');

      // Check if My Packs tab exists
      const hasMyPacks = await this.checkMyPacksTab();
      if (!hasMyPacks) {
        this.log('❌ No "My Packs" tab found - stopping pack opener', 'error');
        throw new Error('No "My Packs" tab found');
      }

      // Navigate to My Packs
      await this.navigateToMyPacks();
      if (this.shouldStop) throw new Error('Stopped by user');

      // Process all packs
      this.log('🔄 Starting to process packs...', 'info');
      while (!this.shouldStop) {
        const packOpened = await this.processNextPack();
        if (!packOpened) {
          break; // No more packs to open
        }
        packsOpened++;
        this.log(`✅ Successfully opened and stored pack ${packsOpened}`, 'success');

        // Check stop signal between packs
        if (this.shouldStop) {
          break;
        }

        // Small delay between packs
        await this.delay(1500);
      }

      this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info');
      if (this.shouldStop) {
        this.log(`⏹ Pack opening stopped by user. Opened ${packsOpened} pack(s)`, 'warning');
      } else {
        this.log(`✅ Pack opening complete! Opened ${packsOpened} pack(s)`, 'success');

        // Suggest syncing inventory to update card counts
        if (packsOpened > 0) {
          this.log(`💡 Recommendation: Use "Sync Cards" to update inventory with new cards from packs`, 'info');
        }
      }
      return { opened: packsOpened, cardsStored: totalCardsStored };

    } catch (error) {
      if (error instanceof Error && error.message === 'Stopped by user') {
        this.log(`⏹ Pack opening stopped by user. Opened ${packsOpened} pack(s)`, 'warning');
        return { opened: packsOpened, cardsStored: totalCardsStored };
      }
      this.log(`❌ Pack opener error: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Navigate to Store section
   */
  private async navigateToStore(): Promise<void> {
    const page = this.browserManager.getPage();
    this.log('🏪 Navigating to Store...', 'info');

    // Try multiple selectors for Store button
    let storeButton = page.locator('button.ut-tab-bar-item').filter({ hasText: /store/i });
    let count = await storeButton.count();

    if (count === 0) {
      // Try alternative selector
      storeButton = page.locator('button').filter({ hasText: /store/i });
      count = await storeButton.count();
    }

    if (count === 0) {
      throw new Error('Store button not found in navigation');
    }

    await storeButton.first().click();
    await this.delay(2500); // Wait for store to load
    this.log('✅ Navigated to Store', 'success');
  }

  /**
   * Click on Packs card in Store
   */
  private async clickPacksCard(): Promise<void> {
    if (this.shouldStop) return;

    const page = this.browserManager.getPage();
    this.log('📦 Clicking on Packs tile...', 'info');

    // Wait for Store to fully load
    await this.delay(1500);
    if (this.shouldStop) return;

    // Try multiple selectors for Packs tile
    try {
      // Try 1: Look for packs-tile class (most specific)
      const packsTile = page.locator('.packs-tile').first();
      await packsTile.waitFor({ state: 'visible', timeout: 4000 });
      if (this.shouldStop) return;
      await packsTile.click();
      this.log('✅ Clicked Packs tile', 'success');
    } catch (error) {
      if (this.shouldStop) return;
      try {
        // Try 2: Look for storehub-tile with Packs header
        const packsTile = page.locator('.storehub-tile').filter({ hasText: /packs/i }).first();
        await packsTile.waitFor({ state: 'visible', timeout: 2000 });
        if (this.shouldStop) return;
        await packsTile.click();
        this.log('✅ Clicked Packs tile (alternative selector)', 'success');
      } catch {
        throw new Error(`Packs tile not found in Store. Original error: ${error}`);
      }
    }

    // Wait for packs section to load
    await this.delay(2500);
    if (this.shouldStop) return;
    this.log('✅ Packs section loaded', 'success');
  }

  /**
   * Check if My Packs tab exists
   */
  private async checkMyPacksTab(): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Look for tab navigation with "My Packs"
    const myPacksTab = page.locator('.ut-navigation-container-view button, .ut-tab-bar-item').filter({ hasText: /my packs/i });

    const count = await myPacksTab.count();
    return count > 0;
  }

  /**
   * Navigate to My Packs tab
   */
  private async navigateToMyPacks(): Promise<void> {
    if (this.shouldStop) return;

    const page = this.browserManager.getPage();
    this.log('📦 Navigating to My Packs...', 'info');

    const myPacksTab = page.locator('.ut-navigation-container-view button, .ut-tab-bar-item').filter({ hasText: /my packs/i });
    await myPacksTab.first().click();
    await this.delay(1500);
    if (this.shouldStop) return;
    this.log('✅ Opened My Packs tab', 'success');
  }

  /**
   * Process next available untradeable pack
   * Returns true if a pack was opened, false if no packs available
   */
  private async processNextPack(): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Wait a moment for packs to load
    await this.delay(1000);

    // Find all pack cards
    const packCards = page.locator('.ut-store-pack-details-view');
    const packCount = await packCards.count();

    if (packCount === 0) {
      this.log('ℹ️ No more packs available', 'info');
      return false;
    }

    this.log(`📋 Found ${packCount} pack(s), checking for untradeable packs...`, 'info');

    // Iterate through packs to find an untradeable one
    for (let i = 0; i < packCount; i++) {
      if (this.shouldStop) {
        this.log('🛑 Pack processing stopped by user', 'warning');
        return false;
      }

      const pack = packCards.nth(i);

      // Check if pack is tradeable (has green icon) - we should NOT open tradeable packs
      const isTradeable = await this.isPackTradeable(pack);

      if (isTradeable) {
        continue; // Skip tradeable packs (already logged in isPackTradeable)
      }

      // Found an untradeable pack - open it
      this.log(`🎁 Opening untradeable pack ${i + 1}/${packCount}...`, 'info');

      // Click on the pack to open details
      await pack.click();
      await this.delay(1500);
      if (this.shouldStop) return false;

      // Click Open button
      const openButton = page.locator('button.call-to-action, button').filter({ hasText: /open/i });
      const openExists = await openButton.count() > 0;

      if (!openExists) {
        this.log('⚠️ Open button not found - pack might already be open or not ready', 'warning');
        await this.navigateBack();
        continue;
      }

      await openButton.first().click();
      this.log('⏳ Waiting for pack animation (4 seconds)...', 'info');

      // Wait for pack animation (4 seconds as specified)
      await this.delay(4000);
      if (this.shouldStop) return false;

      // Check for unassigned items in Store and handle them
      // This method will navigate back to My Packs when done
      await this.checkAndHandleUnassignedItems();
      if (this.shouldStop) return false;

      await this.delay(1000);

      return true; // Successfully processed a pack
    }

    this.log('ℹ️ No untradeable packs found (all packs are tradeable)', 'info');
    return false;
  }

  /**
   * Check if a pack is tradeable
   * Tradeable packs have the green icon (is-tradeable class)
   * We should NOT open tradeable packs
   */
  private async isPackTradeable(packElement: any): Promise<boolean> {
    try {
      // Check if the pack element has is-tradeable class
      const isTradeable = await packElement.evaluate((el: Element) => {
        // Check the element itself
        if (el.classList.contains('is-tradeable')) {
          return true;
        }

        // Check if any child element has is-tradeable class
        const tradeableChild = el.querySelector('.is-tradeable');
        if (tradeableChild) {
          return true;
        }

        // Check the title span for ::after content (green icon indicator)
        const titleSpan = el.querySelector('.ut-store-pack-details-view--title span');
        if (titleSpan) {
          const parent = el.closest('.ut-store-pack-details-view');
          if (parent && parent.classList.contains('is-tradeable')) {
            return true;
          }
        }

        return false;
      });

      if (isTradeable) {
        this.log(`🟢 Pack is tradeable - skipping`, 'info');
      }

      return isTradeable;
    } catch (error) {
      this.log(`⚠️ Error checking pack tradeable status: ${error}`, 'warning');
      // If we can't determine, assume it's untradeable to be safe
      return false;
    }
  }

  /**
   * Check for unassigned items in Store (assumes we're already in Store)
   */
  private async checkAndHandleUnassignedItemsInStore(): Promise<void> {
    if (this.shouldStop) return;

    const page = this.browserManager.getPage();
    this.log('🔍 Checking for unassigned items in Store...', 'info');

    // Wait a bit for Store to fully load
    await this.delay(1500);
    if (this.shouldStop) return;

    // Look for unassigned items tile using exact class from DOM
    const unassignedTile = page.locator('div.ut-unassigned-tile-view.tile');

    // Wait for it to potentially appear (short timeout to be interruptible)
    try {
      await unassignedTile.first().waitFor({ state: 'attached', timeout: 2000 });
      if (this.shouldStop) return;
      this.log('📦 Found unassigned items tile', 'info');
    } catch {
      this.log('✅ No unassigned items tile found', 'info');
      // If this is initial check, continue to Packs
      return;
    }

    if (this.shouldStop) return;

    // Check if tile is actually visible (not display: none)
    const isVisible = await unassignedTile.first().isVisible().catch(() => false);

    if (!isVisible) {
      this.log('✅ Unassigned items tile is hidden (no items)', 'info');
      return;
    }

    if (this.shouldStop) return;

    // Click on the unassigned items tile
    this.log(`🎯 Clicking unassigned items tile...`, 'info');
    await unassignedTile.first().click();
    await this.delay(2000);
    if (this.shouldStop) return;

    // Handle the unassigned items (store them)
    await this.handleUnassignedItemsPage();
  }

  /**
   * Check for unassigned items after opening a pack (navigates to Store first)
   */
  private async checkAndHandleUnassignedItems(): Promise<void> {
    if (this.shouldStop) return;

    // Navigate to Store
    await this.navigateToStore();
    if (this.shouldStop) return;

    // Check for unassigned items
    await this.checkAndHandleUnassignedItemsInStore();
    if (this.shouldStop) return;

    // Navigate back to My Packs
    await this.returnToMyPacks();
  }

  /**
   * Handle items on the unassigned items page
   */
  private async handleUnassignedItemsPage(): Promise<void> {
    if (this.shouldStop) return;

    const page = this.browserManager.getPage();

    this.log('🎴 Handling unassigned items page...', 'info');

    // Wait for page to load
    await this.delay(1500);
    if (this.shouldStop) return;

    // Check for duplicates section
    const hasDuplicates = await this.checkForDuplicates();
    if (this.shouldStop) return;

    if (hasDuplicates) {
      this.log('🔄 Detected duplicates in unassigned items - handling separately', 'info');

      // Handle non-duplicates first (if any)
      const hasRegularItems = await this.checkForRegularItems();
      if (this.shouldStop) return;

      if (hasRegularItems) {
        await this.storeAllInClub(true);
        if (this.shouldStop) return;
        await this.delay(2000);
        if (this.shouldStop) return;
      }

      // Handle duplicates - send to SBC storage
      await this.sendToSBCStorage();
      if (this.shouldStop) return;
    } else {
      // No duplicates - just store all in club
      await this.storeAllInClub(true);
      if (this.shouldStop) return;
    }

    await this.delay(2000);
    if (this.shouldStop) return;
    this.log('✅ Unassigned items handled', 'success');

    // Navigate back to Store main page
    await this.navigateBack();
    await this.delay(1500);
  }

  /**
   * Check if there are regular (non-duplicate) items
   */
  private async checkForRegularItems(): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Look for Items section (not Untradeable Duplicates)
    const itemsHeader = page.locator('h2, .title').filter({ hasText: /^items$/i });
    const count = await itemsHeader.count();

    return count > 0;
  }

  /**
   * Navigate from Store back to My Packs section
   */
  private async returnToMyPacks(): Promise<void> {
    if (this.shouldStop) return;

    this.log('↩️ Returning to My Packs...', 'info');

    // Click on Packs card to return to packs section
    await this.clickPacksCard();
    if (this.shouldStop) return;

    await this.delay(500);
    if (this.shouldStop) return;

    // Navigate to My Packs tab
    await this.navigateToMyPacks();
    if (this.shouldStop) return;

    this.log('✅ Back in My Packs', 'success');
  }

  /**
   * Check if there are duplicate cards
   */
  private async checkForDuplicates(): Promise<boolean> {
    const page = this.browserManager.getPage();

    // Look for "Untradeable Duplicates" header
    const duplicatesHeader = page.locator('h2, .title').filter({ hasText: /untradeable duplicates/i });
    const count = await duplicatesHeader.count();

    return count > 0;
  }

  /**
   * Store all items in club (click ellipsis menu and select Store All in Club)
   */
  private async storeAllInClub(isNonDuplicates: boolean): Promise<void> {
    if (this.shouldStop) return;

    const page = this.browserManager.getPage();

    // Find the ellipsis button (three dots menu)
    const allEllipsisButtons = page.locator('button.ut-image-button-control.ellipsis-btn');
    const buttonCount = await allEllipsisButtons.count();

    if (buttonCount === 0) {
      this.log(`⚠️ No ellipsis menu button found`, 'warning');
      return;
    }

    if (this.shouldStop) return;

    // Select the appropriate button
    const ellipsisButton = isNonDuplicates ? allEllipsisButtons.first() : allEllipsisButtons.last();

    // Click ellipsis menu
    this.log(`🔧 Opening ${isNonDuplicates ? 'items' : 'duplicates'} menu...`, 'info');
    await ellipsisButton.click();
    await this.delay(800);
    if (this.shouldStop) return;

    // Wait for popup to appear
    const popup = page.locator('.ut-bulk-action-popup-view');
    await popup.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {
      this.log('⚠️ Popup did not appear', 'warning');
    });

    if (this.shouldStop) return;

    // Find and click "Store All in Club" button
    const storeButton = popup.locator('.btn-text').filter({ hasText: /store all in club/i });
    const exists = await storeButton.count() > 0;

    if (!exists) {
      this.log(`⚠️ "Store All in Club" button not found in popup`, 'warning');
      await page.keyboard.press('Escape');
      return;
    }

    if (this.shouldStop) return;

    this.log(`✅ Clicking "Store All in Club"`, 'success');
    await storeButton.first().click();
    await this.delay(1500);
  }

  /**
   * Send duplicate items to SBC storage
   */
  private async sendToSBCStorage(): Promise<void> {
    if (this.shouldStop) return;

    const page = this.browserManager.getPage();

    // Find the ellipsis button for duplicates (last one)
    const allEllipsisButtons = page.locator('button.ut-image-button-control.ellipsis-btn');
    const ellipsisButton = allEllipsisButtons.last();

    // Click ellipsis menu (three dots)
    this.log(`🔧 Clicking ellipsis button for duplicates...`, 'info');
    await ellipsisButton.click();
    await this.delay(800);
    if (this.shouldStop) return;

    // Wait for popup to appear
    const popup = page.locator('.ut-bulk-action-popup-view');
    await popup.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {
      this.log('⚠️ Popup did not appear', 'warning');
    });

    if (this.shouldStop) return;

    // Find and click "Send all items to SBC Storage" button
    try {
      const sbcButton = popup.locator('.btn-text').filter({ hasText: /send all items to sbc storage/i });
      await sbcButton.first().click({ timeout: 2000 });
      this.log(`✅ Clicked "Send all items to SBC Storage"`, 'success');
    } catch {
      // Try alternative text patterns
      try {
        const altButton = popup.locator('.btn-text').filter({ hasText: /send.*to.*sbc|sbc.*storage/i });
        await altButton.first().click({ timeout: 2000 });
        this.log(`✅ Clicked "Send to SBC Storage" (alternative)`, 'success');
      } catch {
        this.log(`⚠️ "Send all items to SBC Storage" button not found in popup`, 'warning');
        await page.keyboard.press('Escape');
        return;
      }
    }

    await this.delay(1500);
  }

  /**
   * Navigate back to pack list
   */
  private async navigateBack(): Promise<void> {
    const page = this.browserManager.getPage();

    // Look for back button with class ut-navigation-button-control
    const backButton = page.locator('button.ut-navigation-button-control');
    const exists = await backButton.count() > 0;

    if (exists) {
      await backButton.first().click();
      await this.delay(1000);
    } else {
      this.log('⚠️ Back button not found', 'warning');
    }
  }

  /**
   * Helper to delay execution with stop check
   */
  private async delay(ms: number): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100; // Check stop signal every 100ms

    while (Date.now() - startTime < ms) {
      if (this.shouldStop) {
        return; // Exit early if stop signal received
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(checkInterval, ms - (Date.now() - startTime))));
    }
  }
}
