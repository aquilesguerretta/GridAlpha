import { useState } from 'react';
import { Circle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/react-app/components/ui/tooltip';

type SyncStatus = 'live' | 'stale' | 'down';

interface DataSource {
  name: string;
  lastUpdated: string;
}

export default function SyncStatusIndicator() {
  // Demo mode - using stale status
  const [status] = useState<SyncStatus>('stale');
  const [dataSources] = useState<DataSource[]>([
    { name: 'Generation Mix', lastUpdated: '2024-01-15 14:30 EST' },
    { name: 'LMP Pricing', lastUpdated: '2024-01-15 14:30 EST' },
    { name: 'Weather & Load', lastUpdated: '2024-01-15 14:25 EST' },
    { name: 'Convergence', lastUpdated: '2024-01-15 14:30 EST' },
  ]);

  const statusConfig = {
    live: {
      color: 'text-green-500',
      label: 'LIVE',
      description: 'Real-time data feed active',
    },
    stale: {
      color: 'text-amber-500',
      label: 'DEMO MODE',
      description: 'Using sample dataset',
    },
    down: {
      color: 'text-red-500',
      label: 'DOWN',
      description: 'Connection failed',
    },
  };

  const config = statusConfig[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="relative">
              <Circle
                className={`w-2 h-2 ${config.color} fill-current ${
                  status === 'live' || status === 'stale' ? 'animate-pulse' : ''
                }`}
              />
            </div>
            <span className={`text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-semibold">{config.description}</p>
            <div className="space-y-1 text-xs">
              <p className="font-medium text-muted-foreground">Last Updated:</p>
              {dataSources.map((source) => (
                <div key={source.name} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{source.name}:</span>
                  <span className="font-mono">{source.lastUpdated}</span>
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
