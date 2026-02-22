import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react';
import { zones, lmpDataByZone as stubLmpData } from '@/react-app/data/lmpData';
import { weatherLoadDataByZone as stubWeatherData } from '@/react-app/data/weatherLoadData';
import LMPTimeSeriesChart from '@/react-app/components/LMPTimeSeriesChart';
import LMPComponentsChart from '@/react-app/components/LMPComponentsChart';
import KpiCard from '@/react-app/components/KpiCard';
import WeatherCard from '@/react-app/components/WeatherCard';
import LoadForecastGauge from '@/react-app/components/LoadForecastGauge';
import { Card } from '@/react-app/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/react-app/components/ui/select';

interface LMPDataPoint {
  timestamp: string;
  energy: number;
  congestion: number;
  loss: number;
  total: number;
}

interface WeatherLoadData {
  temperature: number;
  weather_condition: string;
  weather_alert: string | null;
  load_forecast: number;
  load_actual: number;
  load_deviation_pct: number;
  is_uncertainty_driver: boolean;
}

interface PriceIntelligenceProps {
  selectedZone: string;
  setSelectedZone: (zone: string) => void;
}

export default function PriceIntelligence({ selectedZone, setSelectedZone }: PriceIntelligenceProps) {
  const [zoneData, setZoneData] = useState<LMPDataPoint[]>(stubLmpData[selectedZone]);
  const [weatherLoadData, setWeatherLoadData] = useState<WeatherLoadData>(stubWeatherData[selectedZone]);

  // Fetch LMP data
  useEffect(() => {
	const fetchLMPData = async () => {
  try {
    const response = await fetch(`http://localhost:8000/lmp?zone=${selectedZone}`);
    if (!response.ok) {
      throw new Error('API request failed');
    }
    const result = await response.json();

    // Map the response data to our component format
    const mappedData: LMPDataPoint[] = result.data?.map((item: any) => ({
      timestamp: item.timestamp,
      energy: item.energy_component,
      congestion: item.congestion_component,
      loss: item.loss_component,
      total: item.lmp_total,
    })) || [];

    if (mappedData.length > 0) {
      setZoneData(mappedData);
    } else {
      setZoneData(stubLmpData[selectedZone]);
    }
  } catch (error) {
    setZoneData(stubLmpData[selectedZone]);
  }
	};

	fetchLMPData();
  }, [selectedZone]);

  // Fetch weather and load data
  useEffect(() => {
	const fetchWeatherData = async () => {
  try {
    const response = await fetch(`http://localhost:8000/weather?zone=${selectedZone}`);
    if (!response.ok) {
      throw new Error('API request failed');
    }
    const result = await response.json();

    if (result.data && result.data.length > 0) {
      const item = result.data[0];
      const loadForecast = item.load_forecast_mw;
      const loadActual = item.actual_load_mw;
      const loadDeviationPct = ((loadActual - loadForecast) / loadForecast) * 100;

      setWeatherLoadData({
        temperature: item.temperature_f,
        weather_condition: item.weather_alert || 'Clear',
        weather_alert: item.weather_alert,
        load_forecast: loadForecast,
        load_actual: loadActual,
        load_deviation_pct: loadDeviationPct,
        is_uncertainty_driver: Math.abs(loadDeviationPct) > 5,
      });
    } else {
      setWeatherLoadData(stubWeatherData[selectedZone]);
    }
  } catch (error) {
    setWeatherLoadData(stubWeatherData[selectedZone]);
  }
	};

	fetchWeatherData();
  }, [selectedZone]);

  const currentLMP = zoneData[zoneData.length - 1];
  const previousLMP = zoneData[zoneData.length - 2];
  const change = currentLMP.total - previousLMP.total;
  const changePercent = (change / previousLMP.total) * 100;

  // Calculate average and peak for the period
  const avgLMP = zoneData.reduce((sum, d) => sum + d.total, 0) / zoneData.length;
  const peakLMP = Math.max(...zoneData.map(d => d.total));
  const avgCongestion = zoneData.reduce((sum, d) => sum + d.congestion, 0) / zoneData.length;

  const selectedZoneName = zones.find(z => z.id === selectedZone)?.name || '';

  // Cross-zone summary metrics use stub data for multi-zone comparison
  const zoneSummaries = zones.map(zone => {
	const data = stubLmpData[zone.id];
	const current = data[data.length - 1];
	const avgCong = data.reduce((sum, d) => sum + d.congestion, 0) / data.length;
	return {
  zoneName: zone.name,
  currentLMP: current.total,
  avgCongestion: avgCong,
	};
  });

  const avgLMPAcrossZones = zoneSummaries.reduce((sum, z) => sum + z.currentLMP, 0) / zoneSummaries.length;
  const highestZone = zoneSummaries.reduce((max, z) => z.currentLMP > max.currentLMP ? z : max);
  const lowestZone = zoneSummaries.reduce((min, z) => z.currentLMP < min.currentLMP ? z : min);
  const mostCongestedZone = zoneSummaries.reduce((max, z) => Math.abs(z.avgCongestion) > Math.abs(max.avgCongestion) ? z : max);

  return (
	<div className="space-y-6">
  {/* Zone Selector */}
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Price Intelligence</h2>
      <p className="text-sm text-muted-foreground">Real-time LMP analysis and forecasting</p>
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

  {/* KPI Cards - Zone Specific */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <KpiCard
      title="Current LMP"
      value={currentLMP.total.toFixed(2)}
      unit="$/MWh"
      trend={changePercent}
      icon={<DollarSign className="w-10 h-10" />}
    />
    <KpiCard
      title="24h Average"
      value={avgLMP.toFixed(2)}
      unit="$/MWh"
      trend={-2.4}
      icon={<TrendingUp className="w-10 h-10" />}
    />
    <KpiCard
      title="24h Peak"
      value={peakLMP.toFixed(2)}
      unit="$/MWh"
      trend={6.7}
      icon={<TrendingUp className="w-10 h-10" />}
    />
    <KpiCard
      title="Avg Congestion"
      value={avgCongestion.toFixed(2)}
      unit="$/MWh"
      trend={-3.8}
      icon={avgCongestion < 0 ? <TrendingDown className="w-10 h-10" /> : <TrendingUp className="w-10 h-10" />}
    />
  </div>

  {/* KPI Cards - Cross-Zone Summary */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <KpiCard
      title="Average LMP (All Zones)"
      value={avgLMPAcrossZones.toFixed(2)}
      unit="$/MWh"
      trend={1.3}
      icon={<BarChart3 className="w-10 h-10" />}
    />
    <KpiCard
      title="Highest LMP Zone"
      value={highestZone.currentLMP.toFixed(2)}
      unit="$/MWh"
      subtitle={highestZone.zoneName}
      trend={7.2}
      icon={<TrendingUp className="w-10 h-10" />}
    />
    <KpiCard
      title="Lowest LMP Zone"
      value={lowestZone.currentLMP.toFixed(2)}
      unit="$/MWh"
      subtitle={lowestZone.zoneName}
      trend={-4.5}
      icon={<TrendingDown className="w-10 h-10" />}
    />
    <KpiCard
      title="Most Congested Zone"
      value={mostCongestedZone.avgCongestion.toFixed(2)}
      unit="$/MWh"
      subtitle={mostCongestedZone.zoneName}
      trend={5.1}
      icon={<Activity className="w-10 h-10" />}
    />
  </div>

  {/* Market Drivers Panel */}
  <Card className="p-6 bg-card border-border">
    <h3 className="text-lg font-semibold mb-4">Market Drivers</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <WeatherCard
        temperature={weatherLoadData.temperature}
        condition={weatherLoadData.weather_condition}
        alert={weatherLoadData.weather_alert}
      />
      <LoadForecastGauge
        forecast={weatherLoadData.load_forecast}
        actual={weatherLoadData.load_actual}
        deviationPct={weatherLoadData.load_deviation_pct}
        isUncertaintyDriver={weatherLoadData.is_uncertainty_driver}
      />
    </div>
  </Card>

  {/* Charts */}
  <div className="space-y-6">
    <LMPTimeSeriesChart
      data={zoneData}
      zoneName={selectedZoneName}
      isUncertaintyDriver={weatherLoadData.is_uncertainty_driver}
    />
    <LMPComponentsChart data={zoneData} />
  </div>

  {/* Info Banner */}
  <div className="p-4 bg-muted/50 border border-border rounded-lg">
    <p className="text-sm text-muted-foreground">
      Using simulated LMP data. Connect to PJM API when credentials are available for live pricing.
    </p>
  </div>
	</div>
  );
}
