import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';

const RAILWAY_HEALTH_URL = 'https://gridalpha-production.up.railway.app/health';
const WARMUP_DELAY_MS = 3000;

interface RailwayWarmupContextValue {
  ready: boolean;
}

const RailwayWarmupContext = createContext<RailwayWarmupContextValue>({ ready: false });

export function RailwayWarmupProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await fetch(RAILWAY_HEALTH_URL);
      } catch {
        // Ignore — wake-up ping, cold start may fail
      }
      if (!cancelled) {
        timeoutRef.current = setTimeout(() => {
          if (!cancelled) setReady(true);
        }, WARMUP_DELAY_MS);
      }
    })();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <RailwayWarmupContext.Provider value={{ ready }}>
      {children}
    </RailwayWarmupContext.Provider>
  );
}

export function useRailwayWarmup() {
  return useContext(RailwayWarmupContext);
}
