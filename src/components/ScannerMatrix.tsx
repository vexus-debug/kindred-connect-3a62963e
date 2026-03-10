import { useState, useMemo } from 'react';
import type { AssetTrend, Timeframe } from '@/types/scanner';
import { ALL_TIMEFRAMES, TIMEFRAME_LABELS } from '@/types/scanner';
import type { ConfirmedTrend, IndicatorDetail } from '@/lib/indicators';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search, Star, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Shield, ShieldCheck, ShieldAlert, Target, Gauge } from 'lucide-react';

interface ScannerMatrixProps {
  assets: AssetTrend[];
  scanning: boolean;
  scanProgress: { current: number; total: number };
  onAddToWatchlist: (symbol: string) => void;
  isWatched: (symbol: string) => boolean;
}

/** Flattened entry: one per symbol+timeframe combo */
interface TrendEntry {
  asset: AssetTrend;
  tf: Timeframe;
  sig: ConfirmedTrend;
}

export function ScannerMatrix({ assets, scanning, scanProgress, onAddToWatchlist, isWatched }: ScannerMatrixProps) {
  const [search, setSearch] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filterTf, setFilterTf] = useState<Timeframe | 'all'>('all');

  // Flatten all assets × timeframes into individual trend entries, sorted strongest first
  const entries = useMemo(() => {
    const result: TrendEntry[] = [];

    for (const asset of assets) {
      if (search && !asset.symbol.toLowerCase().includes(search.toLowerCase())) continue;

      const timeframes = filterTf === 'all' ? ALL_TIMEFRAMES : [filterTf];
      for (const tf of timeframes) {
        const sig = asset.signals[tf] as ConfirmedTrend | undefined;
        if (sig && sig.confirmations !== undefined) {
          result.push({ asset, tf, sig });
        }
      }
    }

    // Sort by confirmations desc, then by absolute score desc
    result.sort((a, b) => {
      const confDiff = b.sig.confirmations - a.sig.confirmations;
      if (confDiff !== 0) return confDiff;
      return Math.abs(b.sig.score) - Math.abs(a.sig.score);
    });

    return result;
  }, [assets, search, filterTf]);

  const bullCount = entries.filter(e => e.sig.direction === 'bull').length;
  const bearCount = entries.length - bullCount;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-3 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 bg-secondary pl-7 text-xs"
              placeholder="Search symbols…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Timeframe filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] uppercase text-muted-foreground mr-1">TF:</span>
          <button
            onClick={() => setFilterTf('all')}
            className={`rounded px-1.5 py-0.5 text-[9px] transition-colors ${
              filterTf === 'all' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ALL
          </button>
          {ALL_TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setFilterTf(tf)}
              className={`rounded px-1.5 py-0.5 text-[9px] transition-colors ${
                filterTf === tf ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-muted-foreground">{entries.length} trends</span>
          <span className="trend-bull flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />{bullCount}</span>
          <span className="trend-bear flex items-center gap-0.5"><TrendingDown className="h-2.5 w-2.5" />{bearCount}</span>
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
                style={{ width: scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ranked Trend List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1.5">
          {entries.map((entry, idx) => {
            const key = `${entry.asset.symbol}-${entry.tf}`;
            return (
              <TrendCard
                key={key}
                rank={idx + 1}
                entry={entry}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                watched={isWatched(entry.asset.symbol)}
                onWatch={() => onAddToWatchlist(entry.asset.symbol)}
                otherSignals={
                  Object.entries(entry.asset.signals)
                    .filter(([t]) => t !== entry.tf)
                    .map(([t, s]) => ({ tf: t as Timeframe, sig: s as ConfirmedTrend }))
                    .filter(x => x.sig?.confirmations !== undefined)
                }
              />
            );
          })}
          {entries.length === 0 && !scanning && (
            <div className="px-4 py-12 text-center text-xs text-muted-foreground">
              {assets.length === 0 ? 'Starting scan… waiting for data' : 'No confirmed trends found'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TrendCard({
  rank, entry, expanded, onToggle, watched, onWatch, otherSignals,
}: {
  rank: number;
  entry: TrendEntry;
  expanded: boolean;
  onToggle: () => void;
  watched: boolean;
  onWatch: () => void;
  otherSignals: { tf: Timeframe; sig: ConfirmedTrend }[];
}) {
  const { asset, tf, sig } = entry;
  const isBull = sig.direction === 'bull';
  const changeColor = asset.change24h >= 0 ? 'trend-bull' : 'trend-bear';
  const ConfIcon = sig.strength === 'strong' ? ShieldCheck : sig.strength === 'moderate' ? Shield : ShieldAlert;

  return (
    <div
      className="rounded border transition-colors"
      style={{
        borderColor: isBull ? 'hsl(142 72% 45% / 0.2)' : 'hsl(0 72% 50% / 0.2)',
        backgroundColor: isBull ? 'hsl(142 72% 45% / 0.03)' : 'hsl(0 72% 50% / 0.03)',
      }}
    >
      {/* Summary row */}
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {/* Rank */}
        <span className="text-[10px] tabular-nums text-muted-foreground w-4 flex-shrink-0 text-right">#{rank}</span>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isBull ? <TrendingUp className="h-3.5 w-3.5 trend-bull flex-shrink-0" /> : <TrendingDown className="h-3.5 w-3.5 trend-bear flex-shrink-0" />}
          <span className="text-xs font-bold truncate">{asset.symbol.replace('USDT', '')}</span>
          <span className="rounded bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">{TIMEFRAME_LABELS[tf]}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] tabular-nums text-foreground hidden sm:inline">
            ${asset.price < 1 ? asset.price.toPrecision(4) : asset.price.toFixed(2)}
          </span>
          <span className={`text-[10px] tabular-nums ${changeColor}`}>
            {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
          </span>
          {/* Confirmation badge */}
          <div className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${
            sig.strength === 'strong' ? 'bg-primary/20 text-primary' :
            sig.strength === 'moderate' ? 'bg-accent/20 text-accent' :
            'bg-muted text-muted-foreground'
          }`}>
            <ConfIcon className="h-2.5 w-2.5" />
            {sig.confirmations}/{sig.totalChecks}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onWatch(); }}
            className={`transition-colors ${watched ? 'text-accent' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
          >
            <Star className="h-3 w-3" fill={watched ? 'currentColor' : 'none'} />
          </button>
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-2">
          {/* Price on mobile */}
          <div className="flex gap-3 text-[10px] sm:hidden">
            <span className="text-foreground tabular-nums">
              ${asset.price < 1 ? asset.price.toPrecision(4) : asset.price.toFixed(2)}
            </span>
          </div>

          {/* Also trending on other timeframes */}
          {otherSignals.length > 0 && (
            <div>
              <div className="text-[9px] uppercase text-muted-foreground font-medium mb-1">Also trending on</div>
              <div className="flex flex-wrap gap-1">
                {otherSignals.map(({ tf: t, sig: s }) => (
                  <span key={t} className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                    s.direction === 'bull' ? 'bg-primary/15 trend-bull' : 'bg-destructive/15 trend-bear'
                  }`}>
                    {TIMEFRAME_LABELS[t]}: {s.direction === 'bull' ? '↑' : '↓'} {s.confirmations}/{s.totalChecks}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Indicator breakdown */}
          <div className="space-y-0.5">
            <div className="text-[9px] uppercase text-muted-foreground font-medium mb-1">
              Indicator Breakdown ({TIMEFRAME_LABELS[tf]})
            </div>
            {(sig.indicators ?? []).map((ind: IndicatorDetail) => (
              <div key={ind.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    ind.signal === 'bull' ? 'bg-trend-bull' :
                    ind.signal === 'bear' ? 'bg-trend-bear' :
                    'bg-muted-foreground'
                  }`} />
                  <span className="text-foreground font-medium">{ind.name}</span>
                </div>
                <span className={`tabular-nums ${
                  ind.confirmed ? (ind.signal === 'bull' ? 'trend-bull' : ind.signal === 'bear' ? 'trend-bear' : 'text-muted-foreground') : 'text-muted-foreground'
                }`}>
                  {ind.value}
                </span>
              </div>
            ))}
          </div>

          {/* Probability Rating */}
          <div className="flex items-center gap-2 py-1.5 border-t border-border/30">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium">Probability</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${sig.probability ?? 0}%`,
                  backgroundColor: (sig.probability ?? 0) >= 75 ? 'hsl(var(--primary))' :
                    (sig.probability ?? 0) >= 50 ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))',
                }}
              />
            </div>
            <span className={`text-[11px] font-bold tabular-nums ${
              (sig.probability ?? 0) >= 75 ? 'text-primary' :
              (sig.probability ?? 0) >= 50 ? 'text-accent' : 'text-muted-foreground'
            }`}>
              {sig.probability ?? 0}%
            </span>
          </div>

          {/* Support & Resistance */}
          {sig.supportResistance && (
            <div className="py-1.5 border-t border-border/30 space-y-1">
              <div className="flex items-center gap-1.5">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span className="text-[9px] uppercase text-muted-foreground font-medium">
                  Support & Resistance ({TIMEFRAME_LABELS[tf]})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-primary/10 px-2 py-1.5">
                  <div className="text-[8px] uppercase text-muted-foreground">Support</div>
                  <div className="text-[11px] font-bold text-primary tabular-nums">
                    ${sig.supportResistance.nearestSupport < 1
                      ? sig.supportResistance.nearestSupport.toPrecision(4)
                      : sig.supportResistance.nearestSupport.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-muted-foreground tabular-nums">
                    -{sig.supportResistance.supportDistance.toFixed(2)}% away
                  </div>
                </div>
                <div className="rounded bg-destructive/10 px-2 py-1.5">
                  <div className="text-[8px] uppercase text-muted-foreground">Resistance</div>
                  <div className="text-[11px] font-bold text-destructive tabular-nums">
                    ${sig.supportResistance.nearestResistance < 1
                      ? sig.supportResistance.nearestResistance.toPrecision(4)
                      : sig.supportResistance.nearestResistance.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-muted-foreground tabular-nums">
                    +{sig.supportResistance.resistanceDistance.toFixed(2)}% away
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="flex gap-3 pt-1 border-t border-border/30 text-[9px] text-muted-foreground">
            <span>RSI: {sig.rsi?.toFixed(0) ?? '—'}</span>
            <span>ADX: {sig.adx.toFixed(0)}</span>
            <span>Vol: {sig.volumeRatio.toFixed(1)}x</span>
            <span>Score: {sig.score}</span>
          </div>
        </div>
      )}
    </div>
  );
}
