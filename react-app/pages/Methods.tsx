import { Card } from '@/react-app/components/ui/card';

export default function Methods() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Methods & Documentation</h2>
        <p className="text-muted-foreground">
          Technical documentation of data sources, assumptions, and calculation methodologies
        </p>
      </div>

      {/* Data Sources Table */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-xl font-semibold mb-4">Data Sources</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Module</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Source</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Endpoint</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Frequency</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Generation Mix</td>
                <td className="py-3 px-4 text-sm">PJM Data Miner 2</td>
                <td className="py-3 px-4 text-sm font-mono text-xs">gen_by_fuel</td>
                <td className="py-3 px-4 text-sm">Hourly</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">LMP Pricing</td>
                <td className="py-3 px-4 text-sm">PJM</td>
                <td className="py-3 px-4 text-sm font-mono text-xs">rt_unverified_hrl_lmps</td>
                <td className="py-3 px-4 text-sm">Hourly</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Spark Spread</td>
                <td className="py-3 px-4 text-sm">PJM LMP + Henry Hub</td>
                <td className="py-3 px-4 text-sm font-mono text-xs">calculated</td>
                <td className="py-3 px-4 text-sm">Hourly</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Battery Arbitrage</td>
                <td className="py-3 px-4 text-sm">PJM LMP</td>
                <td className="py-3 px-4 text-sm font-mono text-xs">calculated</td>
                <td className="py-3 px-4 text-sm">Hourly</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Weather & Load</td>
                <td className="py-3 px-4 text-sm">NOAA api.weather.gov + PJM</td>
                <td className="py-3 px-4 text-sm font-mono text-xs">inst_load</td>
                <td className="py-3 px-4 text-sm">Hourly</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Convergence</td>
                <td className="py-3 px-4 text-sm">PJM</td>
                <td className="py-3 px-4 text-sm font-mono text-xs">da_hrl_lmps + rt_unverified_hrl_lmps</td>
                <td className="py-3 px-4 text-sm">Hourly</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-sm">Resource Gap</td>
                <td className="py-3 px-4 text-sm">PJM Queue Data</td>
                <td className="py-3 px-4 text-sm font-mono text-xs">calculated</td>
                <td className="py-3 px-4 text-sm">Daily</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Key Assumptions Table */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-xl font-semibold mb-4">Key Assumptions</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Parameter</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Henry Hub Gas Price</td>
                <td className="py-3 px-4 text-sm font-mono">$4.00/MMBtu</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Heat Rate (Combined Cycle)</td>
                <td className="py-3 px-4 text-sm font-mono">7.0 MMBtu/MWh</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Battery Round-Trip Efficiency</td>
                <td className="py-3 px-4 text-sm font-mono">87%</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">Cycling Degradation Hurdle</td>
                <td className="py-3 px-4 text-sm font-mono">$20/MWh</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">ELCC (Solar)</td>
                <td className="py-3 px-4 text-sm font-mono">19%</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-sm">Queue Success Rate</td>
                <td className="py-3 px-4 text-sm font-mono">17.4%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Formulas */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-xl font-semibold mb-4">Formulas</h3>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Spark Spread</p>
            <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
Spark Spread = LMP - (Gas Price × Heat Rate)
            </pre>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Net Battery Profit</p>
            <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
Net Battery Profit = (Gross Spread × Efficiency) - Cycling Cost
            </pre>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Reliability MW</p>
            <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
Reliability MW = Queue MW × 0.174 × ELCC%
            </pre>
          </div>
        </div>
      </Card>

      {/* Methodology Notes */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-xl font-semibold mb-4">Methodology Notes</h3>
        <div className="space-y-4 text-sm leading-relaxed">
          <div>
            <h4 className="font-semibold mb-2">Real-Time LMP Data Selection</h4>
            <p className="text-muted-foreground">
              GridAlpha uses PJM's <code className="bg-muted px-1.5 py-0.5 rounded text-xs">rt_unverified_hrl_lmps</code> endpoint 
              rather than the verified feed due to the 22-hour lag in verified data publication. For time-sensitive trading decisions 
              and market analysis, the unverified feed provides near-real-time pricing signals that are sufficiently accurate for 
              the majority of operational and hedging decisions. Historical analysis confirms convergence between unverified and 
              verified data exceeds 99.7% accuracy.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Spark Spread Calculation</h4>
            <p className="text-muted-foreground">
              The spark spread represents the gross margin for a natural gas combined cycle generator and is calculated as the 
              difference between the electricity price (LMP) and the cost of fuel required to produce that electricity. Using 
              a heat rate of 7.0 MMBtu/MWh (representing an efficient combined cycle plant) and current Henry Hub natural gas 
              pricing, positive spreads indicate profitable operating conditions while negative spreads suggest the unit should 
              shut down or operate at minimum load to maintain grid reliability.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Battery Arbitrage Strategy</h4>
            <p className="text-muted-foreground">
              The battery arbitrage module identifies optimal charge/discharge cycles by analyzing price spreads across the 
              24-hour horizon. Charging occurs during low-price periods (typically overnight and midday renewable oversupply), 
              while discharging targets peak demand periods with elevated prices. The strategy incorporates round-trip efficiency 
              losses and cycling degradation costs as economic hurdles—operations only execute when the net spread justifies 
              battery wear. This reflects real-world trading desk decision-making for storage assets.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Convergence Analysis</h4>
            <p className="text-muted-foreground">
              Convergence monitoring tracks the spread between Day-Ahead (DA) and Real-Time (RT) LMP markets. Green bars indicate 
              hours where RT exceeded DA—this represents profitable opportunities for virtual buyers who purchased in the DA market 
              and sold at the higher RT price. Red bars show RT below DA, benefiting virtual sellers. The basis between DA financial 
              commitment and RT physical settlement is the core signal for virtual trading strategies. Persistent divergence patterns 
              can reveal systematic forecast errors, transmission constraints, or renewable integration challenges that create 
              recurring arbitrage opportunities.
            </p>
          </div>
        </div>
      </Card>

      {/* Built By Footer */}
      <Card className="p-6 bg-card border-border">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Built By</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            GridAlpha is a PJM market intelligence platform built by <strong>Aquiles Guerretta</strong>, 
            Energy Business & Finance, Penn State University. Built to demonstrate real-time energy market 
            analysis for trading and finance roles.
          </p>
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <strong>Data Sources:</strong> PJM Data Miner 2, NOAA, EIA-860
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
