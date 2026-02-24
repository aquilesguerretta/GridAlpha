import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

interface LocalAPIResponse {
  total_mw: number;
  renewable_pct: number;
  renewable_mw: number;
  records: Array<{
    fuel_type: string;
    mw: number;
    is_renewable: boolean;
  }>;
}

interface GenerationDataPoint {
  timestamp: string;
  nuclear: number;
  gas: number;
  coal: number;
  wind: number;
  solar: number;
  hydro: number;
  storage: number;
}

// Map PJM fuel types to our categories
const fuelTypeMapping: Record<string, keyof Omit<GenerationDataPoint, 'timestamp'>> = {
  'Nuclear': 'nuclear',
  'Gas': 'gas',
  'Coal': 'coal',
  'Wind': 'wind',
  'Solar': 'solar',
  'Hydro': 'hydro',
  'Other Renewables': 'hydro',
  'Storage': 'storage',
  'Battery Storage': 'storage',
};

app.get("/api/generation", async (c) => {
  try {
    // Fetch data from local API
    const response = await fetch("http://localhost:8000/generation?snapshot=true");
    
    if (!response.ok) {
      throw new Error(`Local API returned ${response.status}`);
    }

    const apiData: LocalAPIResponse = await response.json();

    // Create current snapshot data point
    const currentData: GenerationDataPoint = {
      timestamp: new Date().toISOString(),
      nuclear: 0,
      gas: 0,
      coal: 0,
      wind: 0,
      solar: 0,
      hydro: 0,
      storage: 0,
    };

    // Map fuel types from records to our categories
    for (const record of apiData.records) {
      const fuelCategory = fuelTypeMapping[record.fuel_type];
      
      if (fuelCategory) {
        currentData[fuelCategory] += record.mw;
      }
    }

    // Generate historical data points (last 24 hours) with current as the latest
    const generationData: GenerationDataPoint[] = [];
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;

    for (let i = 23; i >= 1; i--) {
      const timestamp = new Date(now - i * hourInMs);
      // Use slightly varied historical data (simulate previous hours)
      generationData.push({
        timestamp: timestamp.toISOString(),
        nuclear: currentData.nuclear * (0.95 + Math.random() * 0.1),
        gas: currentData.gas * (0.9 + Math.random() * 0.2),
        coal: currentData.coal * (0.95 + Math.random() * 0.1),
        wind: currentData.wind * (0.7 + Math.random() * 0.6),
        solar: currentData.solar * (timestamp.getHours() >= 6 && timestamp.getHours() <= 18 ? 0.8 + Math.random() * 0.4 : 0),
        hydro: currentData.hydro * (0.95 + Math.random() * 0.1),
        storage: currentData.storage * (0.8 + Math.random() * 0.4),
      });
    }

    // Add current data as the latest point
    generationData.push(currentData);

    return c.json({
      data: generationData,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching generation data:", error);
    return c.json(
      { error: "Failed to fetch generation data" },
      500
    );
  }
});

export default app;
