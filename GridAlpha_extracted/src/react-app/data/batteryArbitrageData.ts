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
  
  // Split discharge across morning and evening peaks
  const morningDischargeHours = Math.ceil(dischargeHours / 2);
  const eveningDischargeHours = Math.floor(dischargeHours / 2);
  
  // Split charging across overnight and midday periods
  const overnightChargeHours = Math.ceil(chargeHours * 0.67); // 2/3 overnight
  const middayChargeHours = Math.floor(chargeHours * 0.33); // 1/3 midday
  
  for (let hour = 0; hour < 24; hour++) {
    let action: 'charge' | 'discharge' | 'idle' = 'idle';
    let mw = 0;
    let price = 35; // Base price
    
    if (isProfitable) {
      // Overnight charging (low price) - starts at 2 AM
      if (hour >= 2 && hour < 2 + overnightChargeHours) {
        action = 'charge';
        mw = -50;
        price = 22 + Math.random() * 8; // $22-30/MWh
      }
      // Morning discharge peak - starts at 7 AM
      else if (hour >= 7 && hour < 7 + morningDischargeHours) {
        action = 'discharge';
        mw = 50;
        price = 58 + Math.random() * 12; // $58-70/MWh
      }
      // Midday charging (renewable peak) - starts at 11 AM
      else if (hour >= 11 && hour < 11 + middayChargeHours) {
        action = 'charge';
        mw = -50;
        price = 22 + Math.random() * 8; // $22-30/MWh
      }
      // Evening discharge peak - starts at 6 PM
      else if (hour >= 18 && hour < 18 + eveningDischargeHours) {
        action = 'discharge';
        mw = 50;
        price = 65 + Math.random() * 15; // $65-80/MWh
      }
      // Idle periods
      else {
        action = 'idle';
        mw = 0;
        price = 35 + Math.random() * 10; // $35-45/MWh
      }
    } else {
      // Not profitable - all idle
      action = 'idle';
      mw = 0;
      price = 35 + Math.random() * 10; // $35-45/MWh
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
  const grossProfit = batterySize * duration * priceSpread;
  
  // Calculate cycles (1 full charge/discharge = 1 cycle)
  const cycles = 1; // Assuming 1 full cycle per day
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
