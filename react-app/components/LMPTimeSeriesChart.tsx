import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from './ui/card';

interface Props {
  data: { timestamp: string; total: number; energy: number; congestion: number; loss: number }[];
  zoneName: string;
  isUncertaintyDriver: boolean;
}

export default function LMPTimeSeriesChart({ data, zoneName, isUncertaintyDriver }: Props) {
  const formatted = data.map(d => ({ ...d, label: d.timestamp.slice(11, 16) }));
  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">LMP Time Series — {zoneName}</h3>
        {isUncertaintyDriver && <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">High Uncertainty</span>}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={formatted} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} unit=" $/MWh" />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
          <Legend />
          <Line type="monotone" dataKey="total" stroke="#06b6d4" strokeWidth={2} dot={false} name="Total LMP" />
          <Line type="monotone" dataKey="energy" stroke="#6366f1" strokeWidth={1.5} dot={false} name="Energy" />
          <Line type="monotone" dataKey="congestion" stroke="#f97316" strokeWidth={1.5} dot={false} name="Congestion" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
