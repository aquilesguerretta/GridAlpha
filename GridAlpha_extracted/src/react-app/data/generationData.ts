export interface GenerationDataPoint {
  timestamp: string;
  nuclear: number;
  gas: number;
  coal: number;
  wind: number;
  solar: number;
  hydro: number;
  storage: number;
  temperature: number; // Fahrenheit
  load_forecast: number; // MW
  load_actual: number; // MW
}

// Generate sample data for the last 24 hours
const now = Date.now();
const hourInMs = 60 * 60 * 1000;

export const generationData: GenerationDataPoint[] = Array.from({ length: 24 }, (_, i) => {
  const time = new Date(now - (23 - i) * hourInMs);
  const hour = time.getHours();
  
  // Simulate realistic generation patterns
  const solarMultiplier = hour >= 6 && hour <= 18 ? Math.sin((hour - 6) * Math.PI / 12) : 0;
  const windMultiplier = 0.5 + Math.random() * 0.5;
  
  // Temperature pattern: cooler overnight, warmer during day
  let temperature = 50;
  if (hour >= 6 && hour <= 18) {
    temperature = 45 + (Math.sin((hour - 6) * Math.PI / 12) * 15);
  } else {
    temperature = 38 + Math.random() * 8;
  }
  temperature += (Math.random() - 0.5) * 4; // Add some variance
  
  // Load forecast and actual - mostly aligned with occasional deviations
  const baseLoad = 60000 + (hour >= 16 && hour <= 21 ? 15000 : 0) + (hour >= 0 && hour <= 5 ? -8000 : 0);
  const loadForecast = baseLoad + Math.random() * 2000;
  let loadActual = loadForecast + (Math.random() - 0.5) * 1500; // Usually within 1.5%
  
  // Occasional larger deviations (3-7%)
  if (i === 8 || i === 18) {
    loadActual = loadForecast * (1 + 0.03 + Math.random() * 0.04); // 3-7% over
  }
  
  return {
    timestamp: time.toISOString(),
    nuclear: 25000 + Math.random() * 2000,
    gas: 18000 + Math.random() * 5000 + (hour >= 16 && hour <= 21 ? 8000 : 0),
    coal: 8000 + Math.random() * 2000,
    wind: 6000 * windMultiplier,
    solar: 4000 * solarMultiplier,
    hydro: 2000 + Math.random() * 1000,
    storage: hour >= 17 && hour <= 22 ? 1500 : -500,
    temperature: Math.round(temperature * 10) / 10,
    load_forecast: Math.round(loadForecast),
    load_actual: Math.round(loadActual),
  };
});

export const currentGeneration = generationData[generationData.length - 1];

export const fuelColors = {
  nuclear: '#9333ea',  // purple
  gas: '#f97316',      // orange
  coal: '#6b7280',     // gray
  wind: '#10b981',     // green
  solar: '#fbbf24',    // yellow
  hydro: '#3b82f6',    // blue
  storage: '#ec4899',  // pink
};
