export interface BatteryAction {
  hour: number;
  action: 'charge' | 'discharge' | 'idle';
  mw: number; // Positive for discharge, negative for charge
  price: number; // $/MWh
}

// Generate 24-hour battery arbitrage schedule based on duration and cycling cost
export const generateBatterySchedule = (
  duration: number = 4,
  cyclingCost: number = 20,
  efficiency: number = 0.87
): BatteryAction[] => {
  const schedule: BatteryAction[] = [];
  
  // First pass: calculate expected prices
  const avgChargePrice = 26; // Average of $22-30 range
  const avgDischargePrice = 65; // Average of $58-80 range
  
  // Check if arbitrage is profitable after cycling costs
  const grossProfitPerMWh = (avgDischargePrice * efficiency) - avgChargePrice;
  const netProfitPerMWh = grossProfitPerMWh - cyclingCost;
  
  // If not profitable, return all idle schedule
  const isProfitable = netProfitPerMWh > 0;
  
  // Calculate hours for charging and discharging based on duration
  const chargeHours = isProfitable ? Math.ceil(duration * 1.5) : 0;
  const dischargeHours = isProfitable ? Math.ceil(duration) : 0;
  
  // Charge first (overnight + midday), then discharge (morning + evening) — enforce chronological order
  const overnightChargeHours = Math.ceil(chargeHours * 0.67);
  const middayChargeHours = Math.floor(chargeHours * 0.33);
  const morningDischargeHours = Math.ceil(dischargeHours / 2);
  const eveningDischargeHours = Math.floor(dischargeHours / 2);

  // Build charge hours first (all before any discharge): 2–2+overnight, then 11–11+midday
  const chargeHourList: number[] = [];
  for (let h = 2; h < 2 + overnightChargeHours && h < 24; h++) chargeHourList.push(h);
  for (let h = 11; h < 11 + middayChargeHours && h < 24; h++) chargeHourList.push(h);
  const lastChargeHour = chargeHourList.length > 0 ? Math.max(...chargeHourList) : -1;

  // Discharge only after last charge hour
  const dischargeStart = Math.max(7, lastChargeHour + 1);
  const dischargeHourList: number[] = [];
  for (let h = dischargeStart; h < dischargeStart + morningDischargeHours && h < 24; h++) dischargeHourList.push(h);
  for (let h = Math.max(18, dischargeStart + morningDischargeHours); h < Math.min(24, 18 + eveningDischargeHours); h++) dischargeHourList.push(h);
  while (dischargeHourList.length < dischargeHours) {
    const next = (dischargeHourList[dischargeHourList.length - 1] ?? 0) + 1;
    if (next < 24) dischargeHourList.push(next);
    else break;
  }

  for (let hour = 0; hour < 24; hour++) {
    let action: 'charge' | 'discharge' | 'idle' = 'idle';
    let mw = 0;
    let price = 35;

    if (chargeHourList.includes(hour)) {
      action = 'charge';
      mw = -50;
      price = 22 + Math.random() * 8;
    } else if (dischargeHourList.includes(hour)) {
      action = 'discharge';
      mw = 50;
      price = 58 + Math.random() * 22;
    } else {
      price = 35 + Math.random() * 10;
    }
    
    schedule.push({
      hour,
      action,
      mw: Number(mw.toFixed(1)),
      price: Number(price.toFixed(2)),
    });
  }
  
  return schedule;
};

// Calculate gross and net daily profit
export const calculateDailyProfit = (
  schedule: BatteryAction[],
  batterySize: number,
  duration: number,
  efficiency: number = 0.87,
  cyclingCost: number = 20
): { grossProfit: number; netProfit: number; cycles: number } => {
  const chargingHours = schedule.filter(h => h.action === 'charge');
  const dischargingHours = schedule.filter(h => h.action === 'discharge');
  
  // If no activity, return zero
  if (chargingHours.length === 0 || dischargingHours.length === 0) {
    return { grossProfit: 0, netProfit: 0, cycles: 0 };
  }
  
  const avgChargePrice = chargingHours.reduce((sum, h) => sum + h.price, 0) / chargingHours.length;
  const avgDischargePrice = dischargingHours.reduce((sum, h) => sum + h.price, 0) / dischargingHours.length;
  const priceSpread = (avgDischargePrice * efficiency) - avgChargePrice;

  // Cycles: count charge->discharge transitions (each is one full cycle)
  let cycles = 0;
  for (let h = 1; h < schedule.length; h++) {
    if (schedule[h - 1].action === 'charge' && schedule[h].action === 'discharge') cycles += 1;
  }
  if (cycles === 0 && chargingHours.length > 0 && dischargingHours.length > 0) cycles = 1;

  const grossProfit = cycles * batterySize * duration * priceSpread;
  const cyclingCostTotal = cycles * cyclingCost * batterySize * duration;
  const netProfit = grossProfit - cyclingCostTotal;
  
  return { grossProfit, netProfit, cycles };
};



export const getArbitrageSignal = (profit: number): {
  status: 'STRONG' | 'MODERATE' | 'WEAK';
  color: string;
  description: string;
} => {
  if (profit > 20) {
    return {
      status: 'STRONG',
      color: 'text-secondary',
      description: 'Strong arbitrage opportunity',
    };
  } else if (profit > 10) {
    return {
      status: 'MODERATE',
      color: 'text-yellow-500',
      description: 'Moderate arbitrage potential',
    };
  } else {
    return {
      status: 'WEAK',
      color: 'text-muted-foreground',
      description: 'Limited arbitrage opportunity',
    };
  }
};
