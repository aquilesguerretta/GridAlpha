export interface ConvergenceHourlyData {
  hour: number;
  da_price: number; // Day-Ahead price ($/MWh)
  rt_price: number; // Real-Time price ($/MWh)
  spread: number; // RT - DA (positive = profitable for virtual buyers)
}

export interface ConvergenceData {
  zone: string;
  hourly_data: ConvergenceHourlyData[];
  cumulative_spread: number; // Total daily P&L for virtual trading
  total_scarcity_hours: number;
  total_oversupply_hours: number;
  market_narrative: string;
  dominant_signal: 'VIRTUAL_BUYER' | 'VIRTUAL_SELLER' | 'MIXED';
}

// Generate realistic convergence data with scarcity spikes and occasional oversupply
function generateConvergenceData(zone: string, seed: number): ConvergenceData {
  const hourly_data: ConvergenceHourlyData[] = [];
  let cumulative_spread = 0;
  let scarcity_hours = 0;
  let oversupply_hours = 0;

  for (let hour = 0; hour < 24; hour++) {
    // Base DA price with daily pattern
    let da_price = 35;
    if (hour >= 7 && hour <= 9) da_price = 55; // Morning peak
    if (hour >= 17 && hour <= 20) da_price = 65; // Evening peak
    if (hour >= 22 || hour <= 5) da_price = 25; // Off-peak

    // Add zone variation
    da_price += (seed % 20) - 10;

    // RT price typically tracks DA but with variations
    let rt_price = da_price + (Math.sin(hour + seed) * 5);

    // Add occasional scarcity spikes (RT >> DA)
    if ((hour === 8 && seed % 3 === 0) || (hour === 18 && seed % 2 === 0)) {
      rt_price = da_price + 30 + Math.random() * 40; // Spike $30-70 above DA
    }

    // Add occasional oversupply (RT << DA)
    if ((hour === 3 && seed % 4 === 0) || (hour === 13 && seed % 5 === 0)) {
      rt_price = da_price - 15 - Math.random() * 20; // Drop $15-35 below DA
      if (rt_price < 0) rt_price = Math.random() * 5 - 2; // Occasionally negative
    }

    // Midday renewable oversupply
    if (hour >= 11 && hour <= 14 && seed % 3 === 1) {
      rt_price = Math.max(0, da_price - 10 - Math.random() * 15);
    }

    const spread = rt_price - da_price;
    cumulative_spread += spread;

    if (spread > 5) scarcity_hours++;
    if (spread < -5) oversupply_hours++;

    hourly_data.push({
      hour,
      da_price: Number(da_price.toFixed(2)),
      rt_price: Number(rt_price.toFixed(2)),
      spread: Number(spread.toFixed(2)),
    });
  }

  // Determine dominant signal and narrative
  let dominant_signal: 'VIRTUAL_BUYER' | 'VIRTUAL_SELLER' | 'MIXED';
  let market_narrative: string;
  
  const profitable_buyer_hours = hourly_data.filter(d => d.spread > 0).length;
  const profitable_seller_hours = hourly_data.filter(d => d.spread < 0).length;
  
  if (profitable_buyer_hours > profitable_seller_hours + 5) {
    dominant_signal = 'VIRTUAL_BUYER';
    market_narrative = `Real-Time scarcity drove prices above Day-Ahead forecasts — virtual buyers who bought DA and sold RT were profitable today on ${profitable_buyer_hours} of 24 hours.`;
  } else if (profitable_seller_hours > profitable_buyer_hours + 5) {
    dominant_signal = 'VIRTUAL_SELLER';
    market_narrative = `Wind and solar suppressed Real-Time prices below Day-Ahead forecasts — virtual sellers who sold RT and bought DA were profitable today on ${profitable_seller_hours} of 24 hours.`;
  } else {
    dominant_signal = 'MIXED';
    market_narrative = `Mixed convergence patterns with ${profitable_buyer_hours} buyer-favorable hours and ${profitable_seller_hours} seller-favorable hours — balanced market conditions suggest accurate day-ahead forecasting.`;
  }

  return {
    zone,
    hourly_data,
    cumulative_spread: Number(cumulative_spread.toFixed(2)),
    total_scarcity_hours: scarcity_hours,
    total_oversupply_hours: oversupply_hours,
    market_narrative,
    dominant_signal,
  };
}

export const convergenceDataByZone: Record<string, ConvergenceData> = {
  western_hub: generateConvergenceData('Western Hub', 1),
  eastern_hub: generateConvergenceData('Eastern Hub', 2),
  aep: generateConvergenceData('AEP Zone', 3),
  aps: generateConvergenceData('APS Zone', 4),
  atsi: generateConvergenceData('ATSI Zone', 5),
  bge: generateConvergenceData('BGE Zone', 6),
  comed: generateConvergenceData('ComEd Zone', 7),
  dom: generateConvergenceData('Dominion Zone', 8),
  dpl: generateConvergenceData('DPL Zone', 9),
  peco: generateConvergenceData('PECO Zone', 10),
  ppl: generateConvergenceData('PPL Zone', 11),
  pseg: generateConvergenceData('PSEG Zone', 12),
};
