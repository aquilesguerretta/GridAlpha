import { useState, useEffect } from 'react';
import { GenerationDataPoint } from '@/react-app/data/generationData';

interface GenerationDataResponse {
  data: GenerationDataPoint[];
  updatedAt: string;
}

export function useGenerationData() {
  const [data, setData] = useState<GenerationDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/generation');
      
      if (!response.ok) {
        throw new Error('Failed to fetch generation data');
      }

      const result: GenerationDataResponse = await response.json();
      setData(result.data);
      setLastUpdated(result.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching generation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Refresh data every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refetch: fetchData,
  };
}
