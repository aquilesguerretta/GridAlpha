import { Cloud, Sun, AlertTriangle } from 'lucide-react';
import { Card } from './ui/card';

interface Props {
  temperature: number;
  condition: string;
  alert: string | null;
}

export default function WeatherCard({ temperature, condition, alert }: Props) {
  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center gap-3 mb-3">
        <Sun className="w-5 h-5 text-yellow-400" />
        <h4 className="text-sm font-semibold">Current Conditions</h4>
      </div>
      <div className="text-4xl font-bold mb-1">{temperature.toFixed(1)}°F</div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Cloud className="w-4 h-4" />
        {condition}
      </div>
      {alert && alert !== 'Normal' && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-md px-3 py-2 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {alert}
        </div>
      )}
    </Card>
  );
}
