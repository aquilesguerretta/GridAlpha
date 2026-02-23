import { Card } from '@/react-app/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ConvergenceHourlyData } from '@/react-app/data/convergenceData';

interface ConvergencePriceChartProps {
  data: ConvergenceHourlyData[];
}

export default function ConvergencePriceChart({ data }: ConvergencePriceChartProps) {
  return (
    <Card className="p-6 bg-card border-border backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Day-Ahead vs Real-Time Prices</h3>
        <p className="text-sm text-muted-foreground">
          24-hour price convergence ($/MWh)
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
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
            label={{ value: '$/MWh', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
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
              return [`$${numVal.toFixed(2)}/MWh`, ''];
            }}
            labelFormatter={(label: unknown) => {
              const hour = typeof label === 'number' ? label : 0;
              return `Hour ${hour}:00`;
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="da_price"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Day-Ahead"
          />
          <Line
            type="monotone"
            dataKey="rt_price"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            name="Real-Time"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
