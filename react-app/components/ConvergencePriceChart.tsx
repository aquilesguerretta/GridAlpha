import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from './ui/card';

interface Props {
  data: { hour: number; da_price: number; rt_price: number; spread: number }[];
}

export default function ConvergencePriceChart({ data }: Props) {
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold mb-4">DA vs RT Price Convergence</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} label={{ value: 'Hour', position: 'insideBottom', offset: -4 }} />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} unit=" $/MWh" />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
          <Legend />
          <Line type="monotone" dataKey="da_price" stroke="#6366f1" strokeWidth={2} dot={false} name="Day-Ahead" />
          <Line type="monotone" dataKey="rt_price" stroke="#f97316" strokeWidth={2} dot={false} name="Real-Time" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
