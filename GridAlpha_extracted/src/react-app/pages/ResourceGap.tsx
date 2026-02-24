import { useState, useEffect } from 'react';
import { TrendingDown } from 'lucide-react';
import { resourceGapDataByZone as stubData } from '@/react-app/data/resourceGapData';
import { zones } from '@/react-app/data/lmpData';
import ReliabilityGauge from '@/react-app/components/ReliabilityGauge';
import SupplyGapWaterfall from '@/react-app/components/SupplyGapWaterfall';
import { Card } from '@/react-app/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/react-app/components/ui/select';

interface ResourceGapData {
  zone: string;
  reliability_score: number;
  rmr_status: boolean;
  current_capacity: number;
  scheduled_retirements: number;
  new_projects: number;
  load_forecast: number;
  net_position: number;
  investment_signal: string;
}

interface ResourceGapProps {
  selectedZone: string;
  setSelectedZone: (zone: string) => void;
}

export default function ResourceGap({ selectedZone, setSelectedZone }: ResourceGapProps) {
  const [data, setData] = useState<ResourceGapData>(stubData[selectedZone]);

  // Fetch resource gap data from API
  useEffect(() => {
    const fetchResourceGapData = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/resource-gap?zone=${selectedZone}`);
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const result = await response.json();

        // Find the matching zone in the data array
        const zoneRecord = result.data?.find((item: any) => item.zone === selectedZone);

        if (zoneRecord) {
          // Derive rmr_status from reliability_score (boolean)
          const rmrStatus = zoneRecord.reliability_score > 8;

          // Map API fields to component data structure
          const apiData: ResourceGapData = {
            zone: selectedZone,
            reliability_score: zoneRecord.reliability_score,
            rmr_status: rmrStatus,
            current_capacity: zoneRecord.elcc_adjusted_mw,
            scheduled_retirements: -Math.abs(zoneRecord.retiring_mw), // Ensure negative
            new_projects: zoneRecord.adjusted_queue_mw,
            net_position: -zoneRecord.retirement_deficit_mw, // Negate the deficit
            investment_signal: zoneRecord.investment_signal,
            load_forecast: stubData[selectedZone].load_forecast, // Keep stub value
          };

          setData(apiData);
        } else {
          // Fallback to stub data if no matching zone found
          setData(stubData[selectedZone]);
        }
      } catch (error) {
        // Silently fall back to stub data on error
        setData(stubData[selectedZone]);
      }
    };

    fetchResourceGapData();
  }, [selectedZone]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Resource Gap Analysis</h2>
          <p className="text-sm text-muted-foreground">
            Capacity adequacy and reliability risk assessment
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

      {/* Reliability Gauge */}
      <ReliabilityGauge
        score={data.reliability_score}
        rmrStatus={data.rmr_status}
        zoneName={data.zone}
      />

      {/* Waterfall Chart */}
      <SupplyGapWaterfall
        currentCapacity={data.current_capacity}
        retirements={data.scheduled_retirements}
        newProjects={data.new_projects}
        loadForecast={data.load_forecast}
      />

      {/* Strategic Recommendation */}
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-secondary/10 border-border backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="text-primary/50">
            <TrendingDown className="w-12 h-12" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2">Strategic Investment Signal</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {data.investment_signal}
            </p>
          </div>
        </div>
      </Card>

      {/* Info Banner */}
      <div className="p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Resource Adequacy</strong> measures whether the grid has sufficient generation 
          capacity to meet forecasted demand plus reserves. Reliability scores above 7 indicate 
          supply deficits requiring new capacity additions. RMR (Reliability Must Run) units are 
          generators kept online specifically for local reliability despite being uneconomic.
        </p>
      </div>
    </div>
  );
}
