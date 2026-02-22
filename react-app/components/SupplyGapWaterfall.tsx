import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Card } from './ui/card';

interface Props {
  currentCapacity: number;
  retirements: number;
  newProjects: number;
  loadForecast: number;
}

export default function SupplyGapWaterfall({ currentCapacity, retirements, newProjects, loadForecast }: Props) {
  const netCapacity = currentCapacity + retirements + newProjects;
  const gap = netCapacity - loadForecast;
  const data = [
    { label: 'Current Cap.',  value: currentCapacity, fill: '#6366f1' },
    { label: 'Retirements',   value: retirements,      fill: '#ef4444' },
    { label: 'New Projects',  value: newProjects,       fill: '#10b981' },
    { label: 'Load Forecast', value: -loadForecast,     fill: '#f97316' },
    { label: 'Net Gap',       value: gap,               fill: gap >= 0 ? '#10b981' : '#ef4444' },
  ];
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-lg font-semibold mb-4">Supply Gap Waterfall (MW)</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 20, left: 20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} unit=" MW" />
          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="value" name="MW">
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
