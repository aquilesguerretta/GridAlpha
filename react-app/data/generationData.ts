export interface GenerationRecord {
  timestamp: string;
  nuclear: number; gas: number; coal: number;
  wind: number; solar: number; hydro: number; storage: number;
  temperature: number; load_forecast: number; load_actual: number;
}

export const generationData: GenerationRecord[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp:     `2026-02-22T${String(i).padStart(2, '0')}:00:00`,
  nuclear:       32000 + (Math.random() - 0.5) * 500,
  gas:           28000 + (Math.random() - 0.5) * 3000,
  coal:          7000  + (Math.random() - 0.5) * 1000,
  wind:          15000 + (Math.random() - 0.5) * 5000,
  solar:         i >= 7 && i <= 19 ? 12000 * Math.sin(Math.PI * (i - 7) / 12) : 0,
  hydro:         5000  + (Math.random() - 0.5) * 500,
  storage:       (Math.random() - 0.5) * 2000,
  temperature:   35 + Math.random() * 5,
  load_forecast: 85000 + (Math.random() - 0.5) * 5000,
  load_actual:   85000 + (Math.random() - 0.5) * 5000,
}));

export const currentGeneration = generationData[generationData.length - 1];
