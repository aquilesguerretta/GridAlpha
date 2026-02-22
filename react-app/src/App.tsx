import { useState } from 'react';
import { Zap } from 'lucide-react';
import GenerationMix from '@/react-app/components/tabs/GenerationMix';
import PriceIntelligence from '@/react-app/components/tabs/PriceIntelligence';
import SparkSpread from '@/react-app/components/tabs/SparkSpread';
import BatteryArbitrage from '@/react-app/components/tabs/BatteryArbitrage';
import MarginalFuel from '@/react-app/components/tabs/MarginalFuel';
import ResourceGap from '@/react-app/components/tabs/ResourceGap';
import Convergence from '@/react-app/components/tabs/Convergence';

const TABS = [
  { id: 'generation',   label: 'Generation Mix' },
  { id: 'price',        label: 'Price Intelligence' },
  { id: 'spark',        label: 'Spark Spread' },
  { id: 'battery',      label: 'Battery Arbitrage' },
  { id: 'marginal',     label: 'Marginal Fuel' },
  { id: 'resource',     label: 'Resource Gap' },
  { id: 'convergence',  label: 'Convergence' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function App() {
  const [activeTab, setActiveTab]     = useState<TabId>('generation');
  const [selectedZone, setSelectedZone] = useState('BGE');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <span className="text-xl font-bold tracking-tight">GridAlpha</span>
          <span className="text-xs text-muted-foreground ml-1">PJM Market Intelligence</span>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="border-b border-border px-6">
        <div className="max-w-screen-xl mx-auto flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      <main className="max-w-screen-xl mx-auto px-6 py-8">
        {activeTab === 'generation'  && <GenerationMix />}
        {activeTab === 'price'       && (
          <PriceIntelligence
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
          />
        )}
        {activeTab === 'spark'       && <SparkSpread />}
        {activeTab === 'battery'     && (
          <BatteryArbitrage
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
          />
        )}
        {activeTab === 'marginal'    && (
          <MarginalFuel
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
          />
        )}
        {activeTab === 'resource'    && (
          <ResourceGap
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
          />
        )}
        {activeTab === 'convergence' && (
          <Convergence
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
          />
        )}
      </main>
    </div>
  );
}
