import { zones } from './lmpData';

const FUELS = ['Gas', 'Nuclear', 'Wind', 'Coal', 'Solar'] as const;
type Fuel = typeof FUELS[number];

const NOTES: Record<Fuel, string> = {
  Gas:     'Natural gas peakers are setting the market clearing price. Demand exceeds baseload + renewable output.',
  Nuclear: 'Baseload nuclear is the marginal unit. Demand is low enough that flexible resources are not needed.',
  Wind:    'Wind output is displacing conventional generation and setting a low market clearing price.',
  Coal:    'Coal units are on the margin. Gas prices or dispatch constraints are pushing coal to the price-setting position.',
  Solar:   'Solar is setting the price during peak output hours, compressing daytime LMPs.',
};

function genTimeline(): Array<{ hour: number; fuel_type: Fuel }> {
  return Array.from({ length: 24 }, (_, h) => ({
    hour:      h,
    fuel_type: FUELS[Math.floor(Math.random() * FUELS.length)],
  }));
}

export interface MarginalFuelData {
  zone: string;
  current_fuel: string;
  is_fossil: boolean;
  market_note: string;
  timeline_24h: Array<{ hour: number; fuel_type: Fuel }>;
}

export const marginalFuelDataByZone: Record<string, MarginalFuelData> = Object.fromEntries(
  zones.map(z => {
    const timeline    = genTimeline();
    const current     = timeline[timeline.length - 1].fuel_type;
    return [z.id, {
      zone:         z.id,
      current_fuel: current,
      is_fossil:    ['Gas', 'Coal'].includes(current),
      market_note:  NOTES[current],
      timeline_24h: timeline,
    }];
  })
);
