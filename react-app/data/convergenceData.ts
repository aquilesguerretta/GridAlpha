import { zones } from './lmpData';

export interface HourlyDataPoint {
  hour: number; da_price: number; rt_price: number; spread: number;
}

export interface ConvergenceData {
  cumulative_spread: number;
  total_scarcity_hours: number;
  total_oversupply_hours: number;
  market_narrative: string;
  dominant_signal: string;
  hourly_data: HourlyDataPoint[];
}

function genConvergence(): ConvergenceData {
  const hourly: HourlyDataPoint[] = Array.from({ length: 24 }, (_, h) => {
    const da = 28 + Math.random() * 10;
    const rt = da + (Math.random() - 0.5) * 8;
    return { hour: h, da_price: +da.toFixed(2), rt_price: +rt.toFixed(2), spread: +(rt - da).toFixed(2) };
  });
  const cumulative = hourly.reduce((s, h) => s + h.spread, 0);
  const scarcity   = hourly.filter(h => h.spread > 2).length;
  const oversupply = hourly.filter(h => h.spread < -2).length;
  return {
    cumulative_spread:     +cumulative.toFixed(2),
    total_scarcity_hours:  scarcity,
    total_oversupply_hours: oversupply,
    dominant_signal:       cumulative > 0 ? 'VIRTUAL_BUYER' : cumulative < -10 ? 'VIRTUAL_SELLER' : 'MIXED',
    market_narrative:      'Renewable oversupply suppressed RT prices below DA forecasts in off-peak hours.',
    hourly_data:           hourly,
  };
}

export const convergenceDataByZone: Record<string, ConvergenceData> = Object.fromEntries(
  zones.map(z => [z.id, genConvergence()])
);
