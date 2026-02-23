import { Card } from '@/react-app/components/ui/card';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { LineChart, Line as SimpleLine } from 'recharts';
import { fuelColors, GenerationDataPoint } from '@/react-app/data/generationData';

interface GenerationChartProps {
  data: GenerationDataPoint[];
}

export default function GenerationChart({ data }: GenerationChartProps) {
  const chartData = data.map((d, i) => ({
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    hourLabel: `${i}h`,
    Nuclear: Math.round(d.nuclear),
    Gas: Math.round(d.gas),
    Coal: Math.round(d.coal),
    Wind: Math.round(d.wind),
    Solar: Math.round(d.solar),
    Hydro: Math.round(d.hydro),
    Temperature: d.temperature,
  }));

  const loadData = data.map((d, i) => ({
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    hourLabel: `${i}h`,
    Forecast: Math.round(d.load_forecast),
    Actual: Math.round(d.load_actual),
  }));

  const tickInterval = Math.max(0, Math.floor(data.length / 8) - 1);

  return (
    <Card className="p-6 bg-card border-border">
      <h2 className="text-xl font-semibold mb-6">Generation Mix - Last 24 Hours</h2>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="nuclearGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fuelColors.nuclear} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={fuelColors.nuclear} stopOpacity={0.2}/>
            </linearGradient>
            <linearGradient id="gasGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fuelColors.gas} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={fuelColors.gas} stopOpacity={0.2}/>
            </linearGradient>
            <linearGradient id="coalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fuelColors.coal} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={fuelColors.coal} stopOpacity={0.2}/>
            </linearGradient>
            <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fuelColors.wind} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={fuelColors.wind} stopOpacity={0.2}/>
            </linearGradient>
            <linearGradient id="solarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fuelColors.solar} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={fuelColors.solar} stopOpacity={0.2}/>
            </linearGradient>
            <linearGradient id="hydroGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fuelColors.hydro} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={fuelColors.hydro} stopOpacity={0.2}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="hourLabel"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            interval={tickInterval}
          />
          <YAxis 
            yAxisId="left"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="#fbbf24"
            tick={{ fill: '#fbbf24' }}
            label={{ value: '°F', angle: 90, position: 'insideRight', fill: '#fbbf24' }}
            domain={[30, 70]}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--popover))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              maxWidth: '300px'
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(value: unknown) => {
              if (value === undefined || value === null) return ['', ''];
              const numVal = typeof value === 'number' ? value : 0;
              return [`${numVal.toLocaleString()} MW`, ''];
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
          />
          <Area yAxisId="left" type="monotone" dataKey="Nuclear" stackId="1" stroke={fuelColors.nuclear} fill="url(#nuclearGradient)" />
          <Area yAxisId="left" type="monotone" dataKey="Gas" stackId="1" stroke={fuelColors.gas} fill="url(#gasGradient)" />
          <Area yAxisId="left" type="monotone" dataKey="Coal" stackId="1" stroke={fuelColors.coal} fill="url(#coalGradient)" />
          <Area yAxisId="left" type="monotone" dataKey="Wind" stackId="1" stroke={fuelColors.wind} fill="url(#windGradient)" />
          <Area yAxisId="left" type="monotone" dataKey="Solar" stackId="1" stroke={fuelColors.solar} fill="url(#solarGradient)" />
          <Area yAxisId="left" type="monotone" dataKey="Hydro" stackId="1" stroke={fuelColors.hydro} fill="url(#hydroGradient)" />
          <Line yAxisId="right" type="monotone" dataKey="Temperature" stroke="#fbbf24" strokeWidth={3} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Load Forecast Sparkline */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Load Forecast vs Actual</h3>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={loadData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="hourLabel"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              interval={tickInterval}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              width={60}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
                fontSize: '12px'
              }}
              formatter={(value: unknown) => {
                if (value === undefined || value === null) return ['', ''];
                const numVal = typeof value === 'number' ? value : 0;
                return [`${numVal.toLocaleString()} MW`, ''];
              }}
            />
            <SimpleLine type="monotone" dataKey="Forecast" stroke="#6b7280" strokeWidth={2} dot={false} name="Forecast" />
            <SimpleLine type="monotone" dataKey="Actual" stroke="#ffffff" strokeWidth={2} dot={false} name="Actual" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
