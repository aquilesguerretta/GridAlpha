import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, BarChart3, Activity, Loader2 } from 'lucide-react';
import { zones, lmpDataByZone as stubLmpData } from '@/react-app/data/lmpData';
import { weatherLoadDataByZone as stubWeatherData } from '@/react-app/data/weatherLoadData';
import LMPTimeSeriesChart from '@/react-app/components/LMPTimeSeriesChart';
import LMPComponentsChart from '@/react-app/components/LMPComponentsChart';
import KpiCard from '@/react-app/components/KpiCard';
import WeatherCard from '@/react-app/components/WeatherCard';
import LoadForecastGauge from '@/react-app/components/LoadForecastGauge';
import { Card } from '@/react-app/components/ui/card';
import { Skeleton } from '@/react-app/components/ui/skeleton';
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
  weather_condition: 'sunny' | 'cloudy' | 'snowy';
  weather_alert: string;
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
  const [zoneData, setZoneData] = useState<LMPDataPoint[] | null>(null);
  const [weatherLoadData, setWeatherLoadData] = useState<WeatherLoadData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch data: clear state first on zone change, then fetch both in parallel
  useEffect(() => {
    setZoneData(null);
    setWeatherLoadData(null);
    setLoading(true);
    let cancelled = false;

    const fetchLMPData = async (): Promise<void> => {
      try {
        const response = await fetch(`https://gridalpha-production.up.railway.app/lmp?zone=${selectedZone}`);
        if (!response.ok) throw new Error('API request failed');
        const result = await response.json();

        const mappedData: LMPDataPoint[] = result.data?.map?.((item: Record<string, unknown>) => ({
          timestamp: String(item.timestamp ?? ''),
          energy: Number(item.energy_component ?? 0),
          congestion: Number(item.congestion_component ?? 0),
          loss: Number(item.loss_component ?? 0),
          total: Number(item.lmp_total ?? 0),
        })) ?? [];

        if (!cancelled) {
          if (Array.isArray(mappedData) && mappedData.length > 0) {
            setZoneData(mappedData);
          } else {
            const stub = stubLmpData[selectedZone];
            setZoneData(Array.isArray(stub) && stub.length > 0 ? stub : []);
          }
        }
      } catch {
        if (!cancelled) {
          const stub = stubLmpData[selectedZone];
          setZoneData(Array.isArray(stub) && stub.length > 0 ? stub : []);
        }
      }
    };

    const fetchWeatherData = async (): Promise<void> => {
      try {
        const response = await fetch(`https://gridalpha-production.up.railway.app/weather?zone=${selectedZone}`);
        if (!response.ok) throw new Error('API request failed');
        const result = await response.json();

        if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
          const item = result.data[0] as Record<string, unknown>;
          const loadForecast = Number(item.load_forecast_mw ?? 0);
          const loadActual = Number(item.actual_load_mw ?? 0);
          const loadDeviationPct = loadForecast !== 0 ? ((loadActual - loadForecast) / loadForecast) * 100 : 0;

          const weatherCondition = String(item.weather_alert ?? 'clear').toLowerCase();
          let mappedCondition: 'sunny' | 'cloudy' | 'snowy' = 'cloudy';
          if (weatherCondition.includes('sun') || weatherCondition.includes('clear')) {
            mappedCondition = 'sunny';
          } else if (weatherCondition.includes('snow') || weatherCondition.includes('ice')) {
            mappedCondition = 'snowy';
          }

          if (!cancelled) {
            setWeatherLoadData({
              temperature: Number(item.temperature_f ?? 50),
              weather_condition: mappedCondition,
              weather_alert: String(item.weather_alert ?? ''),
              load_forecast: loadForecast,
              load_actual: loadActual,
              load_deviation_pct: loadDeviationPct,
              is_uncertainty_driver: Math.abs(loadDeviationPct) > 5,
            });
          }
        } else if (!cancelled) {
          const stub = stubWeatherData[selectedZone];
          setWeatherLoadData(stub ?? {
            temperature: 50,
            weather_condition: 'cloudy' as const,
            weather_alert: '',
            load_forecast: 0,
            load_actual: 0,
            load_deviation_pct: 0,
            is_uncertainty_driver: false,
          });
        }
      } catch {
        if (!cancelled) {
          const stub = stubWeatherData[selectedZone];
          setWeatherLoadData(stub ?? {
            temperature: 50,
            weather_condition: 'cloudy' as const,
            weather_alert: '',
            load_forecast: 0,
            load_actual: 0,
            load_deviation_pct: 0,
            is_uncertainty_driver: false,
          });
        }
      }
    };

    void Promise.all([fetchLMPData(), fetchWeatherData()]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedZone]);

  // Loading state: show skeleton until data is ready
  if (loading || zoneData === null || weatherLoadData === null) {
    return (
      <div className="space-y-6">
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
                {(zones ?? []).slice(0, 2).map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
                <div className="my-1 border-t border-border"></div>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">ZONES</div>
                {(zones ?? []).slice(2).map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-12 h-12 animate-spin text-muted-foreground" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  // Null-safe: zoneData and weatherLoadData are confirmed non-null here
  const safeZoneData = zoneData.length >= 2 ? zoneData : [];
  const currentLMP = safeZoneData.length > 0 ? safeZoneData[safeZoneData.length - 1] : null;
  const previousLMP = safeZoneData.length >= 2 ? safeZoneData[safeZoneData.length - 2] : null;

  const change = currentLMP && previousLMP ? currentLMP.total - previousLMP.total : 0;
  const changePercent = previousLMP && previousLMP.total !== 0 ? (change / previousLMP.total) * 100 : 0;

  const avgLMP = safeZoneData.length > 0
    ? safeZoneData.reduce((sum, d) => sum + d.total, 0) / safeZoneData.length
    : 0;
  const peakLMP = safeZoneData.length > 0 ? Math.max(...safeZoneData.map((d) => d.total)) : 0;
  const avgCongestion = safeZoneData.length > 0
    ? safeZoneData.reduce((sum, d) => sum + d.congestion, 0) / safeZoneData.length
    : 0;

  const selectedZoneName = zones?.find?.(z => z.id === selectedZone)?.name ?? selectedZone;

  const zoneSummaries = (zones ?? []).map((zone) => {
    const data = stubLmpData?.[zone.id];
    if (!Array.isArray(data) || data.length === 0) {
      return { zoneName: zone.name, currentLMP: 0, avgCongestion: 0 };
    }
    const current = data[data.length - 1];
    const avgCong = data.reduce((sum, d) => sum + d.congestion, 0) / data.length;
    return {
      zoneName: zone.name,
      currentLMP: current?.total ?? 0,
      avgCongestion: avgCong,
    };
  });

  const avgLMPAcrossZones = zoneSummaries.length > 0
    ? zoneSummaries.reduce((sum, z) => sum + z.currentLMP, 0) / zoneSummaries.length
    : 0;
  const highestZone = zoneSummaries.length > 0
    ? zoneSummaries.reduce((max, z) => z.currentLMP > max.currentLMP ? z : max, zoneSummaries[0])
    : { zoneName: '', currentLMP: 0, avgCongestion: 0 };
  const lowestZone = zoneSummaries.length > 0
    ? zoneSummaries.reduce((min, z) => z.currentLMP < min.currentLMP ? z : min, zoneSummaries[0])
    : { zoneName: '', currentLMP: 0, avgCongestion: 0 };
  const mostCongestedZone = zoneSummaries.length > 0
    ? zoneSummaries.reduce((max, z) => Math.abs(z.avgCongestion) > Math.abs(max.avgCongestion) ? z : max, zoneSummaries[0])
    : { zoneName: '', currentLMP: 0, avgCongestion: 0 };

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
              {(zones ?? []).slice(0, 2).map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
              <div className="my-1 border-t border-border"></div>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">ZONES</div>
              {(zones ?? []).slice(2).map((zone) => (
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
          value={currentLMP ? currentLMP.total.toFixed(2) : '0.00'}
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
            alert={weatherLoadData.weather_alert ?? ''}
          />
          <LoadForecastGauge
            forecast={weatherLoadData.load_forecast}
            actual={weatherLoadData.load_actual}
            deviationPct={weatherLoadData.load_deviation_pct}
            isUncertaintyDriver={weatherLoadData.is_uncertainty_driver}
          />
        </div>
      </Card>

      {/* Charts - only render when we have sufficient data to avoid chart crashes */}
      {safeZoneData.length > 0 && (
        <div className="space-y-6">
          <LMPTimeSeriesChart
            data={safeZoneData}
            zoneName={selectedZoneName}
            isUncertaintyDriver={weatherLoadData.is_uncertainty_driver}
          />
          <LMPComponentsChart data={safeZoneData} />
        </div>
      )}

      {/* Info Banner */}
      <div className="p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          Using simulated LMP data. Connect to PJM API when credentials are available for live pricing.
        </p>
      </div>
    </div>
  );
}
