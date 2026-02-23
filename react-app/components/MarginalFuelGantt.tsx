import { Card } from '@/react-app/components/ui/card';

interface MarginalFuelGanttProps {
  timeline: Array<{
    hour: number;
    fuel_type: 'Nuclear' | 'Coal' | 'Gas' | 'Wind' | 'Solar';
  }>;
}

const fuelColors = {
  Nuclear: '#8b5cf6', // Purple
  Coal: '#6b7280', // Gray
  Gas: '#f97316', // Orange
  Wind: '#10b981', // Green
  Solar: '#eab308', // Yellow
};

export default function MarginalFuelGantt({ timeline }: MarginalFuelGanttProps) {
  return (
    <Card className="p-6 bg-card border-border backdrop-blur-sm">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">24-Hour Merit Order Timeline</h3>
          <p className="text-sm text-muted-foreground">
            Fuel type setting marginal price each hour
          </p>
        </div>

        {/* Gantt Chart */}
        <div className="space-y-3">
          {/* Hour labels */}
          <div className="flex">
            {timeline.map((item) => (
              <div
                key={item.hour}
                className="flex-1 text-center text-xs text-muted-foreground"
                style={{ fontSize: '10px' }}
              >
                {item.hour === 0 || item.hour % 3 === 0 ? `${item.hour}h` : ''}
              </div>
            ))}
          </div>

          {/* Color blocks */}
          <div className="flex gap-px rounded-lg overflow-hidden border border-border">
            {timeline.map((item) => (
              <div
                key={item.hour}
                className="flex-1 h-16 relative group cursor-pointer transition-all hover:brightness-110"
                style={{ backgroundColor: fuelColors[item.fuel_type] }}
                title={`${item.hour}:00 - ${item.fuel_type}`}
              >
                {/* Tooltip on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white text-xs font-medium">
                  {item.fuel_type}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-border">
          {Object.entries(fuelColors).map(([fuel, color]) => (
            <div key={fuel} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm text-muted-foreground">{fuel}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
