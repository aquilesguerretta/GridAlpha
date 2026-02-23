import { Card } from '@/react-app/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface LoadForecastGaugeProps {
  forecast: number;
  actual: number;
  deviationPct: number;
  isUncertaintyDriver: boolean;
}

export default function LoadForecastGauge({ 
  forecast, 
  actual, 
  deviationPct,
  isUncertaintyDriver 
}: LoadForecastGaugeProps) {
  const gaugeColor = isUncertaintyDriver ? 'bg-red-500' : 'bg-emerald-500';
  const textColor = isUncertaintyDriver ? 'text-red-500' : 'text-emerald-500';
  
  // Calculate gauge fill percentage (0-100%)
  const gaugeFill = Math.min(100, Math.max(0, 50 + deviationPct * 5));

  return (
    <Card className={`p-4 border-border ${isUncertaintyDriver ? 'bg-red-950/20 border-red-500/50' : 'bg-card'}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Load vs Forecast</p>
          {isUncertaintyDriver && (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          )}
        </div>
        
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">{(actual / 1000).toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">vs {(forecast / 1000).toFixed(1)} GW</span>
          </div>
          
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full ${gaugeColor} transition-all duration-300`}
              style={{ width: `${gaugeFill}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${textColor}`}>
              {deviationPct > 0 ? '+' : ''}{deviationPct.toFixed(1)}%
            </span>
            {isUncertaintyDriver && (
              <span className="text-red-500 font-semibold">UNCERTAINTY DRIVER</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
