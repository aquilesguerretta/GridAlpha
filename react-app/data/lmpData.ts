export interface LMPDataPoint {
  timestamp: string;
  energy: number;
  congestion: number;
  loss: number;
  total: number;
}

export interface Zone {
  id: string;
  name: string;
}

export const zones: Zone[] = [
  { id: 'western_hub', name: 'Western Hub' },
  { id: 'eastern_hub', name: 'Eastern Hub' },
  { id: 'aep', name: 'AEP Zone' },
  { id: 'aps', name: 'APS Zone' },
  { id: 'atsi', name: 'ATSI Zone' },
  { id: 'bge', name: 'BGE Zone' },
  { id: 'comed', name: 'ComEd Zone' },
  { id: 'dom', name: 'Dominion Zone' },
  { id: 'dpl', name: 'DPL Zone' },
  { id: 'peco', name: 'PECO Zone' },
  { id: 'ppl', name: 'PPL Zone' },
  { id: 'pseg', name: 'PSEG Zone' },
];

// Generate realistic LMP data for the last 24 hours
const generateLMPData = (): LMPDataPoint[] => {
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  const data: LMPDataPoint[] = [];

  for (let i = 23; i >= 0; i--) {
    const time = new Date(now - i * hourInMs);
    const hour = time.getHours();
    
    // Base energy price follows typical daily pattern
    let baseEnergy = 35;
    if (hour >= 6 && hour <= 9) baseEnergy = 55; // Morning ramp
    if (hour >= 16 && hour <= 21) baseEnergy = 65; // Evening peak
    if (hour >= 22 || hour <= 5) baseEnergy = 25; // Overnight low
    
    // Add some randomness
    const energy = baseEnergy + (Math.random() - 0.5) * 15;
    
    // Occasional spike conditions
    const isSpike = Math.random() < 0.08; // 8% chance of spike
    const spikeMultiplier = isSpike ? 2 + Math.random() * 2 : 1;
    
    // Congestion can be positive or negative
    // Negative congestion = counter-flow, getting paid to use the line
    const baseCongestion = (Math.random() - 0.6) * 12; // Biased slightly negative
    const congestion = isSpike ? baseCongestion * spikeMultiplier * 3 : baseCongestion;
    
    // Loss is always positive, small component
    const loss = 1 + Math.random() * 3;
    
    const total = energy + congestion + loss;
    
    data.push({
      timestamp: time.toISOString(),
      energy: Number(energy.toFixed(2)),
      congestion: Number(congestion.toFixed(2)),
      loss: Number(loss.toFixed(2)),
      total: Number(total.toFixed(2)),
    });
  }
  
  return data;
};

// Generate data for each zone
export const lmpDataByZone: Record<string, LMPDataPoint[]> = {
  western_hub: generateLMPData(),
  eastern_hub: generateLMPData(),
  aep: generateLMPData(),
  aps: generateLMPData(),
  atsi: generateLMPData(),
  bge: generateLMPData(),
  comed: generateLMPData(),
  dom: generateLMPData(),
  dpl: generateLMPData(),
  peco: generateLMPData(),
  ppl: generateLMPData(),
  pseg: generateLMPData(),
};
