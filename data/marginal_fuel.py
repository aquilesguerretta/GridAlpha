"""
GridAlpha — Marginal Fuel Intelligence
Generates a statistically realistic simulation of the marginal fuel type
for each PJM transmission zone.

Background
----------
The "marginal fuel" is the generating unit type that would be dispatched (or
curtailed) next if load changed by 1 MWh.  It is the price-setter in the
real-time LMP calculation.  PJM does not publish a direct marginal-fuel feed,
so this module synthesises a realistic approximation using:

  1. **Hour-of-day dispatch logic** — load profiles follow predictable daily
     curves; off-peak hours favour low-cost baseload (nuclear, coal, wind)
     while peak hours dispatch gas combined-cycle and peaker turbines.

  2. **Zone-specific fuel bias** — regional generation mixes are well
     documented (COMED = heavy wind+nuclear; AEP/DOM = Appalachian coal;
     NJ/SE-PA zones = coastal gas).

  3. **Day-level seeding** — each zone's timeline is seeded with
     MD5(zone + date) so results are stable within a calendar day but
     change realistically from day to day.

  4. **Fuel persistence** — the simulation weights the previous hour's fuel
     more heavily, avoiding unrealistic hour-to-hour fuel oscillation.

This is suitable for educational dashboards and portfolio demonstrations.

Simulation note
---------------
Results are **not** sourced from a live PJM API.  For production use,
replace the simulation layer with PJM's IMM marginal-cost or LMP
decomposition feeds.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from loguru import logger

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PJM_TIMEZONE = ZoneInfo("America/New_York")

ALL_ZONES: list[str] = [
    "AECO", "AEP", "APS", "ATSI", "BGE", "COMED", "DAY", "DEOK",
    "DOM", "DPL", "DUQ", "EKPC", "JCPL", "METED", "OVEC", "PECO",
    "PENELEC", "PEPCO", "PJM-RTO", "PPL", "PSEG", "RECO",
]

FOSSIL_FUELS: frozenset[str] = frozenset({"Gas-CC", "Gas-CT", "Coal", "Oil"})

# Signal-strength (stability) ranges per fuel type  (min, max)
_SIGNAL_RANGES: dict[str, tuple[int, int]] = {
    "Nuclear": (82, 95),
    "Coal":    (68, 85),
    "Gas-CC":  (58, 80),
    "Hydro":   (55, 75),
    "Gas-CT":  (38, 65),
    "Wind":    (28, 60),
    "Solar":   (22, 55),
}

# ---------------------------------------------------------------------------
# Zone fuel-mix bias
# Each value multiplies the base hour weight for that fuel in that zone.
# Omitted fuels use 1.0 (no adjustment).
# ---------------------------------------------------------------------------

_ZONE_BIAS: dict[str, dict[str, float]] = {
    # Midwest — heavy wind + nuclear corridor
    "COMED":   {"Wind": 2.8, "Nuclear": 1.6, "Coal": 0.6},
    "ATSI":    {"Wind": 1.6, "Gas-CC": 1.2},
    "DAY":     {"Coal": 1.6, "Wind": 1.4},

    # Appalachian coal belt
    "AEP":     {"Coal": 2.1, "Gas-CT": 0.6},
    "DOM":     {"Coal": 1.9, "Gas-CC": 1.2},
    "EKPC":    {"Coal": 2.3, "Gas-CT": 0.5},
    "OVEC":    {"Coal": 2.1},
    "DEOK":    {"Coal": 1.6},
    "METED":   {"Coal": 1.5, "Gas-CC": 1.1},
    "PENELEC": {"Coal": 1.6, "Hydro": 1.4},

    # NJ / SE-PA gas corridor
    "PSEG":    {"Gas-CC": 1.9, "Coal": 0.4},
    "RECO":    {"Gas-CC": 2.0, "Wind": 1.5},
    "AECO":    {"Gas-CC": 1.8, "Wind": 1.3},
    "JCPL":    {"Gas-CC": 1.7, "Nuclear": 1.3},
    "DPL":     {"Gas-CC": 1.5, "Solar": 1.4},

    # DC / Mid-Atlantic
    "BGE":     {"Gas-CC": 1.5, "Nuclear": 1.4},
    "PEPCO":   {"Gas-CC": 1.6, "Nuclear": 1.3},
    "PECO":    {"Gas-CC": 1.5, "Nuclear": 1.4},

    # Pennsylvania
    "PPL":     {"Gas-CC": 1.3, "Coal": 1.2},
    "APS":     {"Gas-CC": 1.3, "Coal": 1.1},
    "DUQ":     {"Gas-CC": 1.2, "Hydro": 1.5},

    # System-wide RTO node (weighted average of all zones)
    "PJM-RTO": {"Gas-CC": 1.5, "Wind": 1.2},
}

# ---------------------------------------------------------------------------
# Market-note templates  { fuel → { period → sentence } }
# ---------------------------------------------------------------------------

_MARKET_NOTES: dict[str, dict[str, str]] = {
    "Gas-CC": {
        "offpeak": "Gas combined cycle is on the margin during overnight shoulder hours as baseload carries the load.",
        "morning": "Natural gas combined cycle is ramping up to meet the morning load increase.",
        "midday":  "Gas combined cycle is setting the price under moderate midday demand conditions.",
        "evening": "Natural gas is currently setting the price due to high evening load.",
        "peak":    "Gas combined cycle is the price-setting fuel as demand reaches its daily peak.",
    },
    "Gas-CT": {
        "offpeak": "Gas combustion turbines are cycling at the margin during light off-peak hours.",
        "morning": "Gas combustion turbines are supplementing combined cycle during the morning ramp.",
        "midday":  "Peaker units are on the margin due to unexpectedly elevated midday demand.",
        "evening": "Gas peakers have been dispatched to meet the steep evening demand ramp.",
        "peak":    "Gas combustion turbine peakers are setting the price as demand spikes above baseload capacity.",
    },
    "Coal": {
        "offpeak": "Coal generation is on the margin as off-peak demand is met at lower variable cost.",
        "morning": "Coal is setting the price during the early-morning low-demand period.",
        "midday":  "Coal units remain on the margin in this zone due to the regional generation mix.",
        "evening": "Coal generation is setting the price as higher-cost gas units are backed off.",
        "peak":    "Coal is contributing to peak supply and setting the marginal price in this zone.",
    },
    "Nuclear": {
        "offpeak": "Nuclear baseload is on the margin during deep off-peak hours with minimal demand.",
        "morning": "Nuclear is setting the price in the early hours before morning load picks up.",
        "midday":  "Nuclear baseload is on the margin as solar generation suppresses midday prices.",
        "evening": "Nuclear is holding the margin as the evening demand ramp moderates.",
        "peak":    "Nuclear baseload remains on the margin in this zone due to surplus low-cost capacity.",
    },
    "Wind": {
        "offpeak": "High overnight wind generation is driving prices low and setting the marginal fuel.",
        "morning": "Wind output is suppressing prices and setting the margin during early morning hours.",
        "midday":  "Wind generation is on the margin as solar peaks and residual load moderates.",
        "evening": "The evening wind ramp is setting the marginal price in this zone.",
        "peak":    "Strong wind output is partially displacing thermal generation at the margin.",
    },
    "Solar": {
        "offpeak": "Residual solar capacity is at the margin during low-demand hours in this zone.",
        "morning": "Solar is ramping up and beginning to set the marginal fuel.",
        "midday":  "Solar generation is suppressing midday prices and setting the marginal fuel.",
        "evening": "Solar output is declining and transitioning from solar to gas at the margin.",
        "peak":    "Solar is on the margin as high generation depresses afternoon prices.",
    },
    "Hydro": {
        "offpeak": "Hydro generation is providing low-cost baseload and setting the marginal price.",
        "morning": "Hydro is setting the price during the morning hours in this zone.",
        "midday":  "Hydro dispatch is setting the marginal price during midday hours.",
        "evening": "Hydro is supplementing thermal generation at the margin during the evening.",
        "peak":    "Hydro is being dispatched to help meet peak demand at the margin.",
    },
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class TimelineEntry:
    """Marginal fuel for a single hour (0–23)."""

    hour: int
    fuel_type: str

    def to_dict(self) -> dict:
        return {"hour": self.hour, "fuel_type": self.fuel_type}


@dataclass
class MarginalFuelResult:
    """Marginal fuel snapshot for one zone."""

    zone: str
    current_fuel: str
    is_fossil: bool
    signal_strength: int
    market_note: str
    timeline_24h: list[TimelineEntry]

    def to_dict(self) -> dict:
        return {
            "zone":            self.zone,
            "current_fuel":    self.current_fuel,
            "is_fossil":       self.is_fossil,
            "signal_strength": self.signal_strength,
            "market_note":     self.market_note,
            "timeline_24h":    [e.to_dict() for e in self.timeline_24h],
        }


# ---------------------------------------------------------------------------
# Simulation internals
# ---------------------------------------------------------------------------


def _make_rng(zone: str, date_str: str) -> random.Random:
    """Return a deterministic RNG seeded on zone + calendar date."""
    seed = int(hashlib.md5(f"{zone}|{date_str}".encode()).hexdigest(), 16) % (2 ** 32)
    return random.Random(seed)


def _base_hour_weights(hour: int) -> dict[str, float]:
    """
    Return base probability weights for each fuel type by hour-of-day.

    Derived from published PJM system lambda / dispatch stack analysis.
    """
    if hour <= 5:          # Deep off-peak: baseload dominates
        return {"Nuclear": 3.0, "Coal": 2.5, "Wind": 2.2, "Gas-CC": 1.5,
                "Hydro": 1.0, "Gas-CT": 0.2, "Solar": 0.0}
    elif hour <= 8:        # Morning ramp: gas picks up
        return {"Gas-CC": 3.0, "Coal": 2.0, "Nuclear": 1.5, "Wind": 1.0,
                "Hydro": 0.8, "Gas-CT": 0.6, "Solar": 0.3}
    elif hour <= 11:       # Late morning: gas + solar beginning
        return {"Gas-CC": 3.5, "Coal": 1.5, "Solar": 1.5, "Wind": 1.0,
                "Hydro": 0.7, "Nuclear": 0.8, "Gas-CT": 0.5}
    elif hour <= 15:       # Midday: solar near peak, gas moderated
        return {"Gas-CC": 2.5, "Solar": 2.2, "Coal": 1.5, "Wind": 1.0,
                "Hydro": 0.8, "Nuclear": 0.5, "Gas-CT": 0.7}
    elif hour <= 19:       # Evening peak: peakers dispatched
        return {"Gas-CC": 3.5, "Gas-CT": 2.2, "Coal": 1.5, "Wind": 0.8,
                "Hydro": 0.7, "Nuclear": 0.5, "Solar": 0.3}
    elif hour <= 21:       # Post-peak step-down
        return {"Gas-CC": 3.0, "Coal": 2.0, "Wind": 1.8, "Gas-CT": 1.0,
                "Nuclear": 1.0, "Hydro": 0.8, "Solar": 0.0}
    else:                  # Late night shoulder
        return {"Gas-CC": 2.5, "Coal": 2.5, "Nuclear": 2.0, "Wind": 1.8,
                "Hydro": 1.0, "Gas-CT": 0.3, "Solar": 0.0}


def _period_label(hour: int) -> str:
    if hour <= 5:        return "offpeak"
    if hour <= 9:        return "morning"
    if hour <= 15:       return "midday"
    if hour <= 19:       return "peak"
    if hour <= 21:       return "evening"
    return "offpeak"


def _generate_timeline(zone: str, rng: random.Random) -> list[TimelineEntry]:
    """
    Generate a 24-hour marginal fuel timeline with realistic persistence.

    The previous hour's fuel gets a 2× weight boost so the simulation
    reflects real dispatch (fuel regimes last several hours, not minutes).
    """
    bias      = _ZONE_BIAS.get(zone, {})
    entries:  list[TimelineEntry] = []
    prev_fuel: Optional[str]      = None

    for hour in range(24):
        weights = _base_hour_weights(hour).copy()

        # Zone-specific bias
        for fuel, mult in bias.items():
            if fuel in weights:
                weights[fuel] *= mult

        # Suppress solar outside daylight window
        if hour < 7 or hour >= 20:
            weights["Solar"] = 0.0

        # Persistence: double the weight of the previous hour's fuel
        if prev_fuel and prev_fuel in weights and weights[prev_fuel] > 0:
            weights[prev_fuel] *= 2.0

        fuels = list(weights.keys())
        wts   = [weights[f] for f in fuels]
        chosen = rng.choices(fuels, weights=wts, k=1)[0]

        entries.append(TimelineEntry(hour=hour, fuel_type=chosen))
        prev_fuel = chosen

    return entries


def _compute_signal(
    current_fuel: str,
    timeline: list[TimelineEntry],
    current_hour: int,
    rng: random.Random,
) -> int:
    """
    Compute signal strength (0–100).

    The base range is fuel-specific.  Consecutive hours with the same fuel
    around the current hour add a stability bonus (up to +15 points).
    """
    base_min, base_max = _SIGNAL_RANGES.get(current_fuel, (40, 70))

    # Count consecutive same-fuel hours within ±3 h of the current hour
    consecutive = 1
    for i in range(current_hour - 1, max(-1, current_hour - 4), -1):
        if timeline[i].fuel_type == current_fuel:
            consecutive += 1
        else:
            break
    for i in range(current_hour + 1, min(24, current_hour + 4)):
        if timeline[i].fuel_type == current_fuel:
            consecutive += 1
        else:
            break

    stability_bonus = min(consecutive * 3, 15)
    raw = rng.randint(base_min, base_max) + stability_bonus
    return min(100, raw)


# ---------------------------------------------------------------------------
# Core client
# ---------------------------------------------------------------------------


class MarginalFuelClient:
    """
    Generates simulated marginal fuel data for PJM transmission zones.

    Each zone's timeline is seeded on the current EPT calendar date so
    results are stable within a day but vary from day to day.

    Parameters
    ----------
    zones:
        Explicit list of PJM zone names.  Defaults to all 22 zones.
    """

    def __init__(self, zones: Optional[list[str]] = None) -> None:
        self.zones: list[str] = [z.upper() for z in zones] if zones else list(ALL_ZONES)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_marginal_fuel(
        self,
        zone: Optional[str] = None,
    ) -> list[MarginalFuelResult]:
        """
        Return marginal fuel simulation for all (or a specific) zone(s).

        Parameters
        ----------
        zone:
            Optional zone filter (e.g. ``"COMED"``).  Case-insensitive.
            If None, all zones are returned.

        Returns
        -------
        list[MarginalFuelResult]
            One result per zone, sorted alphabetically.
        """
        now_ept   = datetime.now(tz=PJM_TIMEZONE)
        date_str  = now_ept.strftime("%Y-%m-%d")
        cur_hour  = now_ept.hour
        zones     = self.zones

        if zone:
            z_upper = zone.upper()
            zones   = [z for z in zones if z == z_upper]
            if not zones:
                logger.warning("MarginalFuel: zone '{}' not found.", zone)
                return []

        logger.info(
            "MarginalFuel | date={} | hour={:02d}h EPT | zones={}",
            date_str, cur_hour, len(zones),
        )

        results: list[MarginalFuelResult] = []
        for z in zones:
            rng      = _make_rng(z, date_str)
            timeline = _generate_timeline(z, rng)
            cur_fuel = timeline[cur_hour].fuel_type
            signal   = _compute_signal(cur_fuel, timeline, cur_hour, rng)
            period   = _period_label(cur_hour)
            note     = _MARKET_NOTES.get(cur_fuel, {}).get(period, f"{cur_fuel} is currently setting the marginal price in {z}.")

            results.append(
                MarginalFuelResult(
                    zone=z,
                    current_fuel=cur_fuel,
                    is_fossil=cur_fuel in FOSSIL_FUELS,
                    signal_strength=signal,
                    market_note=note,
                    timeline_24h=timeline,
                )
            )

        results.sort(key=lambda r: r.zone)
        fossil_count = sum(1 for r in results if r.is_fossil)
        logger.info(
            "MarginalFuel: {} zones | {} fossil | {} renewable/clean",
            len(results), fossil_count, len(results) - fossil_count,
        )
        return results


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------


def fetch_marginal_fuel(
    zone: Optional[str] = None,
    zones: Optional[list[str]] = None,
) -> list[MarginalFuelResult]:
    """Fetch marginal fuel data for all (or a specific) zone(s)."""
    return MarginalFuelClient(zones=zones).get_marginal_fuel(zone=zone)


# ---------------------------------------------------------------------------
# Smoke test  (python -m data.marginal_fuel)
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import sys

    logger.remove()
    logger.add(sys.stderr, level="INFO")

    now_ept = datetime.now(tz=PJM_TIMEZONE)
    logger.info("=== GridAlpha — Marginal Fuel Smoke Test ===")
    logger.info("EPT timestamp: {} (hour {:02d})", now_ept.strftime("%Y-%m-%d %H:%M"), now_ept.hour)

    client  = MarginalFuelClient()
    results = client.get_marginal_fuel()

    if not results:
        logger.error("FAILED — no results returned.")
        sys.exit(1)

    logger.success("PASSED — {} zones generated", len(results))

    print(f"\n{'Zone':<12} {'Fuel':<10} {'Fossil':>7} {'Signal':>7}  Market Note")
    print("-" * 95)
    for r in results:
        fossil_flag = "YES" if r.is_fossil else "no"
        note_short  = r.market_note[:55] + "…" if len(r.market_note) > 55 else r.market_note
        print(
            f"{r.zone:<12} {r.current_fuel:<10} {fossil_flag:>7} "
            f"{r.signal_strength:>6}%  {note_short}"
        )

    # Show 24h timeline for best-known zone
    sample = next((r for r in results if r.zone == "PJM-RTO"), results[0])
    print(f"\n24h Timeline — {sample.zone}")
    print("  " + "  ".join(f"{e.hour:02d}" for e in sample.timeline_24h))
    print("  " + "  ".join(f"{e.fuel_type[:4]:>4}" for e in sample.timeline_24h))

    # Fuel distribution across zones
    from collections import Counter
    dist = Counter(r.current_fuel for r in results)
    print(f"\nCurrent marginal fuel distribution across {len(results)} zones:")
    for fuel, count in dist.most_common():
        bar = "#" * count
        print(f"  {fuel:<10} {bar}  ({count})")

    print()
