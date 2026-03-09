import { useState, useMemo } from 'react';
import type { AssetTrend, Timeframe } from '@/types/scanner';
import { ALL_TIMEFRAMES, TIMEFRAME_LABELS } from '@/types/scanner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, Star } from 'lucide-react';

interface ScannerMatrixProps {
  assets: AssetTrend[];
  scanning: boolean;
  scanProgress: { current: number; total: number };
  onAddToWatchlist: (symbol: string) => void;
  isWatched: (symbol: string) => boolean;
}

export function ScannerMatrix({ assets, scanning, scanProgress, onAddToWatchlist, isWatched }: ScannerMatrixProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'strength' | 'change' | 'volume'>('strength');

  const filtered = useMemo(() => {
    let result = assets.filter((a) =>
      a.symbol.toLowerCase().includes(search.toLowerCase())
    );

    result.sort((a, b) => {
      if (sortBy === 'strength') {
        const scoreA = Math.max(...Object.values(a.signals).map((s) => Math.abs(s?.score ?? 0)), 0);
        const scoreB = Math.max(...Object.values(b.signals).map((s) => Math.abs(s?.score ?? 0)), 0);
        return scoreB - scoreA;
      }
      if (sortBy === 'change') return Math.abs(b.change24h) - Math.abs(a.change24h);
      return b.volume24h - a.volume24h;
    });

    return result;
  }, [assets, search, sortBy]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 bg-secondary pl-7 text-xs"
            placeholder="Search symbols…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['strength', 'change', 'volume'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded px-2 py-0.5 text-[10px] uppercase transition-colors ${
                sortBy === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Scanning indicator */}
      {scanning && (
        <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span className="text-[10px] text-muted-foreground">
            Scanning {scanProgress.current}/{scanProgress.total}
          </span>
          <div className="flex-1">
            <div className="h-0.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <ScrollArea className="flex-1">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Symbol</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Price</th>
              <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">24h%</th>
              {ALL_TIMEFRAMES.map((tf) => (
                <th key={tf} className="px-1 py-1.5 text-center font-medium text-muted-foreground">
                  {TIMEFRAME_LABELS[tf]}
                </th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((asset) => (
              <AssetRow
                key={asset.symbol}
                asset={asset}
                watched={isWatched(asset.symbol)}
                onWatch={() => onAddToWatchlist(asset.symbol)}
              />
            ))}
            {filtered.length === 0 && !scanning && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {assets.length === 0 ? 'Starting scan…' : 'No matches found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function AssetRow({
  asset,
  watched,
  onWatch,
}: {
  asset: AssetTrend;
  watched: boolean;
  onWatch: () => void;
}) {
  const changeColor = asset.change24h >= 0 ? 'text-trend-bull' : 'text-trend-bear';

  return (
    <tr className="border-b border-border/50 transition-colors hover:bg-secondary/30">
      <td className="px-2 py-1 font-semibold">{asset.symbol.replace('USDT', '')}</td>
      <td className="px-2 py-1 text-right tabular-nums">
        ${asset.price < 1 ? asset.price.toPrecision(4) : asset.price.toFixed(2)}
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${changeColor}`}>
        {asset.change24h >= 0 ? '+' : ''}
        {asset.change24h.toFixed(2)}%
      </td>
      {ALL_TIMEFRAMES.map((tf) => (
        <TrendCell key={tf} signal={asset.signals[tf]} />
      ))}
      <td className="px-1 py-1">
        <button
          onClick={onWatch}
          className={`transition-colors ${watched ? 'text-accent' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
          title={watched ? 'In watchlist' : 'Add to watchlist'}
        >
          <Star className="h-3 w-3" fill={watched ? 'currentColor' : 'none'} />
        </button>
      </td>
    </tr>
  );
}

function TrendCell({ signal }: { signal?: AssetTrend['signals'][Timeframe] }) {
  if (!signal || !signal.direction) {
    return <td className="px-1 py-1 text-center">
      <span className="inline-block h-2 w-2 rounded-sm bg-muted" />
    </td>;
  }

  const isBull = signal.direction === 'bull';
  const opacity =
    signal.strength === 'strong' ? 'opacity-100' :
    signal.strength === 'moderate' ? 'opacity-70' : 'opacity-40';

  return (
    <td className="px-1 py-1 text-center">
      <span
        className={`inline-block h-2 w-2 rounded-sm ${opacity} ${
          isBull ? 'bg-trend-bull glow-green' : 'bg-trend-bear glow-red'
        }`}
        title={`${signal.strength} ${signal.direction} (ADX: ${signal.adx.toFixed(1)}, Score: ${signal.score})`}
      />
    </td>
  );
}
