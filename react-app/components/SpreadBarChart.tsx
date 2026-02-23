import { Card } from '@/react-app/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { ConvergenceHourlyData } from '@/react-app/data/convergenceData';

interface SpreadBarChartProps {
  data: ConvergenceHourlyData[];
}

export default function SpreadBarChart({ data }: SpreadBarChartProps) {
  return (
    <Card className="p-6 bg-card border-border backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">RT-DA Spread Analysis</h3>
        <p className="text-sm text-muted-foreground">
          Green = profitable for virtual buyers, Red = oversupply
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="hour"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: 'Hour', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(hour) => `${hour}:00`}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: 'Spread ($/MWh)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
            formatter={(value: unknown) => {
              if (value === undefined || value === null) return ['', ''];
              const numVal = typeof value === 'number' ? value : 0;
              const label = numVal > 0 ? 'Scarcity (RT > DA)' : 'Oversupply (RT < DA)';
              return [`$${numVal.toFixed(2)}/MWh - ${label}`, ''];
            }}
            labelFormatter={(label: unknown) => {
              const hour = typeof label === 'number' ? label : 0;
              return `Hour ${hour}:00`;
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
          <Bar dataKey="spread" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.spread > 0 ? '#10b981' : '#ef4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
