import { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router";
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

export default function App() {
  // Global zone selector state shared across all tabs
  const [selectedZone, setSelectedZone] = useState(zones[0].id);

  return (
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
  );
}
