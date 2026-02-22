import { zones } from './lmpData';

export interface WeatherLoadDataPoint {
  temperature: number;
  weather_condition: string;
  weather_alert: string | null;
  load_forecast: number;
  load_actual: number;
  load_deviation_pct: number;
  is_uncertainty_driver: boolean;
}

export const weatherLoadDataByZone: Record<string, WeatherLoadDataPoint> = Object.fromEntries(
  zones.map(z => {
    const forecast = 3000 + Math.random() * 2000;
    const actual   = forecast * (0.97 + Math.random() * 0.06);
    const dev      = ((actual - forecast) / forecast) * 100;
    return [z.id, {
      temperature:           35 + Math.random() * 20,
      weather_condition:     'Clear',
      weather_alert:         null,
      load_forecast:         +forecast.toFixed(0),
      load_actual:           +actual.toFixed(0),
      load_deviation_pct:    +dev.toFixed(2),
      is_uncertainty_driver: Math.abs(dev) > 5,
    }];
  })
);
