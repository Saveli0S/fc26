import { useState, useEffect } from 'react';
import { PlayerCard, InventorySummary } from '../types';
import { api } from '../hooks/useApi';

interface InventoryDialogProps {
  onClose: () => void;
}

type CardTypeFilter = 'All' | 'Bronze' | 'Silver' | 'Gold';
type RarityFilter = 'All' | 'Common' | 'Rare';

export function InventoryDialog({ onClose }: InventoryDialogProps) {
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardTypeFilter, setCardTypeFilter] = useState<CardTypeFilter>('All');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('All');

  useEffect(() => {
    loadData();
  }, [cardTypeFilter, rarityFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cardsData, summaryData] = await Promise.all([
        api.getInventoryCards(
          cardTypeFilter === 'All' ? undefined : cardTypeFilter,
          rarityFilter === 'All' ? undefined : rarityFilter
        ),
        api.getInventorySummary(),
      ]);
      setCards(cardsData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const cardTypeColors: Record<string, string> = {
    Bronze: 'text-amber-600',
    Silver: 'text-gray-300',
    Gold: 'text-yellow-400',
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#131820] border border-ea-border rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-ea-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Card Inventory</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {summary?.lastSyncAt
                ? `Last synced: ${new Date(summary.lastSyncAt).toLocaleString()}`
                : 'Not synced yet'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="px-6 py-4 border-b border-ea-border shrink-0">
            <div className="grid grid-cols-7 gap-3">
              {/* Total */}
              <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{summary.total}</div>
                <div className="text-xs text-gray-500 mt-1">Total</div>
              </div>

              {/* By Type */}
              {(['Bronze', 'Silver', 'Gold'] as const).map((type) => (
                <div key={type} className="col-span-2 grid grid-cols-2 gap-2">
                  <div className={`bg-gray-900/50 rounded-lg p-3 text-center border-l-2 ${type === 'Bronze' ? 'border-amber-600' :
                      type === 'Silver' ? 'border-gray-400' :
                        'border-yellow-400'
                    }`}>
                    <div className={`text-xl font-bold ${cardTypeColors[type]}`}>
                      {summary.byType[type].Common}
                    </div>
                    <div className="text-xs text-gray-500">{type} Common</div>
                  </div>
                  <div className={`bg-gray-900/50 rounded-lg p-3 text-center border-l-2 ${type === 'Bronze' ? 'border-amber-600' :
                      type === 'Silver' ? 'border-gray-400' :
                        'border-yellow-400'
                    }`}>
                    <div className={`text-xl font-bold ${cardTypeColors[type]}`}>
                      {summary.byType[type].Rare}
                    </div>
                    <div className="text-xs text-gray-500">{type} Rare</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-3 border-b border-ea-border flex gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Card Type:</label>
            <select
              value={cardTypeFilter}
              onChange={(e) => setCardTypeFilter(e.target.value as CardTypeFilter)}
              className="bg-gray-900 border border-ea-border rounded px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-ea-green"
            >
              <option value="All">All</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Rarity:</label>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
              className="bg-gray-900 border border-ea-border rounded px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-ea-green"
            >
              <option value="All">All</option>
              <option value="Common">Common</option>
              <option value="Rare">Rare</option>
            </select>
          </div>

          <div className="flex-1" />

          <div className="text-sm text-gray-400">
            Showing {cards.length} cards
          </div>
        </div>

        {/* Card Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : cards.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-gray-500">
                {summary?.total === 0
                  ? 'No cards in inventory. Click "Sync Cards" to fetch your club.'
                  : 'No cards match the selected filters.'}
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rating
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rarity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ea-border">
                {cards.map((card) => (
                  <tr key={card.id} className="hover:bg-gray-900/30">
                    <td className="px-4 py-3">
                      <span className="text-sm text-white">{card.playerName}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-bold ${cardTypeColors[card.cardType]}`}>
                        {card.rating}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-400">{card.position}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${cardTypeColors[card.cardType]}`}>
                        {card.cardType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded ${card.rarity === 'Rare'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-gray-700 text-gray-400'
                        }`}>
                        {card.rarity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ea-border flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-ea-green text-black font-medium rounded hover:bg-ea-green/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
