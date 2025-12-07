import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PlayerCard {
  id: string;
  cardType: 'Bronze' | 'Silver' | 'Gold';
  rarity: 'Common' | 'Rare';
  playerName: string;
  rating: number;
  position: string;
  scrapedAt: string;
}

export interface CardInventory {
  lastSyncAt: string | null;
  syncInProgress: boolean;
  cards: PlayerCard[];
}

export interface InventorySummary {
  total: number;
  byType: {
    Bronze: { Common: number; Rare: number };
    Silver: { Common: number; Rare: number };
    Gold: { Common: number; Rare: number };
  };
  lastSyncAt: string | null;
}

// ============================================================================
// Storage Path
// ============================================================================

const STORAGE_BASE = process.env.STORAGE_PATH || join(process.cwd(), 'storage');
const INVENTORY_PATH = join(STORAGE_BASE, 'inventory.json');

// ============================================================================
// InventoryService
// ============================================================================

class InventoryService {
  private inventory: CardInventory = {
    lastSyncAt: null,
    syncInProgress: false,
    cards: [],
  };

  constructor() {
    this.load();
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private load(): void {
    try {
      if (existsSync(INVENTORY_PATH)) {
        const data = readFileSync(INVENTORY_PATH, 'utf-8');
        this.inventory = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  }

  private save(): void {
    try {
      const dir = dirname(INVENTORY_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(INVENTORY_PATH, JSON.stringify(this.inventory, null, 2));
    } catch (error) {
      console.error('Failed to save inventory:', error);
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  getAll(): PlayerCard[] {
    return this.inventory.cards;
  }

  getFiltered(cardType?: string, rarity?: string): PlayerCard[] {
    return this.inventory.cards.filter(card => {
      if (cardType && card.cardType !== cardType) return false;
      if (rarity && card.rarity !== rarity) return false;
      return true;
    });
  }

  getSummary(): InventorySummary {
    const summary: InventorySummary = {
      total: this.inventory.cards.length,
      byType: {
        Bronze: { Common: 0, Rare: 0 },
        Silver: { Common: 0, Rare: 0 },
        Gold: { Common: 0, Rare: 0 },
      },
      lastSyncAt: this.inventory.lastSyncAt,
    };

    for (const card of this.inventory.cards) {
      summary.byType[card.cardType][card.rarity]++;
    }

    return summary;
  }

  isSyncInProgress(): boolean {
    return this.inventory.syncInProgress;
  }

  setSyncInProgress(inProgress: boolean): void {
    this.inventory.syncInProgress = inProgress;
    this.save();
  }

  // Called at start of sync - clears existing cards
  startSync(): void {
    this.inventory.cards = [];
    this.inventory.syncInProgress = true;
    this.save();
  }

  // Add cards during sync
  addCards(cards: PlayerCard[]): void {
    this.inventory.cards.push(...cards);
    this.save();
  }

  // Called at end of sync
  finishSync(): void {
    this.inventory.lastSyncAt = new Date().toISOString();
    this.inventory.syncInProgress = false;
    this.save();
  }

  // ==========================================================================
  // Card Removal (for SBC exchanges)
  // ==========================================================================

  /**
   * Remove cards by criteria (used after SBC exchange)
   * Removes the specified count of cards matching cardType and rarity
   * Returns the number of cards actually removed
   */
  removeCards(cardType: 'Bronze' | 'Silver' | 'Gold', rarity: 'Common' | 'Rare', count: number): number {
    let removed = 0;
    const newCards: PlayerCard[] = [];

    for (const card of this.inventory.cards) {
      if (removed < count && card.cardType === cardType && card.rarity === rarity) {
        removed++;
        // Don't add to newCards (effectively removing it)
      } else {
        newCards.push(card);
      }
    }

    this.inventory.cards = newCards;
    this.save();
    return removed;
  }

  /**
   * Remove multiple card types at once (for complex SBC tasks)
   * @param usedCards - Array of { cardType, rarity, count }
   */
  removeUsedCards(usedCards: Array<{ cardType: 'Bronze' | 'Silver' | 'Gold'; rarity: 'Common' | 'Rare'; count: number }>): void {
    for (const { cardType, rarity, count } of usedCards) {
      this.removeCards(cardType, rarity, count);
    }
  }

  /**
   * Remove a specific card by ID
   */
  removeCardById(cardId: string): boolean {
    const initialLength = this.inventory.cards.length;
    this.inventory.cards = this.inventory.cards.filter(card => card.id !== cardId);
    const removed = this.inventory.cards.length < initialLength;
    if (removed) {
      this.save();
    }
    return removed;
  }

}

// Generate unique ID for a card
export function generateCardId(card: Omit<PlayerCard, 'id' | 'scrapedAt'>): string {
  return `${card.cardType}-${card.rarity}-${card.playerName}-${card.rating}-${card.position}`.toLowerCase().replace(/\s+/g, '-');
}

// Export singleton instance
export const inventoryService = new InventoryService();
