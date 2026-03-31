import { useState, useMemo } from 'react';
import { useSharedPatternScanner } from '@/contexts/PatternScannerContext';
import type { DetectedPattern, PatternGroup } from '@/hooks/usePatternScanner';
import type { SmcEvent, SmcMeta } from '@/lib/smc';
import { TIMEFRAME_LABELS, type Timeframe } from '@/types/scanner';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, TrendingUp, TrendingDown, Clock, X, Target,
  ArrowUpRight, ArrowDownRight, Zap, Shield, Activity,
  Gauge, Layers, BarChart3, Crosshair,
} from 'lucide-react';

type TypeFilter = 'all' | 'bullish' | 'bearish';
const SCAN_TIMEFRAMES: Timeframe[] = ['5', '15', '60', '240', 'D', 'W'];
const CHOCH_FAIL_OPTIONS = ['all', '1+', '2+', '3+'] as const;
type ChochFailFilter = typeof CHOCH_FAIL_OPTIONS[number];

const MarketStructurePage = () => {
  const { structureGroups, scanning, lastScanTime, scanProgress, runScan } = useSharedPatternScanner();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tfFilter, setTfFilter] = useState<Timeframe | 'all'>('all');
  const [chochFailFilter, setChochFailFilter] = useState<ChochFailFilter>('all');
  

  const filteredGroups = useMemo(() => {
    const result: PatternGroup[] = [];
    const timeframes = tfFilter === 'all' ? SCAN_TIMEFRAMES : [tfFilter];
    const minChochFails = chochFailFilter === 'all' ? 0 : parseInt(chochFailFilter);
    for (const tf of timeframes) {
      const group = structureGroups.find(g => g.timeframe === tf);
      if (!group) continue;
      const filtered = group.patterns.filter(dp => {
        if (typeFilter !== 'all' && dp.pattern.type !== typeFilter) return false;
        if (minChochFails > 0) {
          const meta = (dp.pattern as SmcEvent).meta;
          const count = meta?.chochFailures ?? 0;
          if (count < minChochFails) return false;
        }
        return true;
      });
      if (filtered.length > 0) result.push({ ...group, patterns: filtered });
    }
    return result;
  }, [structureGroups, typeFilter, tfFilter, chochFailFilter]);

  const totalPatterns = filteredGroups.reduce((s, g) => s + g.patterns.length, 0);
  const hasFilters = typeFilter !== 'all' || tfFilter !== 'all' || chochFailFilter !== 'all';


  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-[0.15em] text-foreground">Market Structure</h1>
          <p className="text-[10px] text-muted-foreground">BOS, CHoCH, FVG, OB, Liquidity, Traps, Sweeps — per-symbol SMC analysis</p>
        </div>
        <div className="flex items-center gap-2">
          {scanning && (
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {scanProgress.current}/{scanProgress.total}
            </span>
          )}
          <span className="text-[10px] tabular-nums text-muted-foreground">{totalPatterns} found</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={runScan} disabled={scanning}>
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            {(['all', 'bullish', 'bearish'] as TypeFilter[]).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  typeFilter === t
                    ? t === 'bullish' ? 'bg-primary/20 text-primary'
                    : t === 'bearish' ? 'bg-destructive/20 text-destructive'
                    : 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'all' ? 'All' : t === 'bullish' ? '↑ Bullish' : '↓ Bearish'}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTfFilter('all')}
              className={`rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
                tfFilter === 'all' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >All TF</button>
            {SCAN_TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTfFilter(tf)}
                className={`rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
                  tfFilter === tf ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:text-foreground'
                }`}
              >{TIMEFRAME_LABELS[tf]}</button>
            ))}
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground mr-0.5">CHoCH Fails:</span>
            {CHOCH_FAIL_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setChochFailFilter(opt)}
                className={`rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
                  chochFailFilter === opt ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground hover:text-foreground'
                }`}
              >{opt === 'all' ? 'Any' : opt}</button>
            ))}
          </div>
          {hasFilters && (
            <button onClick={() => { setTypeFilter('all'); setTfFilter('all'); setChochFailFilter('all'); }}
              className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">
              <X className="h-2.5 w-2.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {scanning && (
        <div className="h-0.5 bg-muted">
          <div className="h-full bg-primary transition-all duration-300"
            style={{ width: scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '0%' }} />
        </div>
      )}


      <ScrollArea className="flex-1">
        <div className="p-3 space-y-5">
          {filteredGroups.length === 0 && !scanning && (
            <div className="py-16 text-center text-xs text-muted-foreground">
              {structureGroups.length === 0
                ? 'Scanning in background… Results will appear automatically.'
                : 'No patterns match the current filters.'}
            </div>
          )}

          {filteredGroups.map(group => (
            <div key={group.timeframe}>
              <div className="flex items-center gap-2 mb-3">
                <span className="rounded-full bg-accent/15 px-3 py-0.5 text-[11px] font-bold text-accent">
                  {group.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {group.patterns.length} signal{group.patterns.length !== 1 ? 's' : ''}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-3">
                {group.patterns.map(dp => (
                  <SmcCard
                    key={dp.id}
                    dp={dp}
                    isSelected={false}
                    onClick={() => {}}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

function SmcCard({ dp, isSelected, onClick }: { dp: DetectedPattern; isSelected: boolean; onClick: () => void }) {
  const p = dp.pattern as SmcEvent;
  const meta = p.meta;
  const isBull = p.type === 'bullish';
  const isBear = p.type === 'bearish';

  const formedTime = formatTime(dp.formedAt, dp.timeframe);

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border overflow-hidden cursor-pointer transition-all hover:brightness-110 ${
        isSelected ? 'ring-1 ring-accent' : ''
      }`}
      style={{
        borderColor: isBull
          ? 'hsl(142 72% 45% / 0.25)'
          : isBear
          ? 'hsl(0 72% 50% / 0.25)'
          : 'hsl(var(--border))',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30">
        <Badge variant="outline" className="text-[9px] px-2 py-0 rounded-full border-accent/30 text-accent">
          {TIMEFRAME_LABELS[dp.timeframe]}
        </Badge>
        <Badge className={`text-[9px] px-2 py-0 rounded-full border-0 ${
          isBull ? 'bg-primary/20 text-primary' : isBear ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'
        }`}>
          {isBull ? 'Bullish' : isBear ? 'Bearish' : 'Neutral'}
        </Badge>
        {meta?.signalQuality && (
          <Badge className={`text-[9px] px-2 py-0 rounded-full border-0 ${
            meta.signalQuality === 'A+' ? 'bg-primary/25 text-primary' :
            meta.signalQuality === 'A' ? 'bg-accent/20 text-accent' :
            'bg-muted text-muted-foreground'
          }`}>
            {meta.signalQuality}
          </Badge>
        )}
        {dp.trendAligned && (
          <Badge className="text-[9px] px-2 py-0 rounded-full border-0 bg-accent/20 text-accent">✓ Aligned</Badge>
        )}
        <div className="flex-1" />
        <SignificanceDots significance={p.significance} />
      </div>

      {/* Main content */}
      <div className="px-3 py-3 space-y-2.5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground leading-tight">{dp.symbol}</h3>
            <p className="text-xs font-semibold" style={{
              color: isBull ? 'hsl(var(--trend-bull))' : isBear ? 'hsl(var(--trend-bear))' : 'hsl(var(--muted-foreground))',
            }}>{p.name}</p>
          </div>
          {isBull ? <ArrowUpRight className="h-5 w-5 text-primary" /> : isBear ? <ArrowDownRight className="h-5 w-5 text-destructive" /> : null}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">{p.description}</p>

        {/* Per-result SMC Overview */}
        <SmcMetaOverview meta={meta || {}} price={dp.price} />

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="tabular-nums font-medium text-foreground/70">
              ${dp.price < 1 ? dp.price.toPrecision(4) : dp.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />{formedTime}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className={`h-3 w-3 ${
              p.significance === 'high' ? 'text-primary' : p.significance === 'medium' ? 'text-accent' : 'text-muted-foreground'
            }`} />
            <span className="text-[9px] font-medium uppercase text-muted-foreground">{p.significance}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SmcMetaOverview({ meta, price }: { meta: SmcMeta; price: number }) {
  const hasProbabilities = meta.probBull != null && meta.probBear != null;
  const hasScore = meta.structureScore != null;
  const hasRR = meta.riskReward != null;
  const hasLevels = meta.suggestedStop != null || meta.suggestedTarget != null;
  const hasPhase = meta.marketPhase != null;
  const hasAnyData = hasProbabilities || hasScore || hasRR || hasPhase || meta.volatilityOk != null || meta.rangePosition != null;

  const phaseColor: Record<string, string> = {
    accumulation: 'text-accent',
    expansion: 'text-primary',
    retracement: 'text-yellow-500',
    distribution: 'text-destructive',
  };

  if (!hasAnyData) {
    return (
      <div className="rounded-lg bg-secondary/40 p-2.5">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Gauge className="h-3 w-3" /> Hit rescan ↻ for full SMC analysis
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-secondary/40 p-2.5 space-y-2">
      {/* Probability bar */}
      {hasProbabilities && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1 text-[9px] text-primary font-medium">
              <TrendingUp className="h-2.5 w-2.5" /> {meta.probBull}%
            </span>
            <span className="flex items-center gap-1 text-[9px] text-destructive font-medium">
              {meta.probBear}% <TrendingDown className="h-2.5 w-2.5" />
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
            <div className="h-full bg-primary transition-all duration-500 rounded-l-full" style={{ width: `${meta.probBull}%` }} />
            <div className="h-full bg-destructive transition-all duration-500 rounded-r-full" style={{ width: `${meta.probBear}%` }} />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {hasScore && (
          <StatItem icon={<Gauge className="h-2.5 w-2.5" />} label="Score" value={`${meta.structureScore}`}
            valueClass={meta.structureScore! >= 70 ? 'text-primary' : meta.structureScore! >= 40 ? 'text-accent' : 'text-muted-foreground'} />
        )}
        {hasPhase && (
          <StatItem icon={<Layers className="h-2.5 w-2.5" />} label="Phase" value={meta.marketPhase!}
            valueClass={phaseColor[meta.marketPhase!] || 'text-foreground'} />
        )}
        {meta.volatilityOk != null && (
          <StatItem icon={<Activity className="h-2.5 w-2.5" />} label="Vol"
            value={meta.volatilityExpansion ? 'Expanding' : meta.volatilityOk ? 'OK' : 'Low'}
            valueClass={meta.volatilityExpansion ? 'text-accent' : meta.volatilityOk ? 'text-primary' : 'text-yellow-500'} />
        )}
        {hasRR && (
          <StatItem icon={<Target className="h-2.5 w-2.5" />} label="R:R" value={`${meta.riskReward!.toFixed(1)}`}
            valueClass={meta.riskReward! >= 2 ? 'text-primary' : meta.riskReward! >= 1 ? 'text-accent' : 'text-destructive'} />
        )}
        {meta.rangePosition && (
          <StatItem icon={<BarChart3 className="h-2.5 w-2.5" />} label="Range" value={meta.rangePosition} />
        )}
        {meta.nearKeyLevel && (
          <StatItem icon={<Crosshair className="h-2.5 w-2.5" />} label="Key Lvl" value={meta.keyLevelName || 'Yes'} valueClass="text-accent" />
        )}
        {meta.chochFailures != null && meta.chochFailures > 0 && (
          <StatItem icon={<Shield className="h-2.5 w-2.5" />} label="CHoCH Fails" value={`${meta.chochFailures}`}
            valueClass={meta.chochFailures >= 3 ? 'text-destructive' : meta.chochFailures >= 2 ? 'text-accent' : 'text-foreground'} />
        )}
      </div>

      {/* Suggested levels */}
      {hasLevels && (
        <div className="flex gap-3 text-[9px]">
          {meta.suggestedStop != null && (
            <span className="text-destructive">
              SL: ${meta.suggestedStop < 1 ? meta.suggestedStop.toPrecision(4) : meta.suggestedStop.toFixed(2)}
            </span>
          )}
          {meta.suggestedTarget != null && (
            <span className="text-primary">
              TP: ${meta.suggestedTarget < 1 ? meta.suggestedTarget.toPrecision(4) : meta.suggestedTarget.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {meta.isTrap && <MiniTag label="Trap" className="border-destructive/30 text-destructive" />}
        {meta.liquiditySweep && <MiniTag label="Sweep" className="border-accent/30 text-accent" />}
        {meta.isInducement && <MiniTag label="Inducement" className="border-yellow-500/30 text-yellow-500" />}
        {meta.isContinuation && <MiniTag label="Continuation" className="border-primary/30 text-primary" />}
        {meta.isReversal && <MiniTag label="Reversal" className="border-destructive/30 text-destructive" />}
        {meta.htfAligned && <MiniTag label="HTF ✓" className="border-primary/30 text-primary" />}
        {meta.bosFailure && <MiniTag label="BOS Fail" className="border-destructive/30 text-destructive" />}
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[9px] text-muted-foreground">{label}:</span>
      <span className={`text-[10px] font-bold capitalize ${valueClass || 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function MiniTag({ label, className }: { label: string; className: string }) {
  return (
    <Badge variant="outline" className={`text-[8px] px-1.5 py-0 rounded-full ${className}`}>
      {label}
    </Badge>
  );
}

function SignificanceDots({ significance }: { significance: 'high' | 'medium' | 'low' }) {
  const count = significance === 'high' ? 3 : significance === 'medium' ? 2 : 1;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map(i => (
        <div key={i} className={`h-1.5 w-1.5 rounded-full ${i <= count ? 'bg-primary' : 'bg-muted'}`} />
      ))}
    </div>
  );
}

function formatTime(ts: number, tf: string): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (tf === 'D' || tf === 'W') return date;
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}

export default MarketStructurePage;
