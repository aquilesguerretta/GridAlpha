import { useState, useEffect, useRef } from 'react';
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
import { useRailwayWarmup } from '@/react-app/contexts/RailwayWarmupContext';

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

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function PriceIntelligence({ selectedZone, setSelectedZone }: PriceIntelligenceProps) {
  const { ready: railwayReady } = useRailwayWarmup();
  const [zoneData, setZoneData] = useState<LMPDataPoint[] | null>(null);
  const [weatherLoadData, setWeatherLoadData] = useState<WeatherLoadData | null>(null);
  /** Current LMP snapshot per zone (last point in time series) — same fetch cycle as selected zone */
  const [allZonesSnapshot, setAllZonesSnapshot] = useState<Record<string, { currentLMP: number; currentCongestion: number }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const lmpCacheRef = useRef<{ zone: string; data: LMPDataPoint[] } | null>(null);
  const weatherCacheRef = useRef<{ zone: string; data: WeatherLoadData } | null>(null);

  const fetchWithTimeout = (url: string, ms = 60000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
  };

  useEffect(() => {
    if (!railwayReady) return;
    if (!selectedZone || typeof selectedZone !== 'string' || selectedZone.trim() === '') return;
    setZoneData(null);
    setWeatherLoadData(null);
    setAllZonesSnapshot(null);
    setLoading(true);
    let cancelled = false;

    const zoneIdToApiName: Record<string, string> = {
      western_hub: 'PJM-WESTERN_HUB',
      eastern_hub: 'PJM-EASTERN_HUB',
      aep: 'AEP', aps: 'APS', atsi: 'ATSI', bge: 'BGE', comed: 'COMED',
      dom: 'DOM', dpl: 'DPL', peco: 'PECO', ppl: 'PPL', pseg: 'PSEG',
    };

    const fetchLMPData = async (): Promise<void> => {
      try {
        const apiZone = zoneIdToApiName[selectedZone] ?? selectedZone.toUpperCase().replace(/_/g, ' ');
        const url = `https://gridalpha-production.up.railway.app/lmp?zone=${encodeURIComponent(apiZone)}&snapshot=false&hours=24`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        const result = await response.json();

        const rawData = result.data ?? result.records ?? [];
        const mapped: LMPDataPoint[] = Array.isArray(rawData)
          ? rawData.map((item: Record<string, unknown>) => ({
              timestamp: String(item.timestamp ?? item.timestamp_ept ?? item.datetime_beginning_ept ?? ''),
              energy: Number(item.energy_component ?? 0),
              congestion: Number(item.congestion_component ?? 0),
              loss: Number(item.loss_component ?? 0),
              total: Number(item.lmp_total ?? item.total_lmp_rt ?? 0),
            }))
          : [];
        const mappedData = mapped.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        if (!cancelled) {
          if (Array.isArray(mappedData) && mappedData.length > 0) {
            lmpCacheRef.current = { zone: selectedZone, data: mappedData };
            setZoneData(mappedData);
          } else {
            const stub = stubLmpData[selectedZone];
            setZoneData(Array.isArray(stub) && stub.length > 0 ? stub : []);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const cached = lmpCacheRef.current;
          if (cached && cached.zone === selectedZone) {
            setZoneData(cached.data);
          } else {
            const stub = stubLmpData[selectedZone];
            setZoneData(Array.isArray(stub) && stub.length > 0 ? stub : []);
          }
        }
      }
    };

    /** Fetch current LMP snapshot for every PJM zone (same API, same refresh cycle). */
    const fetchAllZonesSnapshot = async (): Promise<Record<string, { currentLMP: number; currentCongestion: number }>> => {
      const snapshot: Record<string, { currentLMP: number; currentCongestion: number }> = {};
      const zoneIds = (zones ?? []).map((z) => z.id);
      await Promise.all(
        zoneIds.map(async (zoneId) => {
          try {
            const apiZone = zoneIdToApiName[zoneId] ?? zoneId.toUpperCase().replace(/_/g, ' ');
            const url = `https://gridalpha-production.up.railway.app/lmp?zone=${encodeURIComponent(apiZone)}&snapshot=false&hours=24`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) throw new Error(`LMP failed: ${zoneId}`);
            const result = await response.json();
            const rawData = result.data ?? result.records ?? [];
            const mapped: LMPDataPoint[] = Array.isArray(rawData)
              ? rawData.map((item: Record<string, unknown>) => ({
                  timestamp: String(item.timestamp ?? item.timestamp_ept ?? item.datetime_beginning_ept ?? ''),
                  energy: Number(item.energy_component ?? 0),
                  congestion: Number(item.congestion_component ?? 0),
                  loss: Number(item.loss_component ?? 0),
                  total: Number(item.lmp_total ?? item.total_lmp_rt ?? 0),
                }))
              : [];
            const sorted = mapped.sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;
            if (last) {
              snapshot[zoneId] = { currentLMP: last.total, currentCongestion: last.congestion };
            } else {
              const stub = stubLmpData[zoneId];
              const stubLast = Array.isArray(stub) && stub.length > 0 ? stub[stub.length - 1] : null;
              snapshot[zoneId] = stubLast
                ? { currentLMP: stubLast.total, currentCongestion: stubLast.congestion }
                : { currentLMP: 0, currentCongestion: 0 };
            }
          } catch {
            const stub = stubLmpData[zoneId];
            const stubLast = Array.isArray(stub) && stub.length > 0 ? stub[stub.length - 1] : null;
            snapshot[zoneId] = stubLast
              ? { currentLMP: stubLast.total, currentCongestion: stubLast.congestion }
              : { currentLMP: 0, currentCongestion: 0 };
          }
        })
      );
      return snapshot;
    };

    const fetchWeatherData = async (): Promise<void> => {
      try {
        const response = await fetchWithTimeout(`https://gridalpha-production.up.railway.app/weather?zone=${selectedZone}`);
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
            const w = {
              temperature: Number(item.temperature_f ?? 50),
              weather_condition: mappedCondition,
              weather_alert: String(item.weather_alert ?? ''),
              load_forecast: loadForecast,
              load_actual: loadActual,
              load_deviation_pct: loadDeviationPct,
              is_uncertainty_driver: Math.abs(loadDeviationPct) > 5,
            };
            weatherCacheRef.current = { zone: selectedZone, data: w };
            setWeatherLoadData(w);
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
      } catch (err) {
        if (!cancelled) {
          const cached = weatherCacheRef.current;
          if (cached && cached.zone === selectedZone) {
            setWeatherLoadData(cached.data);
          } else {
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
      }
    };

    void Promise.allSettled([fetchLMPData(), fetchWeatherData(), fetchAllZonesSnapshot()]).then((results) => {
      if (!cancelled) {
        setLoading(false);
        const snapshotResult = results[2];
        if (snapshotResult.status === 'fulfilled' && snapshotResult.value && Object.keys(snapshotResult.value).length > 0) {
          setAllZonesSnapshot(snapshotResult.value);
        } else {
          const fallback: Record<string, { currentLMP: number; currentCongestion: number }> = {};
          (zones ?? []).forEach((z) => {
            const stub = stubLmpData[z.id];
            const last = Array.isArray(stub) && stub.length > 0 ? stub[stub.length - 1] : null;
            fallback[z.id] = last ? { currentLMP: last.total, currentCongestion: last.congestion } : { currentLMP: 0, currentCongestion: 0 };
          });
          setAllZonesSnapshot(fallback);
        }
      }
    });

    // Safety: if fetches hang or take >12s, force loading off and ensure demo data
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setZoneData(prev => {
          if (prev !== null) return prev;
          const stub = stubLmpData[selectedZone];
          return Array.isArray(stub) && stub.length > 0 ? stub : [];
        });
        setWeatherLoadData(prev => {
          if (prev !== null) return prev;
          const stub = stubWeatherData[selectedZone];
          return stub ?? {
            temperature: 50,
            weather_condition: 'cloudy' as const,
            weather_alert: '',
            load_forecast: 0,
            load_actual: 0,
            load_deviation_pct: 0,
            is_uncertainty_driver: false,
          };
        });
        setAllZonesSnapshot(prev => {
          if (prev !== null && Object.keys(prev).length > 0) return prev;
          const fallback: Record<string, { currentLMP: number; currentCongestion: number }> = {};
          (zones ?? []).forEach((z) => {
            const stub = stubLmpData[z.id];
            const last = Array.isArray(stub) && stub.length > 0 ? stub[stub.length - 1] : null;
            fallback[z.id] = last ? { currentLMP: last.total, currentCongestion: last.congestion } : { currentLMP: 0, currentCongestion: 0 };
          });
          return fallback;
        });
      }
    }, 12000);

    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
    };
  }, [selectedZone, refreshTick, railwayReady]);

  // Auto-refresh every 5 min (PJM data updates hourly; faster refresh adds noise)
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Loading state: show skeleton until data is ready (never show numbers until fetch resolves)
  if (loading || zoneData === null || weatherLoadData === null || allZonesSnapshot === null) {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-32 bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-gray-700 rounded animate-pulse" />
        <div className="h-64 bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  // Null-safe: zoneData is sorted ascending by timestamp; last = most recent completed hour
  const arr = zoneData;
  const currentLMP = arr.length > 0 ? arr[arr.length - 1] : null;
  const previousLMP = arr.length >= 2 ? arr[arr.length - 2] : null;

  const change = currentLMP && previousLMP ? currentLMP.total - previousLMP.total : 0;
  const changePercent = previousLMP && previousLMP.total !== 0 ? (change / previousLMP.total) * 100 : 0;

  const avgLMP = arr.length > 0 ? arr.reduce((sum, d) => sum + d.total, 0) / arr.length : 0;
  const peakLMP = arr.length > 0 ? Math.max(...arr.map((d) => d.total)) : 0;
  const avgCongestion = arr.length > 0 ? arr.reduce((sum, d) => sum + d.congestion, 0) / arr.length : 0;

  // Charts need 2+ points to avoid divide-by-zero; zone KPIs use arr
  const chartData = arr.length >= 2 ? arr : [];

  const selectedZoneName = zones?.find?.(z => z.id === selectedZone)?.name ?? selectedZone;

  // Bottom 4 cards: use current LMP snapshot for every zone (from same fetch cycle as top cards)
  const zoneList = (zones ?? []).map((zone) => {
    const snap = allZonesSnapshot[zone.id];
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      currentLMP: snap?.currentLMP ?? 0,
      currentCongestion: snap?.currentCongestion ?? 0,
    };
  });

  const avgLMPAcrossZones = zoneList.length > 0
    ? zoneList.reduce((sum, z) => sum + z.currentLMP, 0) / zoneList.length
    : 0;
  const highestZone = zoneList.length > 0
    ? zoneList.reduce((max, z) => z.currentLMP > max.currentLMP ? z : max, zoneList[0])
    : { zoneName: '', zoneId: '', currentLMP: 0, currentCongestion: 0 };
  const lowestZone = zoneList.length > 0
    ? zoneList.reduce((min, z) => z.currentLMP < min.currentLMP ? z : min, zoneList[0])
    : { zoneName: '', zoneId: '', currentLMP: 0, currentCongestion: 0 };
  const mostCongestedZone = zoneList.length > 0
    ? zoneList.reduce((max, z) => Math.abs(z.currentCongestion) > Math.abs(max.currentCongestion) ? z : max, zoneList[0])
    : { zoneName: '', zoneId: '', currentLMP: 0, currentCongestion: 0 };

  console.log(
    '[PriceIntelligence] All zone current LMPs (snapshot):',
    Object.fromEntries(zoneList.map((z) => [z.zoneName, z.currentLMP]))
  );

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
          value={mostCongestedZone.currentCongestion.toFixed(2)}
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
      {chartData.length > 0 && (
        <div className="space-y-6">
          <LMPTimeSeriesChart
            data={chartData}
            zoneName={selectedZoneName}
            isUncertaintyDriver={weatherLoadData.is_uncertainty_driver}
          />
          <LMPComponentsChart data={chartData} />
        </div>
      )}

    </div>
  );
}
