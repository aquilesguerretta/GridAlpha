import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Card } from './ui/card';
import { BatteryAction } from '../data/batteryArbitrageData';

interface Props { data: BatteryAction[] }

export default function BatteryScheduleChart({ data }: Props) {
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold mb-4">Battery Schedule (MW)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} label={{ value: 'Hour (EPT)', position: 'insideBottom', offset: -4 }} />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} unit=" MW" />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(val: number) => [`${val} MW`, 'Power']} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="mw" name="Power">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.action === 'charge' ? '#6366f1' : entry.action === 'discharge' ? '#f97316' : 'hsl(var(--muted))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-indigo-500 mr-1" />Charging</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-orange-500 mr-1" />Discharging</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-muted mr-1" />Idle</span>
      </div>
    </Card>
  );
}
