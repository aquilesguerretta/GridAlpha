import { useState, useEffect } from 'react';
import { Battery, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { 
  generateBatterySchedule, 
  calculateDailyProfit, 
  getArbitrageSignal,
  type BatteryAction 
} from '@/react-app/data/batteryArbitrageData';
import { zones } from '@/react-app/data/lmpData';
import BatteryScheduleChart from '@/react-app/components/BatteryScheduleChart';
import KpiCard from '@/react-app/components/KpiCard';
import { Card } from '@/react-app/components/ui/card';
import { Input } from '@/react-app/components/ui/input';
import { Slider } from '@/react-app/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/react-app/components/ui/select';

interface BatteryArbitrageProps {
  selectedZone: string;
  setSelectedZone: (zone: string) => void;
}

export default function BatteryArbitrage({ selectedZone, setSelectedZone }: BatteryArbitrageProps) {
  const [batterySize, setBatterySize] = useState(100);
  const [duration, setDuration] = useState(4);
  const [efficiency, setEfficiency] = useState(87);
  const [cyclingCost, setCyclingCost] = useState(20);
  const [batterySchedule, setBatterySchedule] = useState<BatteryAction[]>(
    generateBatterySchedule(duration, cyclingCost, efficiency / 100)
  );

  const zoneIdToApiName: Record<string, string> = {
    western_hub: 'PJM-WESTERN_HUB',
    eastern_hub: 'PJM-EASTERN_HUB',
    aep: 'AEP', aps: 'APS', atsi: 'ATSI', bge: 'BGE', comed: 'COMED',
    dom: 'DOM', dpl: 'DPL', peco: 'PECO', ppl: 'PPL', pseg: 'PSEG',
  };
  const apiZone = zoneIdToApiName[selectedZone] ?? selectedZone.toUpperCase().replace(/_/g, '-');

  const fetchWithTimeout = (url: string, ms = 60000) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(t));
  };

  // Fetch battery arbitrage data from API
  useEffect(() => {
    const fetchBatteryData = async () => {
      try {
        const response = await fetchWithTimeout(
          `https://gridalpha-production.up.railway.app/battery-arbitrage?zone=${encodeURIComponent(apiZone)}&efficiency=${efficiency / 100}&n_charge_hours=4&n_discharge_hours=4`
        );
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const result = await response.json();

        const zoneRecord = result.data?.find(
          (item: any) =>
            (item.zone_name && item.zone_name.toUpperCase() === apiZone) ||
            item.zone_name === selectedZone ||
            item.zone === selectedZone
        );

        if (zoneRecord) {
          const schedule: BatteryAction[] = [];
          const avgPrice = (zoneRecord.charge_price + zoneRecord.discharge_price) / 2;

          // charge_hours and discharge_hours are ISO timestamp strings — extract hour integer
          const chargeHourInts: number[] = (zoneRecord.charge_hours as string[]).map(
            (h: string) => new Date(h).getHours()
          );
          const dischargeHourInts: number[] = (zoneRecord.discharge_hours as string[]).map(
            (h: string) => new Date(h).getHours()
          );

          for (let hour = 0; hour < 24; hour++) {
            let action: 'charge' | 'discharge' | 'idle' = 'idle';
            let price = avgPrice;

            if (chargeHourInts.includes(hour)) {
              action = 'charge';
              price = zoneRecord.charge_price;
            } else if (dischargeHourInts.includes(hour)) {
              action = 'discharge';
              price = zoneRecord.discharge_price;
            }

            schedule.push({
              hour,
              action,
              mw: action === 'charge' ? -50 : action === 'discharge' ? 50 : 0,
              price: Number(price.toFixed(2)),
            });
          }

          setBatterySchedule(schedule);
        } else {
          // Fallback to stub data if no matching zone found
          setBatterySchedule(generateBatterySchedule(duration, cyclingCost, efficiency / 100));
        }
      } catch (error) {
        // Silently fall back to stub data on error
        setBatterySchedule(generateBatterySchedule(duration, cyclingCost, efficiency / 100));
      }
    };

    fetchBatteryData();
  }, [selectedZone, apiZone, efficiency, duration, cyclingCost]);
  const { grossProfit, netProfit, cycles } = calculateDailyProfit(
    batterySchedule,
    batterySize,
    duration,
    efficiency / 100,
    cyclingCost
  );
  
  const chargingPeriods = batterySchedule.filter(h => h.action === 'charge');
  const dischargingPeriods = batterySchedule.filter(h => h.action === 'discharge');
  
  const avgChargePrice = chargingPeriods.reduce((sum, h) => sum + h.price, 0) / chargingPeriods.length;
  const avgDischargePrice = dischargingPeriods.reduce((sum, h) => sum + h.price, 0) / dischargingPeriods.length;
  
  const profitPerMWh = duration > 0 ? netProfit / (batterySize * duration) : 0;
  const signal = getArbitrageSignal(profitPerMWh);
  const totalChargingHours = chargingPeriods.length;
  const totalDischargingHours = dischargingPeriods.length;
  const totalIdleHours = 24 - totalChargingHours - totalDischargingHours;

  // Validation
  const efficiencyError = efficiency < 50 || efficiency > 99 
    ? 'Efficiency must be between 50% and 99%' 
    : null;
  const totalHoursError = (totalChargingHours + totalDischargingHours) > 12
    ? `Total charge + discharge hours (${totalChargingHours + totalDischargingHours}) cannot exceed 12 hours`
    : null;

  const selectedZoneName = zones.find(z => z.id === selectedZone)?.name || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Battery Arbitrage</h2>
          <p className="text-sm text-muted-foreground">
            Optimize energy storage operations for maximum profit
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

      {/* Configuration Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-card border-border backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Battery Size (MW)</label>
              <Input
                type="number"
                value={batterySize}
                onChange={(e) => setBatterySize(Number(e.target.value))}
                min={1}
                max={1000}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Power capacity in megawatts
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Duration (hours)</label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={1}
                max={12}
                step={0.5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Energy capacity in hours
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-card border-border backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Round-Trip Efficiency: {efficiency}%
              </label>
              <Slider
                value={[efficiency]}
                onValueChange={(value: number[]) => setEfficiency(value[0])}
                min={70}
                max={95}
                step={1}
                className="w-full"
              />
              {efficiencyError && (
                <p className="text-xs text-red-500 mt-1 font-medium">
                  {efficiencyError}
                </p>
              )}
              {!efficiencyError && (
                <p className="text-xs text-muted-foreground mt-1">
                  Energy retained after charge/discharge cycle
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Cycling Cost: ${cyclingCost}/MWh
              </label>
              <Slider
                value={[cyclingCost]}
                onValueChange={(value: number[]) => setCyclingCost(value[0])}
                min={0}
                max={150}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Degradation cost per cycle
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          title="Net Profit"
          value={netProfit.toFixed(0)}
          unit="$/day"
          trend={netProfit > 0 ? 4.2 : -8.5}
          icon={<DollarSign className="w-10 h-10" />}
          subtitle={`$${grossProfit.toFixed(0)} gross - ($${cycles} × $${cyclingCost}/MWh)`}
        />
        
        <Card className="p-6 bg-card border-border backdrop-blur-sm">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm font-medium mb-2">
                Charge vs Discharge Price
              </p>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-primary">
                    ${avgChargePrice.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">Avg Charge</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold" style={{ color: '#f97316' }}>
                    ${avgDischargePrice.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">Avg Discharge</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ${(avgDischargePrice - avgChargePrice).toFixed(2)}/MWh spread
              </p>
            </div>
            <div className="text-primary/20">
              <TrendingUp className="w-10 h-10" />
            </div>
          </div>
        </Card>
        
        <Card className="p-6 bg-card border-border backdrop-blur-sm">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm font-medium mb-2">
                Arbitrage Signal
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
              <Activity className="w-10 h-10" />
            </div>
          </div>
        </Card>
        
        <Card className="p-6 bg-card border-border backdrop-blur-sm">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm font-medium mb-2">
                Daily Operations
              </p>
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-primary">
                    {totalChargingHours}h
                  </span>
                  <span className="text-xs text-muted-foreground">Charging</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold" style={{ color: '#f97316' }}>
                    {totalDischargingHours}h
                  </span>
                  <span className="text-xs text-muted-foreground">Discharging</span>
                </div>
              </div>
              {totalHoursError && (
                <p className="text-xs text-red-500 mt-2 font-medium">
                  {totalHoursError}
                </p>
              )}
              {!totalHoursError && (
                <p className="text-xs text-muted-foreground mt-2">
                  {totalIdleHours}h idle
                </p>
              )}
            </div>
            <div className="text-primary/20">
              <Battery className="w-10 h-10" />
            </div>
          </div>
        </Card>
      </div>

      {/* Validation Errors */}
      {(efficiencyError || totalHoursError) && (
        <Card className="p-4 bg-red-500/10 border-red-500/20">
          <div className="space-y-2">
            {efficiencyError && (
              <p className="text-sm text-red-500 font-medium">• {efficiencyError}</p>
            )}
            {totalHoursError && (
              <p className="text-sm text-red-500 font-medium">• {totalHoursError}</p>
            )}
          </div>
        </Card>
      )}

      {/* Chart */}
      <BatteryScheduleChart data={batterySchedule} />

      {/* Info Banner */}
      <div className="p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Battery Arbitrage</strong> captures price spreads by charging during low-price periods 
          (2-6 AM, 11 AM-1 PM renewable peak) and discharging during high-price peaks (7-9 AM morning, 6-8 PM evening). 
          Net profit = Gross profit - (Cycles × ${cyclingCost}/MWh cycling cost). {netProfit <= 0 ? 'Cycling is currently unprofitable.' : `Operating ${totalChargingHours}h charging, ${totalDischargingHours}h discharging.`} Zone: {selectedZoneName}.
        </p>
      </div>
    </div>
  );
}
