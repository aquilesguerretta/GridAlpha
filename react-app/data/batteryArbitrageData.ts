export interface BatteryAction {
  hour: number;
  action: 'charge' | 'discharge' | 'idle';
  mw: number;
  price: number;
}

export function generateBatterySchedule(
  duration: number,
  cyclingCost: number,
  efficiency: number
): BatteryAction[] {
  const prices = Array.from({ length: 24 }, (_, i) => {
    const base = 28;
    const morning = i >= 7  && i <= 9  ? 15 : 0;
    const evening = i >= 17 && i <= 21 ? 18 : 0;
    const night   = i <= 5             ? -8 : 0;
    const solar   = i >= 10 && i <= 15 ? -5 : 0;
    return +(base + morning + evening + night + solar + (Math.random() - 0.5) * 3).toFixed(2);
  });

  const sorted   = [...prices].map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const chargeH  = new Set(sorted.slice(0, 4).map(x => x.i));
  const dischargeH = new Set(sorted.slice(-4).map(x => x.i));

  return prices.map((price, hour) => {
    const action: BatteryAction['action'] =
      chargeH.has(hour) ? 'charge' : dischargeH.has(hour) ? 'discharge' : 'idle';
    return { hour, action, mw: action === 'charge' ? -50 : action === 'discharge' ? 50 : 0, price };
  });
}

export function calculateDailyProfit(
  schedule: BatteryAction[],
  batterySize: number,
  duration: number,
  efficiency: number,
  cyclingCost: number
) {
  const chargeAvg    = schedule.filter(h => h.action === 'charge').reduce((s, h) => s + h.price, 0) /
                       (schedule.filter(h => h.action === 'charge').length || 1);
  const dischargeAvg = schedule.filter(h => h.action === 'discharge').reduce((s, h) => s + h.price, 0) /
                       (schedule.filter(h => h.action === 'discharge').length || 1);
  const grossProfit  = (dischargeAvg - chargeAvg / efficiency) * batterySize * duration;
  const cycles       = batterySize * duration;
  const netProfit    = grossProfit - cycles * cyclingCost;
  return { grossProfit: +grossProfit.toFixed(2), netProfit: +netProfit.toFixed(2), cycles: +cycles.toFixed(0) };
}

export function getArbitrageSignal(profitPerMwh: number) {
  if (profitPerMwh > 10) return { status: 'STRONG',  color: 'text-emerald-500', description: 'Excellent arbitrage conditions.' };
  if (profitPerMwh > 0)  return { status: 'MODERATE', color: 'text-yellow-500', description: 'Positive but thin margins.' };
  return                   { status: 'WEAK',   color: 'text-red-500',     description: 'Below cycling cost threshold.' };
}
