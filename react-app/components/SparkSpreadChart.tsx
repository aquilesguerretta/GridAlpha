import { Card } from '@/react-app/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { SparkSpreadData } from '@/react-app/data/sparkSpreadData';

interface SparkSpreadChartProps {
  data: SparkSpreadData[];
}

export default function SparkSpreadChart({ data }: SparkSpreadChartProps) {
  return (
    <Card className="p-6 bg-card border-border backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Spark Spread by Zone</h3>
        <p className="text-sm text-muted-foreground">
          Gas plant profitability across PJM zones
        </p>
      </div>
      
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis 
            type="number"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: '$/MWh', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis 
            type="category"
            dataKey="zone"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
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
              return [`$${numVal.toFixed(2)}/MWh`, 'Spark Spread'];
            }}
          />
          <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
          <Bar dataKey="spread" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.spread >= 0 ? 'hsl(var(--secondary))' : 'hsl(var(--destructive))'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      
      <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-secondary" />
          <span>Profitable (Positive spread)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-destructive" />
          <span>Unprofitable (Negative spread)</span>
        </div>
      </div>
    </Card>
  );
}
