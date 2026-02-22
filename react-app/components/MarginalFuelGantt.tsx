import { Card } from './ui/card';

const FUEL_COLORS: Record<string, string> = {
  Gas: '#f97316', Nuclear: '#6366f1', Wind: '#06b6d4',
  Coal: '#78716c', Solar: '#eab308', Hydro: '#3b82f6', Other: '#a855f7',
};

interface Props {
  timeline: Array<{ hour: number; fuel_type: string }>;
}

export default function MarginalFuelGantt({ timeline }: Props) {
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold mb-4">24-Hour Marginal Fuel Timeline</h3>
      <div className="flex h-12 rounded-md overflow-hidden border border-border">
        {timeline.map((h, i) => (
          <div
            key={i}
            title={`Hour ${h.hour}: ${h.fuel_type}`}
            className="flex-1 flex items-center justify-center text-xs font-bold text-white/80 cursor-default"
            style={{ backgroundColor: FUEL_COLORS[h.fuel_type] ?? FUEL_COLORS['Other'] }}
          >
            {i % 4 === 0 ? h.fuel_type.slice(0, 3) : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(FUEL_COLORS).map(([fuel, color]) => (
          <span key={fuel} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: color }} />
            {fuel}
          </span>
        ))}
      </div>
    </Card>
  );
}
