import { PatternPageShell } from '@/components/PatternPageShell';
import { useSharedPatternScanner } from '@/contexts/PatternScannerContext';

const MarketStructurePage = () => {
  const { structureGroups, scanning, lastScanTime, scanProgress, runScan } = useSharedPatternScanner();

  return (
    <PatternPageShell
      title="Market Structure"
      subtitle="BOS, CHoCH, FVG, Order Blocks, Liquidity"
      groups={structureGroups}
      scanning={scanning}
      lastScanTime={lastScanTime}
      scanProgress={scanProgress}
      onRescan={runScan}
    />
  );
};

export default MarketStructurePage;
