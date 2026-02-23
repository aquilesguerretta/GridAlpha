import { useState, useEffect } from 'react';
import { Gauge } from 'lucide-react';
import { marginalFuelDataByZone } from '@/react-app/data/marginalFuelData';
import { zones } from '@/react-app/data/lmpData';
import MarginalFuelGantt from '@/react-app/components/MarginalFuelGantt';
import { Card } from '@/react-app/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/react-app/components/ui/select';

interface MarginalFuelData {
  zone: string;
  current_fuel: string;
  is_fossil: boolean;
  signal_strength?: number;
  market_note: string;
  timeline_24h: Array<{
    hour: number;
    fuel_type: 'Nuclear' | 'Coal' | 'Gas' | 'Wind' | 'Solar';
  }>;
}

interface MarginalFuelProps {
  selectedZone: string;
  setSelectedZone: (zone: string) => void;
}

export default function MarginalFuel({ selectedZone, setSelectedZone }: MarginalFuelProps) {
  const [data, setData] = useState<MarginalFuelData>(marginalFuelDataByZone[selectedZone]);

  useEffect(() => {
    const fetchMarginalFuel = async () => {
      try {
        const response = await fetch(`https://gridalpha-production.up.railway.app/api/marginal-fuel?zone=${selectedZone}`);
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const result = await response.json();
        
        // Find the data for the selected zone from the data array
        const zoneData = result.data?.find((item: MarginalFuelData) => 
          item.zone.toLowerCase() === selectedZone.replace('_', ' ').toLowerCase() ||
          item.zone === selectedZone
        );
        
        if (zoneData) {
          setData(zoneData);
        } else {
          // Fallback to stub data if zone not found
          setData(marginalFuelDataByZone[selectedZone]);
        }
      } catch (error) {
        // Silently fall back to stub data on error
        setData(marginalFuelDataByZone[selectedZone]);
      }
    };

    fetchMarginalFuel();
  }, [selectedZone]);

  // Determine margin type and theme
  const isNuclear = data.current_fuel.toLowerCase().includes('nuclear');
  const isRenewable = !data.is_fossil && !isNuclear;
  
  let marginType = 'THERMAL MARGIN';
  let bgClass = 'bg-orange-950/30 border-orange-500/50';
  let textClass = 'text-orange-500';
  
  if (isNuclear) {
    marginType = 'BASELOAD MARGIN';
    bgClass = 'bg-purple-950/30 border-purple-500/50';
    textClass = 'text-purple-500';
  } else if (isRenewable) {
    marginType = 'RENEWABLE MARGIN';
    bgClass = 'bg-emerald-950/30 border-emerald-500/50';
    textClass = 'text-emerald-500';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Marginal Fuel Identifier</h2>
          <p className="text-sm text-muted-foreground">
            Track which fuel type is setting the market price
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

      {/* Signal Indicator Card */}
      <Card className={`p-8 border-2 backdrop-blur-sm ${bgClass}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className={`text-sm font-semibold mb-2 ${textClass}`}>
              {marginType}
            </p>
            <h3 className="text-4xl font-bold tracking-tight mb-2">
              {data.current_fuel}
            </h3>
            <p className="text-sm text-muted-foreground">
              Current marginal fuel setting market price in {data.zone}
            </p>
          </div>
          <div className={`${textClass} opacity-30`}>
            <Gauge className="w-16 h-16" />
          </div>
        </div>
      </Card>

      {/* Analysis Card */}
      <Card className="p-6 bg-card border-border backdrop-blur-sm">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Market Analysis</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {data.market_note}
          </p>
        </div>
      </Card>

      {/* Gantt Chart */}
      <MarginalFuelGantt timeline={data.timeline_24h} />

      {/* Info Banner */}
      <div className="p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Merit Order</strong> represents the sequence in which power plants are dispatched 
          based on their marginal cost. The marginal fuel is the last (most expensive) unit needed 
          to meet demand, which sets the market clearing price. Changes in the merit order throughout 
          the day reflect shifts in load, renewable output, and fuel costs.
        </p>
      </div>
    </div>
  );
}
