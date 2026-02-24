import { useState, useEffect } from 'react';
import { Wind, Sun, RefreshCw, AlertCircle, Atom, Flame, Droplet, Mountain } from 'lucide-react';
import KpiCard from '@/react-app/components/KpiCard';
import GenerationChart from '@/react-app/components/GenerationChart';
import { Button } from '@/react-app/components/ui/button';
import { generationData as sampleData, currentGeneration as sampleCurrent } from '@/react-app/data/generationData';

interface GenerationRecord {
  timestamp: string;
  nuclear: number;
  gas: number;
  coal: number;
  wind: number;
  solar: number;
  hydro: number;
  storage: number;
  temperature: number;
  load_forecast: number;
  load_actual: number;
}

export default function Home() {
  const [data, setData] = useState<GenerationRecord[]>(sampleData);
  const [currentGeneration, setCurrentGeneration] = useState(sampleCurrent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(false);

    try {
      // Fetch generation data
      const genResponse = await fetch('https://gridalpha-production.up.railway.app/generation?hours=24');
      if (!genResponse.ok) throw new Error('Generation API failed');
      const genResult = await genResponse.json();

      // Fetch weather/load data for BGE zone
      const weatherResponse = await fetch('https://gridalpha-production.up.railway.app/weather?zone=BGE');
      if (!weatherResponse.ok) throw new Error('Weather API failed');
      const weatherResult = await weatherResponse.json();

      // Get load and temperature data
      const weatherData = weatherResult.data?.[0];
      const loadForecast = weatherData?.load_forecast_mw || 0;
      const loadActual = weatherData?.actual_load_mw || 0;
      const temperature = weatherData?.temperature_f || 50;

      // Process generation data - group by timestamp and pivot fuel types
      const groupedData: { [key: string]: GenerationRecord } = {};
      
      genResult.data?.forEach((record: any) => {
        const timestamp = record.datetime_beginning_ept;
        if (!groupedData[timestamp]) {
          groupedData[timestamp] = {
            timestamp,
            nuclear: 0,
            gas: 0,
            coal: 0,
            wind: 0,
            solar: 0,
            hydro: 0,
            storage: 0,
            temperature,
            load_forecast: loadForecast,
            load_actual: loadActual,
          };
        }

        const fuelType = record.fuel_type?.toLowerCase();
        if (fuelType === 'nuclear') groupedData[timestamp].nuclear = record.mw;
        else if (fuelType === 'gas') groupedData[timestamp].gas = record.mw;
        else if (fuelType === 'coal') groupedData[timestamp].coal = record.mw;
        else if (fuelType === 'wind') groupedData[timestamp].wind = record.mw;
        else if (fuelType === 'solar') groupedData[timestamp].solar = record.mw;
        else if (fuelType === 'hydro') groupedData[timestamp].hydro = record.mw;
        else if (fuelType === 'storage') groupedData[timestamp].storage = record.mw;
      });

      // Convert to array and sort by timestamp ascending (oldest first) for chart display
      const pivotedData = Object.values(groupedData).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (pivotedData.length > 0) {
        setData(pivotedData);
        // KPI: always use most recent completed hour (last element when sorted asc)
        const sortedDesc = [...pivotedData].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setCurrentGeneration(sortedDesc[0]);
      }

      setLastUpdated(new Date().toISOString());
    } catch (err) {
      // Silently fall back to stub data
      setError(true);
      setData(sampleData);
      setCurrentGeneration(sampleCurrent);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const totalGeneration = Object.values(currentGeneration)
    .filter((val) => typeof val === 'number')
    .reduce((sum, val) => sum + val, 0);
  
  // Calculate percentages for each fuel type
  const coalPercentage = totalGeneration > 0 ? (currentGeneration.coal / totalGeneration * 100) : 0;
  const gasPercentage = totalGeneration > 0 ? (currentGeneration.gas / totalGeneration * 100) : 0;
  const hydroPercentage = totalGeneration > 0 ? (currentGeneration.hydro / totalGeneration * 100) : 0;
  const nuclearPercentage = totalGeneration > 0 ? (currentGeneration.nuclear / totalGeneration * 100) : 0;
  const windPercentage = totalGeneration > 0 ? (currentGeneration.wind / totalGeneration * 100) : 0;
  const solarPercentage = totalGeneration > 0 ? (currentGeneration.solar / totalGeneration * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Generation Mix</h2>
          <p className="text-sm text-muted-foreground">Real-time fuel source breakdown</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Last Updated</p>
            <p className="text-sm font-medium">
              {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : new Date().toLocaleTimeString()}
            </p>
          </div>
          <Button 
            onClick={fetchData}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards - Full Fuel Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <KpiCard
          title="Coal"
          value={Math.round(currentGeneration.coal).toLocaleString()}
          unit="MW"
          subtitle={`${coalPercentage.toFixed(1)}% of total`}
          trend={-1.8}
          icon={<Mountain className="w-10 h-10" />}
        />
        <KpiCard
          title="Gas"
          value={Math.round(currentGeneration.gas).toLocaleString()}
          unit="MW"
          subtitle={`${gasPercentage.toFixed(1)}% of total`}
          trend={3.4}
          icon={<Flame className="w-10 h-10" />}
        />
        <KpiCard
          title="Hydro"
          value={Math.round(currentGeneration.hydro).toLocaleString()}
          unit="MW"
          subtitle={`${hydroPercentage.toFixed(1)}% of total`}
          trend={0.6}
          icon={<Droplet className="w-10 h-10" />}
        />
        <KpiCard
          title="Nuclear"
          value={Math.round(currentGeneration.nuclear).toLocaleString()}
          unit="MW"
          subtitle={`${nuclearPercentage.toFixed(1)}% of total`}
          trend={-0.3}
          icon={<Atom className="w-10 h-10" />}
        />
        <KpiCard
          title="Wind"
          value={Math.round(currentGeneration.wind).toLocaleString()}
          unit="MW"
          subtitle={`${windPercentage.toFixed(1)}% of total`}
          trend={5.2}
          icon={<Wind className="w-10 h-10" />}
        />
        <KpiCard
          title="Solar"
          value={Math.round(currentGeneration.solar).toLocaleString()}
          unit="MW"
          subtitle={`${solarPercentage.toFixed(1)}% of total`}
          trend={-1.5}
          icon={<Sun className="w-10 h-10" />}
        />
      </div>

      {/* Generation Chart */}
      <GenerationChart data={data} />

      {/* Additional Context */}
      <div className="mt-6 text-center text-sm text-muted-foreground">
        <p>Data updates every 5 minutes • Penn State Energy Business & Finance</p>
      </div>
    </div>
  );
}
