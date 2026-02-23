import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/react-app/components/ui/card';
import type { LMPDataPoint } from '@/react-app/data/lmpData';

interface LMPComponentsChartProps {
  data: LMPDataPoint[];
}

export default function LMPComponentsChart({ data }: LMPComponentsChartProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  };

  const formatPrice = (value: number) => `$${value.toFixed(0)}`;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader>
        <CardTitle>LMP Components Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatTime}
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              tickFormatter={formatPrice}
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: unknown, name: string | undefined) => {
                if (value === undefined || value === null || name === undefined) return ['', ''];
                const numVal = typeof value === 'number' ? value : 0;
                const labels: Record<string, string> = {
                  energy: 'Energy',
                  congestion: 'Congestion',
                  loss: 'Loss',
                };
                return [`$${numVal.toFixed(2)}/MWh`, labels[name] || name];
              }}
              labelFormatter={(label) => new Date(label).toLocaleString()}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => {
                const labels: Record<string, string> = {
                  energy: 'Energy',
                  congestion: 'Congestion',
                  loss: 'Loss',
                };
                return labels[value] || value;
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
            <Bar dataKey="energy" stackId="a" fill="#3b82f6" />
            <Bar dataKey="congestion" stackId="a" fill="#10b981" />
            <Bar dataKey="loss" stackId="a" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[#10b981]"></span>
            Note: Negative congestion indicates counter-flow conditions (being paid to use transmission)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
