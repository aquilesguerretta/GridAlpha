import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/react-app/components/ui/card';
import type { LMPDataPoint } from '@/react-app/data/lmpData';

interface LMPTimeSeriesChartProps {
  data: LMPDataPoint[];
  zoneName: string;
  isUncertaintyDriver?: boolean;
}

export default function LMPTimeSeriesChart({ data, zoneName, isUncertaintyDriver = false }: LMPTimeSeriesChartProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  };

  const formatPrice = (value: number) => `$${value.toFixed(0)}`;
  
  // Calculate average and identify spikes
  const avgLMP = data.reduce((sum, d) => sum + d.total, 0) / data.length;
  const spikeThreshold = avgLMP * 1.3; // 30% above average is a spike

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          24-Hour LMP Trend - {zoneName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="lmpGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatTime}
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              tickFormatter={formatPrice}
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: unknown) => {
                if (value === undefined || value === null) return ['', ''];
                const numVal = typeof value === 'number' ? value : 0;
                return [`$${numVal.toFixed(2)}/MWh`, 'LMP'];
              }}
              labelFormatter={(label) => new Date(label).toLocaleString()}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0 || !label) return null;
                
                const value = payload[0].value as number;
                const isSpike = value > spikeThreshold;
                
                return (
                  <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                    <p className="text-xs text-muted-foreground mb-1">
                      {new Date(label as string).toLocaleString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                      })}
                    </p>
                    <p className="text-lg font-semibold mb-2">
                      ${value.toFixed(2)}/MWh
                    </p>
                    {isSpike && isUncertaintyDriver && (
                      <p className="text-xs text-amber-400 mt-2 border-t border-border pt-2">
                        ⚠️ Price spike correlated with load forecast error in this zone
                      </p>
                    )}
                    {isSpike && !isUncertaintyDriver && (
                      <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
                        Price spike likely due to supply constraints or transmission congestion
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Line 
              type="monotone" 
              dataKey="total" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
