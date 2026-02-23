export interface WeatherLoadData {
  zone: string;
  temperature: number; // Fahrenheit
  weather_condition: 'sunny' | 'cloudy' | 'snowy';
  weather_alert: 'Normal' | 'Heat Advisory' | 'Cold Snap';
  load_forecast: number; // MW
  load_actual: number; // MW
  load_deviation_pct: number; // percentage
  is_uncertainty_driver: boolean;
}

// Generate realistic weather and load data for each zone
function generateWeatherLoadData(zone: string, seed: number): WeatherLoadData {
  // Base temperature with zone variation
  let temperature = 48 + (seed % 15);
  
  // Determine weather condition based on temperature and seed
  let weather_condition: 'sunny' | 'cloudy' | 'snowy' = 'sunny';
  if (temperature < 35) {
    weather_condition = 'snowy';
  } else if (seed % 3 === 0) {
    weather_condition = 'cloudy';
  }
  
  // Base load with zone variation
  const baseLoad = 55000 + (seed * 1000);
  const loadForecast = baseLoad + Math.random() * 2000;
  
  // Most zones have good forecast, but some have deviations
  let loadActual = loadForecast;
  let deviationPct = 0;
  
  // Create occasional deviations (3-7%)
  if (seed % 4 === 0 || seed % 7 === 0) {
    deviationPct = 3 + Math.random() * 4; // 3-7% deviation
    loadActual = loadForecast * (1 + deviationPct / 100);
  } else {
    deviationPct = (Math.random() - 0.5) * 2; // -1% to +1%
    loadActual = loadForecast * (1 + deviationPct / 100);
  }
  
  const isUncertaintyDriver = Math.abs(deviationPct) > 5;
  
  return {
    zone,
    temperature: Math.round(temperature * 10) / 10,
    weather_condition,
    weather_alert: 'Normal',
    load_forecast: Math.round(loadForecast),
    load_actual: Math.round(loadActual),
    load_deviation_pct: Math.round(deviationPct * 10) / 10,
    is_uncertainty_driver: isUncertaintyDriver,
  };
}

export const weatherLoadDataByZone: Record<string, WeatherLoadData> = {
  western_hub: generateWeatherLoadData('Western Hub', 1),
  eastern_hub: generateWeatherLoadData('Eastern Hub', 2),
  aep: generateWeatherLoadData('AEP Zone', 3),
  aps: generateWeatherLoadData('APS Zone', 4),
  atsi: generateWeatherLoadData('ATSI Zone', 5),
  bge: generateWeatherLoadData('BGE Zone', 6),
  comed: generateWeatherLoadData('ComEd Zone', 7),
  dom: generateWeatherLoadData('Dominion Zone', 8),
  dpl: generateWeatherLoadData('DPL Zone', 9),
  peco: generateWeatherLoadData('PECO Zone', 10),
  ppl: generateWeatherLoadData('PPL Zone', 11),
  pseg: generateWeatherLoadData('PSEG Zone', 12),
};
