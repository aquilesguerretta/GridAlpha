export interface MarginalFuelData {
  zone: string;
  current_fuel: string;
  is_fossil: boolean;
  market_note: string;
  timeline_24h: Array<{
    hour: number;
    fuel_type: 'Nuclear' | 'Coal' | 'Gas' | 'Wind' | 'Solar';
  }>;
}

// Generate 24-hour timeline showing which fuel type is setting the marginal price
const generateTimeline = (pattern: 'baseload' | 'gas-heavy' | 'renewable-mix'): MarginalFuelData['timeline_24h'] => {
  const timeline: MarginalFuelData['timeline_24h'] = [];
  
  for (let hour = 0; hour < 24; hour++) {
    let fuel_type: 'Nuclear' | 'Coal' | 'Gas' | 'Wind' | 'Solar';
    
    if (pattern === 'baseload') {
      // Nuclear/Coal baseload with gas during peaks
      if (hour >= 7 && hour <= 9) fuel_type = 'Gas'; // Morning peak
      else if (hour >= 17 && hour <= 21) fuel_type = 'Gas'; // Evening peak
      else if (hour >= 10 && hour <= 16) fuel_type = 'Coal';
      else fuel_type = 'Nuclear';
    } else if (pattern === 'gas-heavy') {
      // More gas-dominated
      if (hour >= 6 && hour <= 22) fuel_type = 'Gas';
      else if (hour >= 2 && hour <= 5) fuel_type = 'Coal';
      else fuel_type = 'Nuclear';
    } else {
      // renewable-mix
      if (hour >= 10 && hour <= 16) fuel_type = Math.random() > 0.5 ? 'Solar' : 'Wind'; // Midday renewables
      else if (hour >= 7 && hour <= 9) fuel_type = 'Gas'; // Morning peak
      else if (hour >= 17 && hour <= 21) fuel_type = 'Gas'; // Evening peak
      else if (hour >= 22 || hour <= 5) fuel_type = 'Nuclear'; // Overnight
      else fuel_type = 'Coal';
    }
    
    timeline.push({ hour, fuel_type });
  }
  
  return timeline;
};

// Stub data for different zones
export const marginalFuelDataByZone: Record<string, MarginalFuelData> = {
  western_hub: {
    zone: 'Western Hub',
    current_fuel: 'Natural Gas',
    is_fossil: true,
    market_note: 'Natural gas units are currently setting the marginal price during peak demand hours. Wind generation is ramping down as evening approaches, shifting dispatch to combined-cycle gas turbines.',
    timeline_24h: generateTimeline('gas-heavy'),
  },
  eastern_hub: {
    zone: 'Eastern Hub',
    current_fuel: 'Wind',
    is_fossil: false,
    market_note: 'Renewable generation is at the margin with strong wind output across the region. Gas units are cycling down, and several coal plants are operating at minimum load. Negative congestion observed on key transmission interfaces.',
    timeline_24h: generateTimeline('renewable-mix'),
  },
  aep: {
    zone: 'AEP Zone',
    current_fuel: 'Coal',
    is_fossil: true,
    market_note: 'Coal-fired generation is setting the price during mid-load hours. Nuclear baseload continues at full output. Gas peakers coming online for evening demand.',
    timeline_24h: generateTimeline('baseload'),
  },
  aps: {
    zone: 'APS Zone',
    current_fuel: 'Natural Gas',
    is_fossil: true,
    market_note: 'Combined-cycle gas turbines are at the margin. Regional load forecast shows above-normal demand for this time of year, keeping gas units dispatched.',
    timeline_24h: generateTimeline('gas-heavy'),
  },
  atsi: {
    zone: 'ATSI Zone',
    current_fuel: 'Solar',
    is_fossil: false,
    market_note: 'Solar generation is depressing midday prices, with distributed PV reaching peak output. Merit order has shifted to renewables, displacing gas and coal generation.',
    timeline_24h: generateTimeline('renewable-mix'),
  },
  bge: {
    zone: 'BGE Zone',
    current_fuel: 'Nuclear',
    is_fossil: false,
    market_note: 'Nuclear baseload setting overnight prices with minimal load. All thermal units on economic minimum or offline. Extremely low LMPs during this period.',
    timeline_24h: generateTimeline('baseload'),
  },
  comed: {
    zone: 'ComEd Zone',
    current_fuel: 'Natural Gas',
    is_fossil: true,
    market_note: 'High demand in the Chicago metro area is pulling on gas-fired capacity. Several older coal units remain uneconomic at current gas prices.',
    timeline_24h: generateTimeline('gas-heavy'),
  },
  dom: {
    zone: 'Dominion Zone',
    current_fuel: 'Nuclear',
    is_fossil: false,
    market_note: 'Nuclear fleet operating at full capacity, setting the price floor. Load is below the combined output of nuclear and hydro resources.',
    timeline_24h: generateTimeline('baseload'),
  },
  dpl: {
    zone: 'DPL Zone',
    current_fuel: 'Wind',
    is_fossil: false,
    market_note: 'Strong offshore wind generation has pushed the marginal unit to renewables. Several gas peakers de-committed. Price volatility expected as wind forecast shows variability.',
    timeline_24h: generateTimeline('renewable-mix'),
  },
  peco: {
    zone: 'PECO Zone',
    current_fuel: 'Natural Gas',
    is_fossil: true,
    market_note: 'Gas peakers operating to serve Philadelphia area load. Transmission constraints limiting imports from western zones.',
    timeline_24h: generateTimeline('gas-heavy'),
  },
  ppl: {
    zone: 'PPL Zone',
    current_fuel: 'Coal',
    is_fossil: true,
    market_note: 'Coal units economically dispatched during shoulder hours. Nuclear providing base support, gas units ramping for evening peak.',
    timeline_24h: generateTimeline('baseload'),
  },
  pseg: {
    zone: 'PSEG Zone',
    current_fuel: 'Solar',
    is_fossil: false,
    market_note: 'High solar penetration in New Jersey is driving midday prices down. Battery storage systems charging during solar peak, expected to discharge during evening ramp.',
    timeline_24h: generateTimeline('renewable-mix'),
  },
};
