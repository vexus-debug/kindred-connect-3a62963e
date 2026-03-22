import { useState, useEffect, useCallback } from 'react';
import { Activity, Zap, TrendingUp, TrendingDown, RefreshCw, Filter, Clock, Volume2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MomentumSignal {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  timeframe: string;
  score: number;
  direction: 'bull' | 'bear';
  signals: {
    rsiBreakout: boolean;
    macdCross: boolean;
    volumeSpike: boolean;
    adxSurge: boolean;
    emaCrossover: boolean;
    priceAcceleration: boolean;
    stochMomentum: boolean;
    obvBreakout: boolean;
    squeezeFire: boolean;
    vwapBreak: boolean;
  };
  details: {
    rsi: number;
    macd: number;
    macdSignal: number;
    macdHist: number;
    adx: number;
    volumeRatio: number;
    roc: number;
    stochK: number;
    stochD: number;
    ema9: number;
    ema21: number;
    ema50: number;
    atr: number;
    bbSqueeze: number;
  };
  timestamp: number;
}

interface ScanResult {
  signals: MomentumSignal[];
  scannedAt: string;
  totalScanned: number;
  totalTimeframes: number;
}

const TF_LABELS: Record<string, string> = {
  '15': '15m',
  '60': '1H',
  '240': '4H',
  'D': '1D',
};

const SIGNAL_LABELS: Record<string, { label: string; color: string }> = {
  rsiBreakout: { label: 'RSI', color: 'bg-blue-500/20 text-blue-400' },
  macdCross: { label: 'MACD', color: 'bg-purple-500/20 text-purple-400' },
  volumeSpike: { label: 'VOL', color: 'bg-amber-500/20 text-amber-400' },
  adxSurge: { label: 'ADX', color: 'bg-cyan-500/20 text-cyan-400' },
  emaCrossover: { label: 'EMA', color: 'bg-green-500/20 text-green-400' },
  priceAcceleration: { label: 'ACCEL', color: 'bg-orange-500/20 text-orange-400' },
  stochMomentum: { label: 'STOCH', color: 'bg-pink-500/20 text-pink-400' },
  obvBreakout: { label: 'OBV', color: 'bg-teal-500/20 text-teal-400' },
  squeezeFire: { label: 'SQUEEZE', color: 'bg-red-500/20 text-red-400' },
  vwapBreak: { label: 'VWAP', color: 'bg-indigo-500/20 text-indigo-400' },
};

function formatVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(score, 100);
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums">{score}</span>
    </div>
  );
}

export default function MomentumScanner() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirFilter, setDirFilter] = useState<'all' | 'bull' | 'bear'>('all');
  const [tfFilter, setTfFilter] = useState<string>('all');
  const [minScore, setMinScore] = useState(30);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/momentum-scanner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const result = await res.json();
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = (data?.signals ?? []).filter(s => {
    if (dirFilter !== 'all' && s.direction !== dirFilter) return false;
    if (tfFilter !== 'all' && s.timeframe !== tfFilter) return false;
    if (s.score < minScore) return false;
    return true;
  });

  // Group by symbol, pick best timeframe
  const grouped = new Map<string, MomentumSignal[]>();
  for (const s of filtered) {
    const arr = grouped.get(s.symbol) || [];
    arr.push(s);
    grouped.set(s.symbol, arr);
  }
  const sortedSymbols = [...grouped.entries()]
    .map(([symbol, signals]) => ({
      symbol,
      signals: signals.sort((a, b) => b.score - a.score),
      bestScore: Math.max(...signals.map(s => s.score)),
      tfCount: new Set(signals.map(s => s.timeframe)).size,
    }))
    .sort((a, b) => {
      // Multi-timeframe confluence first, then by score
      if (b.tfCount !== a.tfCount) return b.tfCount - a.tfCount;
      return b.bestScore - a.bestScore;
    });

  const signalCount = Object.values(filtered[0]?.signals ?? {}).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-sm font-bold uppercase tracking-wider text-foreground">Momentum Scanner</h1>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <span className="text-[10px] text-muted-foreground">
                {data.totalScanned} coins · {new Date(data.scannedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Scan
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Direction:</span>
            {(['all', 'bull', 'bear'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDirFilter(d)}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                  dirFilter === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'
                )}
              >
                {d === 'all' ? 'All' : d === 'bull' ? '🟢 Bull' : '🔴 Bear'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">TF:</span>
            {['all', '15', '60', '240', 'D'].map(tf => (
              <button
                key={tf}
                onClick={() => setTfFilter(tf)}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                  tfFilter === tf ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'
                )}
              >
                {tf === 'all' ? 'All' : TF_LABELS[tf]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Min Score:</span>
            {[30, 50, 70].map(s => (
              <button
                key={s}
                onClick={() => setMinScore(s)}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                  minScore === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'
                )}
              >
                {s}+
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Scanning 100 coins across 4 timeframes...</p>
            <p className="text-xs text-muted-foreground">This may take 30-60 seconds</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!loading && data && sortedSymbols.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">No momentum signals detected with current filters</p>
          </div>
        )}

        {sortedSymbols.map(({ symbol, signals, bestScore, tfCount }) => {
          const best = signals[0];
          const isExpanded = expanded === symbol;
          return (
            <div
              key={symbol}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              {/* Summary row */}
              <button
                onClick={() => setExpanded(isExpanded ? null : symbol)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors text-left"
              >
                {/* Direction icon */}
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0',
                  best.direction === 'bull' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                )}>
                  {best.direction === 'bull'
                    ? <TrendingUp className="h-4 w-4" />
                    : <TrendingDown className="h-4 w-4" />
                  }
                </div>

                {/* Symbol & Price */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground">{symbol.replace('USDT', '')}</span>
                    {tfCount > 1 && (
                      <span className="rounded bg-primary/20 px-1 py-0.5 text-[9px] font-bold text-primary">
                        {tfCount}TF
                      </span>
                    )}
                    <div className="flex gap-0.5">
                      {signals.map(s => (
                        <span key={s.timeframe} className="text-[9px] text-muted-foreground bg-muted rounded px-1">
                          {TF_LABELS[s.timeframe]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">${best.price.toLocaleString()}</span>
                    <span className={cn('text-[10px] font-medium', best.change24h >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {best.change24h >= 0 ? '+' : ''}{best.change24h.toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatVolume(best.volume24h)}</span>
                  </div>
                </div>

                {/* Score */}
                <ScoreBar score={bestScore} />
              </button>

              {/* Active signals chips */}
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {Object.entries(best.signals).filter(([, v]) => v).map(([key]) => (
                  <span key={key} className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold', SIGNAL_LABELS[key]?.color)}>
                    {SIGNAL_LABELS[key]?.label}
                  </span>
                ))}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-border px-3 py-2 bg-muted/30">
                  {signals.map(s => (
                    <div key={s.timeframe} className="mb-2 last:mb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-primary">{TF_LABELS[s.timeframe]}</span>
                        <ScoreBar score={s.score} />
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1 text-[10px]">
                        <div><span className="text-muted-foreground">RSI:</span> <span className="font-medium text-foreground">{s.details.rsi}</span></div>
                        <div><span className="text-muted-foreground">ADX:</span> <span className="font-medium text-foreground">{s.details.adx}</span></div>
                        <div><span className="text-muted-foreground">Vol Ratio:</span> <span className={cn('font-medium', s.details.volumeRatio >= 2 ? 'text-amber-400' : 'text-foreground')}>{s.details.volumeRatio}x</span></div>
                        <div><span className="text-muted-foreground">ROC(5):</span> <span className={cn('font-medium', s.details.roc > 0 ? 'text-green-400' : 'text-red-400')}>{s.details.roc}%</span></div>
                        <div><span className="text-muted-foreground">Stoch K/D:</span> <span className="font-medium text-foreground">{s.details.stochK}/{s.details.stochD}</span></div>
                        <div><span className="text-muted-foreground">BB Squeeze:</span> <span className={cn('font-medium', s.details.bbSqueeze < 1.5 ? 'text-red-400' : 'text-foreground')}>{s.details.bbSqueeze}</span></div>
                        <div><span className="text-muted-foreground">MACD Hist:</span> <span className={cn('font-medium', s.details.macdHist > 0 ? 'text-green-400' : 'text-red-400')}>{s.details.macdHist.toFixed(6)}</span></div>
                      </div>
                      {/* Signal chips for this TF */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(s.signals).filter(([, v]) => v).map(([key]) => (
                          <span key={key} className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold', SIGNAL_LABELS[key]?.color)}>
                            {SIGNAL_LABELS[key]?.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      {data && !loading && (
        <div className="border-t border-border bg-card px-4 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length} signals from {sortedSymbols.length} coins
          </span>
          <span className="text-[10px] text-muted-foreground">
            {filtered.filter(s => s.direction === 'bull').length} bull · {filtered.filter(s => s.direction === 'bear').length} bear
          </span>
        </div>
      )}
    </div>
  );
}
