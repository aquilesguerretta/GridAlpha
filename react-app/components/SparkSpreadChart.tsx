import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { Card } from './ui/card';

interface Props {
  data: { zone: string; spread: number }[];
}

export default function SparkSpreadChart({ data }: Props) {
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold mb-4">Spark Spread by Zone</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 60, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} unit=" $/MWh" />
          <YAxis type="category" dataKey="zone" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
          <Bar dataKey="spread" name="Spark Spread">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.spread >= 0 ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
