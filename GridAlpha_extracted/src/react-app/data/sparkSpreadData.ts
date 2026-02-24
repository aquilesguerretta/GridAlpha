export interface SparkSpreadData {
  zone: string;
  spread: number; // $/MWh
}

// Spark spread = Power price - (Gas price * Heat rate) - Variable O&M
// Positive = profitable to run, Negative = losing money
export const sparkSpreadData: SparkSpreadData[] = [
  // Hubs
  { zone: '— Western Hub', spread: 6.8 },
  { zone: '— Eastern Hub', spread: -11.3 },
  // Zones (all 22 PJM zones)
  { zone: 'AEP', spread: 12.4 },
  { zone: 'APS', spread: 8.9 },
  { zone: 'ATSI', spread: -8.2 },
  { zone: 'BGE', spread: 15.3 },
  { zone: 'ComEd', spread: 18.7 },
  { zone: 'DAY', spread: -2.1 },
  { zone: 'DEOK', spread: 5.6 },
  { zone: 'DOM', spread: -3.5 },
  { zone: 'DPL', spread: 22.1 },
  { zone: 'DUQ', spread: 11.2 },
  { zone: 'EKPC', spread: -5.8 },
  { zone: 'JC', spread: 3.4 },
  { zone: 'ME', spread: 9.7 },
  { zone: 'PE', spread: 14.8 },
  { zone: 'PEP', spread: -6.3 },
  { zone: 'PJM', spread: 7.1 },
  { zone: 'PL', spread: 16.5 },
  { zone: 'PN', spread: -4.2 },
  { zone: 'PS', spread: 19.3 },
  { zone: 'RECO', spread: -9.1 },
  { zone: 'UG', spread: 2.8 },
  { zone: 'WCPO', spread: 13.6 },
];

// Calculate system-wide average
export const averageSparkSpread = 
  sparkSpreadData.reduce((sum, d) => sum + d.spread, 0) / sparkSpreadData.length;

// Determine profitability signal
export const getProfitabilitySignal = (avgSpread: number): {
  status: 'FAVORABLE' | 'MARGINAL' | 'UNFAVORABLE';
  color: string;
  description: string;
} => {
  if (avgSpread > 10) {
    return {
      status: 'FAVORABLE',
      color: 'text-secondary',
      description: 'Strong economics for gas generation',
    };
  } else if (avgSpread > 0) {
    return {
      status: 'MARGINAL',
      color: 'text-yellow-500',
      description: 'Marginal profitability for gas generators',
    };
  } else {
    return {
      status: 'UNFAVORABLE',
      color: 'text-destructive',
      description: 'Negative economics - generators losing money',
    };
  }
};
