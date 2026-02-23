import { useState, useEffect } from 'react';
import { TrendingUp, Fuel, AlertCircle } from 'lucide-react';
import { sparkSpreadData as stubSparkSpreadData, getProfitabilitySignal } from '@/react-app/data/sparkSpreadData';
import SparkSpreadChart from '@/react-app/components/SparkSpreadChart';
import KpiCard from '@/react-app/components/KpiCard';
import { Card } from '@/react-app/components/ui/card';
import { Input } from '@/react-app/components/ui/input';

interface SparkSpreadDataItem {
  zone: string;
  spread: number;
}

export default function SparkSpread() {
  const [gasPrice, setGasPrice] = useState(4.0);
  const [heatRate, setHeatRate] = useState(7.0);
  const [sparkSpreadData, setSparkSpreadData] = useState<SparkSpreadDataItem[]>(stubSparkSpreadData);

  useEffect(() => {
    const fetchSparkSpread = async () => {
      try {
        const response = await fetch(
          `https://gridalpha-production.up.railway.app/spark-spread?heat_rate=${heatRate}&gas_price=${gasPrice}`
        );
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const result = await response.json();
        
        // Map the response data to our component format
        const mappedData: SparkSpreadDataItem[] = result.data?.map((item: any) => {
          let zoneName = item.zone_name;
          // Add dash prefix for hubs to maintain existing hub/zone separation logic
          if (zoneName === 'WEST HUB' || zoneName === 'EAST HUB') {
            zoneName = `— ${zoneName}`;
          }
          return {
            zone: zoneName,
            spread: item.spark_spread,
          };
        }) || [];
        
        if (mappedData.length > 0) {
          setSparkSpreadData(mappedData);
        } else {
          // Fallback to stub data if no data returned
          setSparkSpreadData(stubSparkSpreadData);
        }
      } catch (error) {
        // Silently fall back to stub data on error
        setSparkSpreadData(stubSparkSpreadData);
      }
    };

    fetchSparkSpread();
  }, [gasPrice, heatRate]);

  // Validation
  const gasPriceError = gasPrice < 0.5 || gasPrice > 20.0
    ? 'Gas price must be between $0.50 and $20.00/MMBtu'
    : null;
  const heatRateError = heatRate < 5 || heatRate > 15
    ? 'Heat rate must be between 5 and 15 MMBtu/MWh'
    : null;

  // Calculate metrics from current data
  const averageSparkSpread = sparkSpreadData.reduce((sum, d) => sum + d.spread, 0) / sparkSpreadData.length;
  const signal = getProfitabilitySignal(averageSparkSpread);
  const positiveZones = sparkSpreadData.filter(d => d.spread > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Spark Spread Analysis</h2>
        <p className="text-sm text-muted-foreground">
          Real-time gas plant profitability metrics across PJM
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="System Average"
          value={averageSparkSpread.toFixed(2)}
          unit="$/MWh"
          trend={3.6}
          icon={<TrendingUp className="w-10 h-10" />}
        />
        <KpiCard
          title="Profitable Zones"
          value={positiveZones.toString()}
          unit={`of ${sparkSpreadData.length}`}
          trend={-2.1}
          icon={<Fuel className="w-10 h-10" />}
        />
        
        {/* Profitability Signal Card */}
        <Card className="p-6 bg-card border-border backdrop-blur-sm">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm font-medium mb-2">
                Plant Profitability Signal
              </p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-3xl font-bold tracking-tight ${signal.color}`}>
                  {signal.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {signal.description}
              </p>
            </div>
            <div className={`${signal.color} opacity-20`}>
              <AlertCircle className="w-10 h-10" />
            </div>
          </div>
        </Card>
      </div>

      {/* Chart */}
      <SparkSpreadChart data={sparkSpreadData} />

      {/* Assumptions Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 bg-card border-border backdrop-blur-sm">
          <h4 className="text-sm font-semibold mb-3">Calculation Assumptions</h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                Henry Hub Gas Price ($/MMBtu):
              </label>
              <Input
                type="number"
                value={gasPrice}
                onChange={(e) => setGasPrice(Number(e.target.value))}
                min={0.5}
                max={20.0}
                step={0.1}
                className="w-full"
              />
              {gasPriceError && (
                <p className="text-xs text-red-500 mt-1 font-medium">
                  {gasPriceError}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                Heat Rate (MMBtu/MWh):
              </label>
              <Input
                type="number"
                value={heatRate}
                onChange={(e) => setHeatRate(Number(e.target.value))}
                min={5}
                max={15}
                step={0.1}
                className="w-full"
              />
              {heatRateError && (
                <p className="text-xs text-red-500 mt-1 font-medium">
                  {heatRateError}
                </p>
              )}
            </div>
          </div>
        </Card>
        
        <Card className="p-4 bg-card border-border backdrop-blur-sm">
          <h4 className="text-sm font-semibold mb-3">Formula</h4>
          <p className="text-sm text-muted-foreground">
            <strong>Spark Spread</strong> = LMP - (Gas Price × Heat Rate) - Variable O&M
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Positive values indicate profitable conditions for gas generation.
          </p>
        </Card>
      </div>
    </div>
  );
}
