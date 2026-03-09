import { AlertLog } from '@/components/AlertLog';
import { ScannerMatrix } from '@/components/ScannerMatrix';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { useScanner } from '@/hooks/useScanner';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useSettings } from '@/hooks/useSettings';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const { settings, updateSettings } = useSettings();
  const { watchlist, addToWatchlist, removeFromWatchlist, toggleAlerts, isWatched } = useWatchlist();
  const { assets, alerts, scanning, lastScanTime, scanProgress, clearAlerts, runScan } = useScanner(settings, watchlist);

  const lastScanStr = lastScanTime
    ? new Date(lastScanTime).toLocaleTimeString('en-US', { hour12: false })
    : '—';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            BYBIT SCANNER
          </h1>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${scanning ? 'bg-primary animate-pulse-dot' : 'bg-muted-foreground'}`} />
            {scanning ? 'SCANNING' : 'IDLE'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            Last: {lastScanStr}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {assets.length} assets
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={runScan}
            disabled={scanning}
            title="Force scan"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
          </Button>
          <SettingsPanel settings={settings} onUpdate={updateSettings} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex-shrink-0">
          <AlertLog alerts={alerts} onClear={clearAlerts} />
        </div>

        <div className="flex-1 min-w-0">
          <ScannerMatrix
            assets={assets}
            scanning={scanning}
            scanProgress={scanProgress}
            onAddToWatchlist={addToWatchlist}
            isWatched={isWatched}
          />
        </div>

        <div className="w-56 flex-shrink-0">
          <WatchlistPanel
            watchlist={watchlist}
            assets={assets}
            onRemove={removeFromWatchlist}
            onToggleAlerts={toggleAlerts}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
