"""
GridAlpha — Battery Storage Arbitrage Calculator
Models economics of a grid-scale battery charging cheap, discharging expensive.

Strategy
--------
Within a 24-hour window per zone:
  1. Rank all available hourly LMP prices.
  2. Designate the N cheapest hours as charge candidates; compute charge_price.
  3. From the remaining (expensive) hours, gate each one through a profitability
     hurdle: only include a discharge hour if
         discharge_lmp × η  −  charge_price  >  cycling_cost
  4. From the hours that pass the gate, take up to N as discharge hours.
  5. Apply round-trip efficiency to the discharge revenue.

Formula
-------
    charge_price       = mean(N cheapest LMP hours)                          $/MWh
    discharge_price    = mean(qualifying discharge hours) × η                $/MWh
    daily_spread       = discharge_price − charge_price                      $/MWh  (gross)
    total_cycling_costs= cycling_cost × n_actual_discharge_events            $
    net_profit         = daily_spread − cycling_cost                         $/MWh

Dispatch gate (per discharge hour)
-----------------------------------
    discharge_lmp × η  −  charge_price  >  cycling_cost

Only hours that clear this hurdle are dispatched.  Hours that do not are
left idle — the battery simply does not cycle when it is uneconomic to do so.

Interpretation
--------------
  net_profit > 0  →  Spread exceeds V-O&M; dispatch is economic.
  net_profit ≤ 0  →  Price differential too compressed after cycling wear.

Round-trip efficiency
---------------------
  0.87 (87%) is the industry standard for lithium-ion BESS.

Cycling cost (Variable O&M)
----------------------------
  $20/MWh default — represents battery degradation, maintenance, and
  other variable costs incurred per MWh of energy dispatched.
  Industry range: $5–$40/MWh depending on chemistry and cycle depth.

LMP source
----------
  data/lmp.py → rt_unverified_hrl_lmps (updated hourly, all 22 PJM zones).
  24-hour window by default.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd
from loguru import logger

from data.lmp import LMPClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_EFFICIENCY: float = 0.87        # round-trip (AC→DC→AC) for Li-ion BESS
DEFAULT_CHARGE_HOURS: int = 4           # cheapest hours to charge
DEFAULT_DISCHARGE_HOURS: int = 4        # most expensive hours to discharge
DEFAULT_WINDOW_HOURS: int = 24          # lookback window
DEFAULT_CYCLING_COST: float = 20.00     # variable O&M per MWh dispatched ($/MWh)

PJM_TIMEZONE = ZoneInfo("America/New_York")


# ---------------------------------------------------------------------------
# Result dataclass (plain dict-compatible for DataFrame)
# ---------------------------------------------------------------------------


class ZoneArbitrageResult:
    """Holds the arbitrage calculation for one zone."""

    __slots__ = (
        "zone_name",
        "charge_hours",
        "discharge_hours",
        "charge_price",
        "discharge_price",
        "round_trip_efficiency",
        "cycling_cost",
        "daily_spread_per_mwh",
        "total_cycling_costs",
        "net_profit_per_mwh",
        "is_profitable",
        "timestamp",
        "hours_available",
        "charge_hours_used",
        "discharge_hours_used",
        "hours_gated_out",
    )

    def __init__(
        self,
        zone_name: str,
        charge_hours: list[str],
        discharge_hours: list[str],
        charge_price: float,
        discharge_price: float,
        round_trip_efficiency: float,
        cycling_cost: float,
        daily_spread_per_mwh: float,
        total_cycling_costs: float,
        net_profit_per_mwh: float,
        is_profitable: bool,
        timestamp: str,
        hours_available: int,
        charge_hours_used: int,
        discharge_hours_used: int,
        hours_gated_out: int,
    ) -> None:
        self.zone_name = zone_name
        self.charge_hours = charge_hours
        self.discharge_hours = discharge_hours
        self.charge_price = charge_price
        self.discharge_price = discharge_price
        self.round_trip_efficiency = round_trip_efficiency
        self.cycling_cost = cycling_cost
        self.daily_spread_per_mwh = daily_spread_per_mwh
        self.total_cycling_costs = total_cycling_costs
        self.net_profit_per_mwh = net_profit_per_mwh
        self.is_profitable = is_profitable
        self.timestamp = timestamp
        self.hours_available = hours_available
        self.charge_hours_used = charge_hours_used
        self.discharge_hours_used = discharge_hours_used
        self.hours_gated_out = hours_gated_out

    def to_dict(self) -> dict:
        return {
            "zone_name":             self.zone_name,
            "charge_hours":          self.charge_hours,
            "discharge_hours":       self.discharge_hours,
            "charge_price":          self.charge_price,
            "discharge_price":       self.discharge_price,
            "round_trip_efficiency": self.round_trip_efficiency,
            "cycling_cost":          self.cycling_cost,
            "daily_spread_per_mwh":  self.daily_spread_per_mwh,
            "total_cycling_costs":   self.total_cycling_costs,
            "net_profit_per_mwh":    self.net_profit_per_mwh,
            "is_profitable":         self.is_profitable,
            "timestamp":             self.timestamp,
            "hours_available":       self.hours_available,
            "charge_hours_used":     self.charge_hours_used,
            "discharge_hours_used":  self.discharge_hours_used,
            "hours_gated_out":       self.hours_gated_out,
        }


# ---------------------------------------------------------------------------
# Core client
# ---------------------------------------------------------------------------


class BatteryArbitrageClient:
    """
    Models grid-scale battery storage arbitrage using live PJM LMP data.

    For each zone in the requested window:
      - Picks the N cheapest hours to charge; computes charge_price.
      - Gates each candidate discharge hour: only dispatches if
            discharge_lmp × η − charge_price > cycling_cost
      - From qualifying hours, picks up to N most expensive to discharge.
      - Applies round-trip efficiency to the discharge revenue.
      - Reports gross spread, total cycling O&M cost, and net profit.

    Parameters
    ----------
    efficiency:
        Round-trip AC–DC–AC efficiency (default 0.87 = 87%).
    n_charge_hours:
        Number of cheap hours to average for the charge price (default 4).
    n_discharge_hours:
        Number of expensive hours to average for the discharge price (default 4).
    cycling_cost:
        Variable O&M per MWh dispatched in $/MWh (default $20.00).
        Represents battery degradation and maintenance costs per cycle.
    lmp_client:
        Optional pre-configured LMPClient.
    """

    def __init__(
        self,
        efficiency: float = DEFAULT_EFFICIENCY,
        n_charge_hours: int = DEFAULT_CHARGE_HOURS,
        n_discharge_hours: int = DEFAULT_DISCHARGE_HOURS,
        cycling_cost: float = DEFAULT_CYCLING_COST,
        lmp_client: Optional[LMPClient] = None,
    ) -> None:
        if not 0 < efficiency <= 1:
            raise ValueError(f"efficiency must be in (0, 1], got {efficiency}")
        if n_charge_hours < 1 or n_discharge_hours < 1:
            raise ValueError("n_charge_hours and n_discharge_hours must be >= 1")
        if cycling_cost < 0:
            raise ValueError(f"cycling_cost cannot be negative, got {cycling_cost}")

        self.efficiency = efficiency
        self.n_charge = n_charge_hours
        self.n_discharge = n_discharge_hours
        self.cycling_cost = cycling_cost
        self._lmp = lmp_client or LMPClient()

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def get_arbitrage(
        self,
        window_hours: int = DEFAULT_WINDOW_HOURS,
    ) -> list[ZoneArbitrageResult]:
        """
        Return battery arbitrage analysis for all PJM zones.

        Parameters
        ----------
        window_hours:
            How many hours of LMP history to analyse (default 24).

        Returns
        -------
        list[ZoneArbitrageResult]
            One result per zone, sorted by daily_spread_per_mwh descending.
        """
        logger.info(
            "Battery arbitrage | window={}h | η={:.0%} | charge={}h | discharge={}h | cycling=${}/MWh",
            window_hours, self.efficiency, self.n_charge, self.n_discharge, self.cycling_cost,
        )
        lmp_df = self._lmp.get_lmp_by_zone(rolling_window_hours=window_hours)

        if lmp_df.empty:
            logger.warning("BatteryArbitrage: no LMP data returned.")
            return []

        results = []
        for zone, zone_df in lmp_df.groupby("zone_name"):
            result = self._calculate_zone(str(zone), zone_df)
            results.append(result)

        results.sort(key=lambda r: r.daily_spread_per_mwh, reverse=True)
        profitable = sum(1 for r in results if r.is_profitable)
        logger.info(
            "BatteryArbitrage: {}/{} zones profitable | best={} (${:.2f}/MWh)",
            profitable, len(results),
            results[0].zone_name if results else "N/A",
            results[0].daily_spread_per_mwh if results else 0,
        )
        return results

    def get_arbitrage_df(self, window_hours: int = DEFAULT_WINDOW_HOURS) -> pd.DataFrame:
        """Same as get_arbitrage() but returns a DataFrame (convenience wrapper)."""
        results = self.get_arbitrage(window_hours)
        if not results:
            return pd.DataFrame()
        return pd.DataFrame([r.to_dict() for r in results])

    # ------------------------------------------------------------------
    # Per-zone calculation
    # ------------------------------------------------------------------

    def _calculate_zone(self, zone_name: str, df: pd.DataFrame) -> ZoneArbitrageResult:
        """
        Run the arbitrage model for a single zone.

        Step 1 — Charge selection:
            Take the N cheapest hours as charge candidates; compute charge_price.

        Step 2 — Dispatch gate:
            For each remaining (expensive) hour, apply the cycling-cost hurdle:
                discharge_lmp × η  −  charge_price  >  cycling_cost
            Hours that fail the gate are idle; no cycle is registered.

        Step 3 — Discharge selection:
            From hours that cleared the gate, take up to N most expensive.

        Step 4 — Metrics:
            gross spread       = discharge_price − charge_price        ($/MWh)
            total_cycling_costs= cycling_cost × n_actual_dispatches    ($)
            net_profit         = gross_spread − cycling_cost           ($/MWh)
            is_profitable      = net_profit > 0
        """
        df = df.sort_values("lmp_total").reset_index(drop=True)
        n_hours = len(df)

        # Step 1: select charge hours (cheapest N, non-overlapping with discharge)
        n_charge = min(self.n_charge, n_hours // 2 or 1)
        charge_df = df.head(n_charge)
        charge_price_raw = float(charge_df["lmp_total"].mean())
        charge_price     = round(charge_price_raw, 4)

        # Step 2: apply dispatch gate to all remaining candidate hours
        candidate_df = df.iloc[n_charge:].copy()
        candidate_df["_discharge_eff"] = candidate_df["lmp_total"] * self.efficiency
        candidate_df["_net_margin"]    = candidate_df["_discharge_eff"] - charge_price_raw
        qualifying_df = candidate_df[candidate_df["_net_margin"] > self.cycling_cost]

        # Step 3: from qualifying hours, pick the N most expensive
        n_discharge      = min(self.n_discharge, len(qualifying_df))
        hours_gated_out  = len(candidate_df) - len(qualifying_df)
        discharge_df     = qualifying_df.nlargest(n_discharge, "lmp_total")

        # Step 4: compute metrics
        if n_discharge > 0:
            discharge_price_raw = float(discharge_df["lmp_total"].mean())
            discharge_price_eff = round(discharge_price_raw * self.efficiency, 4)
        else:
            discharge_price_eff = 0.0

        daily_spread        = round(discharge_price_eff - charge_price, 4)
        total_cycling_costs = round(self.cycling_cost * n_discharge, 4)
        net_profit          = round(daily_spread - self.cycling_cost, 4)

        def _ts(val) -> str:
            if hasattr(val, "isoformat"):
                return val.isoformat()
            return str(val)

        charge_hours    = [_ts(v) for v in charge_df["timestamp_ept"].tolist()]
        discharge_hours = [_ts(v) for v in discharge_df["timestamp_ept"].tolist()]

        # Window timestamp = latest hour in the data
        latest_ts = _ts(df["timestamp_ept"].max())

        return ZoneArbitrageResult(
            zone_name=zone_name,
            charge_hours=charge_hours,
            discharge_hours=discharge_hours,
            charge_price=charge_price,
            discharge_price=discharge_price_eff,
            round_trip_efficiency=self.efficiency,
            cycling_cost=self.cycling_cost,
            daily_spread_per_mwh=daily_spread,
            total_cycling_costs=total_cycling_costs,
            net_profit_per_mwh=net_profit,
            is_profitable=net_profit > 0,
            timestamp=latest_ts,
            hours_available=n_hours,
            charge_hours_used=n_charge,
            discharge_hours_used=n_discharge,
            hours_gated_out=hours_gated_out,
        )


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def fetch_battery_arbitrage(
    window_hours: int = DEFAULT_WINDOW_HOURS,
    efficiency: float = DEFAULT_EFFICIENCY,
    n_charge_hours: int = DEFAULT_CHARGE_HOURS,
    n_discharge_hours: int = DEFAULT_DISCHARGE_HOURS,
    cycling_cost: float = DEFAULT_CYCLING_COST,
) -> list[ZoneArbitrageResult]:
    """Fetch battery arbitrage for all zones over the given window."""
    return BatteryArbitrageClient(
        efficiency=efficiency,
        n_charge_hours=n_charge_hours,
        n_discharge_hours=n_discharge_hours,
        cycling_cost=cycling_cost,
    ).get_arbitrage(window_hours)


# ---------------------------------------------------------------------------
# Smoke test  (python -m data.battery_arbitrage)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    logger.remove()
    logger.add(sys.stderr, level="INFO")

    logger.info("=== GridAlpha — Battery Arbitrage Smoke Test ===")
    logger.info(
        "Config: window=24h | η={:.0%} | charge_hours={} | discharge_hours={} | cycling=${}/MWh",
        DEFAULT_EFFICIENCY, DEFAULT_CHARGE_HOURS, DEFAULT_DISCHARGE_HOURS, DEFAULT_CYCLING_COST,
    )

    client = BatteryArbitrageClient()

    # Test 1: 24-hour window, default params
    logger.info("Test 1: 24h battery arbitrage, all zones…")
    results = client.get_arbitrage(window_hours=24)

    if not results:
        logger.error("Test 1 FAILED — no results returned.")
        sys.exit(1)

    logger.success("Test 1 PASSED — {} zones", len(results))

    print(
        f"\n{'Zone':<12} {'Hrs':>4} {'Charge':>9} {'Discharge':>11} "
        f"{'Gross':>9} {'Cycling':>9} {'Net':>9}  {'Gated':>6}  {'Profitable'}"
    )
    print("-" * 88)
    for r in results:
        status = "YES" if r.is_profitable else "no"
        print(
            f"{r.zone_name:<12} "
            f"{r.hours_available:>4} "
            f"${r.charge_price:>8.2f} "
            f"${r.discharge_price:>10.2f} "
            f"${r.daily_spread_per_mwh:>8.2f} "
            f"${r.cycling_cost:>8.2f} "
            f"${r.net_profit_per_mwh:>8.2f}  "
            f"{r.hours_gated_out:>5}h  {status}"
        )

    profitable = [r for r in results if r.is_profitable]
    best = results[0]
    print(f"\nSummary:")
    print(f"  Profitable zones      : {len(profitable)}/{len(results)}")
    print(f"  Avg gross spread      : ${sum(r.daily_spread_per_mwh for r in results) / len(results):.2f}/MWh")
    print(f"  Avg net profit        : ${sum(r.net_profit_per_mwh for r in results) / len(results):.2f}/MWh")
    print(f"  Best zone (gross)     : {best.zone_name} (${best.daily_spread_per_mwh:.2f}/MWh)")
    print(f"  Best zone net profit  : ${best.net_profit_per_mwh:.2f}/MWh")
    print(f"  Total cycling costs   : ${best.total_cycling_costs:.2f} ({best.discharge_hours_used} dispatches)")
    print(f"  Hours gated out       : {best.hours_gated_out}")
    print(f"  Charge hours          : {best.charge_hours}")
    print(f"  Discharge hours       : {best.discharge_hours}")

    print()

    # Test 2: shorter window (4h) — fewer hours, tighter spread
    logger.info("Test 2: 4h window (intraday)…")
    results_4h = client.get_arbitrage(window_hours=4)
    if results_4h:
        avg_4h = sum(r.daily_spread_per_mwh for r in results_4h) / len(results_4h)
        logger.success("Test 2 PASSED — {} zones | avg gross spread ${:.2f}/MWh", len(results_4h), avg_4h)
    else:
        logger.error("Test 2 FAILED — no results.")

    print()

    # Test 3: higher cycling cost ($40/MWh) — fewer dispatches pass the gate
    logger.info("Test 3: Higher cycling cost ($40/MWh) — tighter dispatch gate…")
    results_40 = BatteryArbitrageClient(cycling_cost=40.0).get_arbitrage(window_hours=24)
    if results_40:
        profitable_40 = sum(1 for r in results_40 if r.is_profitable)
        gated_total   = sum(r.hours_gated_out for r in results_40)
        logger.success(
            "Test 3 PASSED — {}/{} zones profitable at $40/MWh cycling | {} total hours gated",
            profitable_40, len(results_40), gated_total,
        )

    print()

    # Test 4: zero cycling cost (baseline, matches old behaviour)
    logger.info("Test 4: Zero cycling cost (baseline, no dispatch gate)…")
    results_0 = BatteryArbitrageClient(cycling_cost=0.0).get_arbitrage(window_hours=24)
    if results_0:
        profitable_0 = sum(1 for r in results_0 if r.is_profitable)
        logger.success(
            "Test 4 PASSED — {}/{} zones profitable with no cycling cost",
            profitable_0, len(results_0),
        )
