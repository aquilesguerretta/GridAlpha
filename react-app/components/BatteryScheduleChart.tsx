import { Card } from '@/react-app/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { BatteryAction } from '@/react-app/data/batteryArbitrageData';

interface BatteryScheduleChartProps {
  data: BatteryAction[];
}

export default function BatteryScheduleChart({ data }: BatteryScheduleChartProps) {
  const getBarColor = (action: string) => {
    if (action === 'charge') return 'hsl(var(--primary))'; // Blue
    if (action === 'discharge') return '#f97316'; // Orange
    return 'hsl(var(--muted))'; // Gray for idle
  };

  return (
    <Card className="p-6 bg-card border-border backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">24-Hour Charge/Discharge Schedule</h3>
        <p className="text-sm text-muted-foreground">
          Optimal battery operations for price arbitrage
        </p>
      </div>
      
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis 
            dataKey="hour"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(hour) => `${hour}:00`}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
            formatter={(value: unknown, _name: string | undefined, props: { payload?: BatteryAction }) => {
              if (value === undefined || value === null || !props.payload) return ['', ''];
              const action = props.payload.action;
              const price = props.payload.price;
              
              if (action === 'idle') {
                return ['Spread insufficient to cover cycling hurdle', ''];
              }
              
              const actionLabel = action === 'charge' ? 'Charging' : 'Discharging';
              const numVal = typeof value === 'number' ? value : 0;
              return [
                `${Math.abs(numVal)} MW ${actionLabel} @ $${price.toFixed(2)}/MWh`,
                '',
              ];
            }}
            labelFormatter={(label: unknown) => {
              const hour = typeof label === 'number' ? label : 0;
              return `Hour ${hour}:00`;
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
          <Bar dataKey="mw" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.action)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      
      <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary" />
          <span>Charging (Buy power)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f97316' }} />
          <span>Discharging (Sell power)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-muted" />
          <span>Idle</span>
        </div>
      </div>
    </Card>
  );
}
