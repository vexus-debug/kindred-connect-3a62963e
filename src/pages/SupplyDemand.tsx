import { useMemo, useState } from 'react';
import { useSharedScanner } from '@/contexts/ScannerContext';
import { getSector, getSectorEmoji } from '@/lib/sectors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, Layers } from 'lucide-react';
import type { ConfirmedTrend } from '@/lib/indicators';
import { ALL_TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe, type AssetTrend } from '@/types/scanner';

interface Zone {
  type: 'supply' | 'demand';
  high: number;
  low: number;
  strength: number; // 1-3
  timeframe: Timeframe;
}

/** Detect supply/demand zones from asset signals using EMAs and price action */
function detectZones(asset: AssetTrend): Zone[] {
  const zones: Zone[] = [];
  const price = asset.price;

  for (const tf of ALL_TIMEFRAMES) {
    const sig = asset.signals[tf] as ConfirmedTrend | undefined;
    if (!sig) continue;

    const { ema9, ema21, ema50, ema200, atr } = sig as any;
    if (!ema9 || !ema21) continue;

    const atrVal = atr || price * 0.015;

    // Demand zones: EMAs below price acting as support
    const emas = [
      { val: ema200, weight: 3 },
      { val: ema50, weight: 2 },
      { val: ema21, weight: 1 },
    ];

    for (const { val, weight } of emas) {
      if (!val) continue;
      const dist = ((price - val) / price) * 100;
      // EMA is below price and within 5% — potential demand zone
      if (dist > 0 && dist < 5) {
        zones.push({
          type: 'demand',
          high: val + atrVal * 0.3,
          low: val - atrVal * 0.3,
          strength: Math.min(3, weight),
          timeframe: tf,
        });
      }
      // EMA is above price and within 5% — potential supply zone
      if (dist < 0 && dist > -5) {
        zones.push({
          type: 'supply',
          high: val + atrVal * 0.3,
          low: val - atrVal * 0.3,
          strength: Math.min(3, weight),
          timeframe: tf,
        });
      }
    }
  }

  // Deduplicate overlapping zones
  const unique: Zone[] = [];
  for (const z of zones) {
    const overlap = unique.find(u => u.type === z.type && Math.abs(u.low - z.low) / z.low < 0.02);
    if (overlap) {
      overlap.strength = Math.min(3, overlap.strength + 1);
    } else {
      unique.push({ ...z });
    }
  }

  return unique.sort((a, b) => b.strength - a.strength);
}

type FilterType = 'all' | 'supply' | 'demand';

const SupplyDemand = () => {
  const { assets } = useSharedScanner();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  const rows = useMemo(() => {
    return assets
      .filter(a => !search || a.symbol.toLowerCase().includes(search.toLowerCase()))
      .map(asset => ({
        asset,
        zones: detectZones(asset),
      }))
      .filter(r => r.zones.length > 0)
      .filter(r => filterType === 'all' || r.zones.some(z => z.type === filterType))
      .sort((a, b) => {
        const aMax = Math.max(...a.zones.map(z => z.strength));
        const bMax = Math.max(...b.zones.map(z => z.strength));
        return bMax - aMax;
      });
  }, [assets, search, filterType]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="border-b border-border px-4 py-2">
        <h1 className="text-sm font-bold uppercase tracking-[0.15em] text-foreground flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          SUPPLY & DEMAND
        </h1>
        <p className="text-[10px] text-muted-foreground">Key zones where price may react</p>
      </header>

      <div className="border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[120px] max-w-[200px]">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-7 bg-secondary pl-7 text-xs" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(['all', 'demand', 'supply'] as FilterType[]).map(f => (
            <button key={f} onClick={() => setFilterType(f)} className={`rounded px-2 py-0.5 text-[9px] transition-colors ${filterType === f ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {f === 'all' ? 'All' : f === 'demand' ? '🟢 Demand' : '🔴 Supply'}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {rows.map(({ asset, zones }) => {
            const filteredZones = filterType === 'all' ? zones : zones.filter(z => z.type === filterType);

            return (
              <div key={asset.symbol} className="rounded-lg border border-border p-3">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{asset.symbol.replace('USDT', '')}</span>
                    <span className="text-[8px]">{getSectorEmoji(getSector(asset.symbol))}</span>
                    <span className={`text-[10px] tabular-nums font-medium ${asset.change24h >= 0 ? 'trend-bull' : 'trend-bear'}`}>
                      {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    ${asset.price < 1 ? asset.price.toPrecision(4) : asset.price.toFixed(2)}
                  </span>
                </div>

                {/* Price bar with zones */}
                <div className="relative h-8 rounded bg-secondary/50 mb-2 overflow-hidden">
                  {/* Find price range from zones */}
                  {(() => {
                    const allPrices = [asset.price, ...filteredZones.flatMap(z => [z.high, z.low])];
                    const min = Math.min(...allPrices) * 0.995;
                    const max = Math.max(...allPrices) * 1.005;
                    const range = max - min;
                    const pricePos = range > 0 ? ((asset.price - min) / range) * 100 : 50;

                    return (
                      <>
                        {filteredZones.map((z, i) => {
                          const left = range > 0 ? ((z.low - min) / range) * 100 : 0;
                          const width = range > 0 ? ((z.high - z.low) / range) * 100 : 10;
                          const opacity = z.strength === 3 ? 0.5 : z.strength === 2 ? 0.35 : 0.2;
                          return (
                            <div
                              key={i}
                              className="absolute top-0 h-full rounded"
                              style={{
                                left: `${Math.max(0, left)}%`,
                                width: `${Math.min(100 - left, width)}%`,
                                backgroundColor: z.type === 'demand'
                                  ? `hsl(var(--trend-bull) / ${opacity})`
                                  : `hsl(var(--trend-bear) / ${opacity})`,
                                borderLeft: `2px solid ${z.type === 'demand' ? 'hsl(var(--trend-bull))' : 'hsl(var(--trend-bear))'}`,
                              }}
                            />
                          );
                        })}
                        {/* Current price marker */}
                        <div
                          className="absolute top-0 h-full w-0.5 bg-foreground z-10"
                          style={{ left: `${pricePos}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 z-10 text-[8px] font-bold text-foreground bg-background/80 px-1 rounded"
                          style={{ left: `${pricePos}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          Price
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Zone list */}
                <div className="space-y-1">
                  {filteredZones.map((z, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className={`rounded px-1.5 py-0.5 font-bold text-[9px] ${
                        z.type === 'demand' ? 'bg-primary/15 trend-bull' : 'bg-destructive/15 trend-bear'
                      }`}>
                        {z.type === 'demand' ? 'DEMAND' : 'SUPPLY'}
                      </span>
                      <span className="tabular-nums text-foreground">
                        ${z.low < 1 ? z.low.toPrecision(4) : z.low.toFixed(2)} — ${z.high < 1 ? z.high.toPrecision(4) : z.high.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">{TIMEFRAME_LABELS[z.timeframe]}</span>
                      <span className="ml-auto flex gap-0.5">
                        {Array.from({ length: z.strength }).map((_, j) => (
                          <span key={j} className={`h-1.5 w-1.5 rounded-full ${z.type === 'demand' ? 'bg-trend-bull' : 'bg-trend-bear'}`} />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-xs text-muted-foreground">
              {assets.length === 0 ? 'Waiting for scan data…' : 'No zones detected near current prices'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SupplyDemand;
