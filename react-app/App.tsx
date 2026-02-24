import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router";
import { RailwayWarmupProvider } from "@/react-app/contexts/RailwayWarmupContext";
import HomePage from "@/react-app/pages/Home";
import PriceIntelligence from "@/react-app/pages/PriceIntelligence";
import ErrorBoundary from "@/react-app/components/ErrorBoundary";
import SparkSpread from "@/react-app/pages/SparkSpread";
import BatteryArbitrage from "@/react-app/pages/BatteryArbitrage";
import MarginalFuel from "@/react-app/pages/MarginalFuel";
import ResourceGap from "@/react-app/pages/ResourceGap";
import Convergence from "@/react-app/pages/Convergence";
import Methods from "@/react-app/pages/Methods";
import Navigation from "@/react-app/components/Navigation";
import { zones } from "@/react-app/data/lmpData";

const ZONE_STORAGE_KEY = 'gridalpha_zone';

function getInitialZone(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(ZONE_STORAGE_KEY) : null;
  const validIds = new Set((zones ?? []).map((z) => z.id));
  if (stored && validIds.has(stored)) return stored;
  return zones[0]?.id ?? 'western_hub';
}

export default function App() {
  // Global zone selector state shared across all tabs (persisted to localStorage)
  const [selectedZone, setSelectedZone] = useState(getInitialZone);

  useEffect(() => {
    localStorage.setItem(ZONE_STORAGE_KEY, selectedZone);
  }, [selectedZone]);

  return (
    <RailwayWarmupProvider>
    <Router>
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/pricing" element={<ErrorBoundary><PriceIntelligence selectedZone={selectedZone} setSelectedZone={setSelectedZone} /></ErrorBoundary>} />
            <Route path="/spark-spread" element={<SparkSpread />} />
            <Route path="/battery-arbitrage" element={<BatteryArbitrage selectedZone={selectedZone} setSelectedZone={setSelectedZone} />} />
            <Route path="/marginal-fuel" element={<MarginalFuel selectedZone={selectedZone} setSelectedZone={setSelectedZone} />} />
            <Route path="/resource-gap" element={<ResourceGap selectedZone={selectedZone} setSelectedZone={setSelectedZone} />} />
            <Route path="/convergence" element={<Convergence selectedZone={selectedZone} setSelectedZone={setSelectedZone} />} />
            <Route path="/methods" element={<Methods />} />
          </Routes>
        </main>
      </div>
    </Router>
    </RailwayWarmupProvider>
  );
}
