import { Link, useLocation } from 'react-router';
import { Zap, Activity, DollarSign, Flame, Battery, Gauge, TrendingDown, GitMerge, FileText } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import SyncStatusIndicator from '@/react-app/components/SyncStatusIndicator';

export default function Navigation() {
  const location = useLocation();

  const tabs = [
    { path: '/', label: 'Generation', icon: Activity },
    { path: '/pricing', label: 'Price Intelligence', icon: DollarSign },
    { path: '/spark-spread', label: 'Spark Spread', icon: Flame },
    { path: '/battery-arbitrage', label: 'Battery Arbitrage', icon: Battery },
    { path: '/marginal-fuel', label: 'Marginal Fuel', icon: Gauge },
    { path: '/resource-gap', label: 'Resource Gap', icon: TrendingDown },
    { path: '/convergence', label: 'Convergence', icon: GitMerge },
    { path: '/methods', label: 'Methods', icon: FileText },
  ];

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="flex items-center justify-between py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary">
              <Zap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">GridAlpha</h1>
              <p className="text-sm text-muted-foreground">PJM Market Intelligence</p>
            </div>
          </div>
          <SyncStatusIndicator />
        </div>

        {/* Tabs - horizontally scrollable on mobile, does not propagate scroll to page */}
        <div
          className="flex gap-1 pt-2 overflow-x-auto scrollbar-hide overscroll-x-contain touch-pan-x -mx-6 px-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
          role="tablist"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors shrink-0',
                  isActive
                    ? 'bg-background text-foreground border-t border-x border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
