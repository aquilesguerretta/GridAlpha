import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from './ui/card';

interface Props {
  data: { timestamp: string; energy: number; congestion: number; loss: number }[];
}

export default function LMPComponentsChart({ data }: Props) {
  const formatted = data.map(d => ({ ...d, label: d.timestamp.slice(11, 16) }));
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold mb-4">LMP Components Breakdown</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={formatted} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} unit=" $/MWh" />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
          <Legend />
          <Bar dataKey="energy" stackId="a" fill="#6366f1" name="Energy" />
          <Bar dataKey="congestion" stackId="a" fill="#f97316" name="Congestion" />
          <Bar dataKey="loss" stackId="a" fill="#3b82f6" name="Loss" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
