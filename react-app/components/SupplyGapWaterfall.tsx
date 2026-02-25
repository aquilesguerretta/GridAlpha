import { Card } from '@/react-app/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface SupplyGapWaterfallProps {
  currentCapacity: number;
  retirements: number; // negative value
  newProjects: number;
  loadForecast: number;
}

export default function SupplyGapWaterfall({
  currentCapacity,
  retirements,
  newProjects,
  loadForecast,
}: SupplyGapWaterfallProps) {
  const netPosition = currentCapacity + retirements + newProjects;
  const gap = netPosition - loadForecast;
  
  // Build waterfall data — Fix 10: Load Forecast bar distinct (white/light gray, dashed outline)
  const data = [
    {
      name: 'Current\nCapacity',
      value: currentCapacity,
      displayValue: currentCapacity,
      fill: 'hsl(var(--muted))',
      isBase: true,
      isLoadForecast: false,
    },
    {
      name: 'Scheduled\nRetirements',
      value: retirements,
      displayValue: currentCapacity + retirements,
      fill: '#ef4444',
      isBase: false,
      isLoadForecast: false,
    },
    {
      name: 'New\nProjects',
      value: newProjects,
      displayValue: currentCapacity + retirements + newProjects,
      fill: '#10b981',
      isBase: false,
      isLoadForecast: false,
    },
    {
      name: 'Net\nPosition',
      value: netPosition,
      displayValue: netPosition,
      fill: gap >= 0 ? 'hsl(var(--primary))' : '#ef4444',
      isBase: true,
      isLoadForecast: false,
    },
    {
      name: 'Load\nForecast',
      value: loadForecast,
      displayValue: loadForecast,
      fill: '#e5e7eb',
      stroke: 'hsl(var(--muted-foreground))',
      strokeDasharray: '5 5',
      isBase: true,
      isLoadForecast: true,
    },
  ];
  
  return (
    <Card className="p-6 bg-card border-border backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Supply Gap Analysis</h3>
        <p className="text-sm text-muted-foreground">
          Capacity waterfall vs. load forecast (MW)
        </p>
      </div>
      
      <ResponsiveContainer width="100%" height={480}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          barCategoryGap="10%"
          barGap={8}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            interval={0}
            angle={0}
            textAnchor="middle"
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: 'Capacity (MW)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
            formatter={(value: unknown, _name: unknown, props: { payload?: { name?: string; isLoadForecast?: boolean; isBase?: boolean } }) => {
              if (value === undefined || value === null || !props.payload) return ['', ''];
              const numVal = typeof value === 'number' ? value : 0;
              if (props.payload.name === 'Load\nForecast' || props.payload.isLoadForecast) {
                return [`${numVal.toLocaleString()} MW (Target)`, ''];
              }
              if (props.payload.isBase) {
                return [`${numVal.toLocaleString()} MW`, ''];
              }
              const sign = numVal >= 0 ? '+' : '';
              return [`${sign}${numVal.toLocaleString()} MW`, ''];
            }}
            labelFormatter={(label: unknown) => {
              const labelStr = typeof label === 'string' ? label : String(label);
              return labelStr.replace('\n', ' ');
            }}
          />
          <ReferenceLine y={loadForecast} stroke="#f97316" strokeDasharray="5 5" strokeWidth={2} />
          <Bar dataKey="displayValue" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill}
                stroke={entry.isLoadForecast ? entry.stroke : undefined}
                strokeDasharray={entry.isLoadForecast ? entry.strokeDasharray : undefined}
                strokeWidth={entry.isLoadForecast ? 2 : undefined}
                opacity={entry.isLoadForecast ? 1 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      
      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">Net Position</p>
            <p className="text-xl font-bold">{netPosition.toLocaleString()} MW</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Load Forecast</p>
            <p className="text-xl font-bold">{loadForecast.toLocaleString()} MW</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Gap</p>
            <p className={`text-xl font-bold ${gap >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {gap >= 0 ? '+' : ''}{gap.toLocaleString()} MW
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
