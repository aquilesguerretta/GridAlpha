import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { convergenceDataByZone as stubData } from '@/react-app/data/convergenceData';
import { zones } from '@/react-app/data/lmpData';
import ConvergencePriceChart from '@/react-app/components/ConvergencePriceChart';
import SpreadBarChart from '@/react-app/components/SpreadBarChart';
import KpiCard from '@/react-app/components/KpiCard';
import { Card } from '@/react-app/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/react-app/components/ui/select';

interface HourlyDataPoint {
  hour: number;
  da_price: number;
  rt_price: number;
  spread: number;
}

interface ConvergenceData {
  cumulative_spread: number;
  total_scarcity_hours: number;
  total_oversupply_hours: number;
  market_narrative: string;
  dominant_signal: string;
  hourly_data: HourlyDataPoint[];
}

interface ConvergenceProps {
  selectedZone: string;
  setSelectedZone: (zone: string) => void;
}

export default function Convergence({ selectedZone, setSelectedZone }: ConvergenceProps) {
  const [data, setData] = useState<ConvergenceData>(stubData[selectedZone]);

  useEffect(() => {
	const fetchConvergenceData = async () => {
  try {
    const response = await fetch(`http://localhost:8000/api/convergence?zone=${selectedZone}`);
    if (!response.ok) {
      throw new Error('API request failed');
    }
    const result = await response.json();

    const mappedHourlyData: HourlyDataPoint[] = result.data?.map((item: any) => ({
      hour: new Date(item.hour).getHours(),
      da_price: item.da_price,
      rt_price: item.rt_price,
      spread: item.spread,
    })) || [];

    const cumulativeSpread = mappedHourlyData.reduce((sum, d) => sum + d.spread, 0);

    const apiData: ConvergenceData = {
      cumulative_spread: cumulativeSpread,
      total_scarcity_hours: result.summary?.scarcity_hours || 0,
      total_oversupply_hours: result.summary?.oversupply_hours || 0,
      market_narrative: result.summary?.market_narrative || '',
      dominant_signal: result.summary?.dominant_signal || 'MIXED',
      hourly_data: mappedHourlyData,
    };

    if (mappedHourlyData.length > 0) {
      setData(apiData);
    } else {
      setData(stubData[selectedZone]);
    }
  } catch (error) {
    setData(stubData[selectedZone]);
  }
	};

	fetchConvergenceData();
  }, [selectedZone]);

  const avgSpread = data.cumulative_spread / 24;

  const getSignalBadgeStyle = (signal: string) => {
	switch (signal) {
  case 'VIRTUAL_BUYER':
    return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50';
  case 'VIRTUAL_SELLER':
    return 'bg-amber-500/20 text-amber-500 border-amber-500/50';
  case 'MIXED':
    return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
  default:
    return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
	}
  };

  let marketCondition = 'Balanced';
  let conditionColor = 'text-muted-foreground';
  if (avgSpread > 5) {
	marketCondition = 'Scarcity Premium';
	conditionColor = 'text-emerald-500';
  } else if (avgSpread < -5) {
	marketCondition = 'Persistent Oversupply';
	conditionColor = 'text-red-500';
  }

  return (
	<div className="space-y-6">
  {/* Header */}
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Convergence Monitor</h2>
      <p className="text-sm text-muted-foreground">
        Day-Ahead vs Real-Time price spread analysis
      </p>
    </div>
    <div className="w-64">
      <Select value={selectedZone} onValueChange={setSelectedZone}>
        <SelectTrigger>
          <SelectValue placeholder="Select zone" />
        </SelectTrigger>
        <SelectContent>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">HUBS</div>
          {zones.slice(0, 2).map((zone) => (
            <SelectItem key={zone.id} value={zone.id}>
              {zone.name}
            </SelectItem>
          ))}
          <div className="my-1 border-t border-border"></div>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">ZONES</div>
          {zones.slice(2).map((zone) => (
            <SelectItem key={zone.id} value={zone.id}>
              {zone.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>

  {/* KPI Cards */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <KpiCard
      title="Cumulative Daily Spread"
      value={data.cumulative_spread.toFixed(2)}
      unit="$/MWh"
      trend={avgSpread}
      icon={
        data.cumulative_spread > 0 ? (
          <TrendingUp className="w-10 h-10" />
        ) : (
          <TrendingDown className="w-10 h-10" />
        )
      }
      subtitle="Virtual trading P&L"
    />

    <KpiCard
      title="Average Spread"
      value={avgSpread.toFixed(2)}
      unit="$/MWh"
      icon={<AlertCircle className="w-10 h-10" />}
      subtitle={`RT ${avgSpread > 0 ? 'above' : 'below'} DA`}
    />

    <KpiCard
      title="Scarcity Hours"
      value={data.total_scarcity_hours.toString()}
      unit="hours"
      icon={<TrendingUp className="w-10 h-10" />}
      subtitle="RT > DA (profitable)"
    />

    <KpiCard
      title="Oversupply Hours"
      value={data.total_oversupply_hours.toString()}
      unit="hours"
      icon={<TrendingDown className="w-10 h-10" />}
      subtitle="RT < DA (unprofitable)"
    />
  </div>

  {/* Market Intelligence Card */}
  <Card className="p-5 bg-card border-l-4 border-l-primary border-border">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-lg font-semibold">Market Intelligence</h3>
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getSignalBadgeStyle(data.dominant_signal)}`}>
            {data.dominant_signal.replace('_', ' ')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {data.market_narrative}
        </p>
      </div>
    </div>
  </Card>

  {/* Price Convergence Chart */}
  <ConvergencePriceChart data={data.hourly_data} />

  {/* Spread Bar Chart */}
  <SpreadBarChart data={data.hourly_data} />

  {/* Market Condition Summary */}
  <div className="p-4 bg-muted/50 border border-border rounded-lg">
    <div className="flex items-start gap-3">
      <div className={`font-bold ${conditionColor}`}>
        {marketCondition}
      </div>
      <p className="text-sm text-muted-foreground flex-1">
        <strong>Virtual Trading Strategy:</strong> When RT consistently exceeds DA (green bars),
        virtual buyers profit by buying DA and selling RT. When RT falls below DA (red bars),
        virtual sellers profit by selling DA and buying RT. Scarcity spikes above $50 indicate
        tight supply conditions and potential arbitrage opportunities.
      </p>
    </div>
  </div>
	</div>
  );
}
