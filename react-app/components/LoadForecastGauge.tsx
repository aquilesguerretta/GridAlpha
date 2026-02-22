import { Activity } from 'lucide-react';
import { Card } from './ui/card';

interface Props {
  forecast: number;
  actual: number;
  deviationPct: number;
  isUncertaintyDriver: boolean;
}

export default function LoadForecastGauge({ forecast, actual, deviationPct, isUncertaintyDriver }: Props) {
  const positive = deviationPct >= 0;
  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center gap-3 mb-3">
        <Activity className="w-5 h-5 text-primary" />
        <h4 className="text-sm font-semibold">Load Forecast vs Actual</h4>
        {isUncertaintyDriver && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 ml-auto">
            High Uncertainty
          </span>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Forecast</span>
          <span className="font-semibold">{forecast.toLocaleString()} MW</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Actual</span>
          <span className="font-semibold">{actual.toLocaleString()} MW</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Deviation</span>
          <span className={`font-bold ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
            {positive ? '+' : ''}{deviationPct.toFixed(2)}%
          </span>
        </div>
      </div>
    </Card>
  );
}
