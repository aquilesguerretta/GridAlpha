import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from './ui/card';

const COLORS = { nuclear: '#6366f1', gas: '#f97316', coal: '#78716c', wind: '#06b6d4', solar: '#eab308', hydro: '#3b82f6', storage: '#a855f7' };

interface Props {
  data: { timestamp: string; nuclear: number; gas: number; coal: number; wind: number; solar: number; hydro: number; storage: number }[];
}

export default function GenerationChart({ data }: Props) {
  const formatted = data.map(d => ({ ...d, label: d.timestamp.slice(11, 16) }));
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold mb-4">Generation Mix Over Time</h3>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={formatted} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} unit=" MW" />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
          <Legend />
          {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map(fuel => (
            <Area key={fuel} type="monotone" dataKey={fuel} stackId="1" stroke={COLORS[fuel]} fill={COLORS[fuel]} fillOpacity={0.6} name={fuel.charAt(0).toUpperCase() + fuel.slice(1)} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
