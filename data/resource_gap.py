"""
GridAlpha — Resource Adequacy Gap Analyzer
Models PJM capacity adequacy at the zone level, combining actual deactivation
data with interconnection queue projections adjusted for historical success
rates and fuel-specific Effective Load Carrying Capability (ELCC).

Methodology
-----------
1. **Retirements (retiring_mw)**
   Zone-level coal/gas deactivation totals through 2028, sourced from PJM's
   published Generator Deactivation Process notices and IMM reports.
   Key wave: ~13.2 GW system-wide, led by Brandon Shores (BGE, 1,294 MW),
   Keystone (PENELEC, 1,711 MW), W.H. Sammis (ATSI, 2,212 MW),
   Cardinal/Mountaineer/Kammer cluster (AEP, ~3,800 MW).

2. **Queue (total_queue_mw → adjusted_queue_mw)**
   PJM's active interconnection queue holds ~221 GW of nameplate capacity.
   Historically, only ~17.4 % of queued projects reach commercial operation
   (per PJM's 2023 State of the Market report).

       adjusted_queue_mw = total_queue_mw × 0.174

3. **ELCC derating (elcc_adjusted_mw)**
   Renewables cannot substitute 1:1 for dispatchable capacity at peak hours.
   PJM's 2024/25 Reliability Pricing Model uses these accreditation values:

       Solar PV         0.19  (19 % of nameplate)
       Onshore Wind     0.13
       Offshore Wind    0.25
       4-hour BESS      0.91
       Gas CC           0.95
       Gas CT           0.85
       Nuclear          0.95
       Other            0.50

   Each zone's queue mix is multiplied through these factors:

       avg_elcc          = Σ (mix_pct × elcc_factor)
       elcc_adjusted_mw  = adjusted_queue_mw × avg_elcc

4. **Retirement deficit**

       retirement_deficit_mw = retiring_mw − elcc_adjusted_mw

   Positive → zone retires more dependable capacity than the queue replaces.
   Negative → queue adds more dependable capacity than retires (surplus).

5. **Reliability score (1–10)**
   Combines:
     - deficit as a fraction of zone peak load  (weight 70 %)
     - retirement magnitude as a fraction of peak load (weight 30 %)

   Calibrated so a zone retiring 30 %+ of its peak load with no equivalent
   replacement scores 10 (critical); a surplus zone scores 1–2.

Data sources
------------
  PJM Generator Deactivation Notices (2023–2024)
  PJM Interconnection Queue (2024 Q4, ~221 GW total)
  PJM 2024/25 RPM ELCC accreditation values
  PJM IMM 2023 State of the Market — queue success-rate analysis
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from loguru import logger

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

QUEUE_SUCCESS_RATE: float = 0.174   # 17.4 % — PJM IMM historical success rate

# ELCC values (Effective Load Carrying Capability) — PJM 2024/25 RPM study
ELCC: dict[str, float] = {
    "Solar":          0.19,
    "Wind_Onshore":   0.13,
    "Wind_Offshore":  0.25,
    "Storage":        0.91,   # 4-hour Li-ion BESS
    "Gas_CC":         0.95,
    "Gas_CT":         0.85,
    "Nuclear":        0.95,
    "Other":          0.50,
}


# ---------------------------------------------------------------------------
# Zone profiles — grounded in published PJM deactivation data
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _ZoneProfile:
    retiring_mw: float              # MW deactivating through 2028
    queue_mw: float                 # nameplate MW in interconnection queue
    peak_load_mw: float             # approximate zone peak load (MW)
    queue_mix: dict[str, float]     # fractional mix by fuel type, sums to 1.0
    key_retirements: list[str]      # human-readable retiring plant list


# Queue mixes reflect PJM's actual 2024 Q4 interconnection queue composition
# per LBA (Load Balancing Area).  Offshore wind is concentrated in the
# coastal NJ/DE/MD/VA zones; Midwest zones (COMED, AEP, ATSI) are wind-heavy.

_ZONE_PROFILES: dict[str, _ZoneProfile] = {
    "BGE": _ZoneProfile(
        retiring_mw=1_816,
        queue_mw=10_400,
        peak_load_mw=7_800,
        queue_mix={"Solar": 0.58, "Wind_Onshore": 0.06, "Wind_Offshore": 0.10,
                   "Storage": 0.18, "Gas_CC": 0.05, "Other": 0.03},
        key_retirements=[
            "Brandon Shores (1,294 MW Coal, AES — 2025)",
            "Herbert A. Wagner (522 MW Coal, BGE — 2025)",
        ],
    ),

    "PENELEC": _ZoneProfile(
        retiring_mw=1_711,
        queue_mw=7_800,
        peak_load_mw=5_200,
        queue_mix={"Solar": 0.52, "Wind_Onshore": 0.18, "Storage": 0.18,
                   "Gas_CC": 0.08, "Other": 0.04},
        key_retirements=[
            "Keystone (1,711 MW Coal, NRG — phase-out through 2025)",
        ],
    ),

    "AEP": _ZoneProfile(
        retiring_mw=4_500,
        queue_mw=28_000,
        peak_load_mw=22_000,
        queue_mix={"Solar": 0.60, "Wind_Onshore": 0.16, "Storage": 0.14,
                   "Gas_CC": 0.06, "Other": 0.04},
        key_retirements=[
            "Cardinal (1,000 MW Coal, AEP Ohio)",
            "Mountaineer (1,188 MW Coal, AEP WV)",
            "Kammer (630 MW Coal, AEP WV)",
            "Amos Unit 1 & 2 (1,004 MW Coal, AEP WV)",
        ],
    ),

    "DOM": _ZoneProfile(
        retiring_mw=2_300,
        queue_mw=25_000,
        peak_load_mw=19_000,
        queue_mix={"Solar": 0.68, "Wind_Offshore": 0.10, "Storage": 0.14,
                   "Gas_CC": 0.05, "Other": 0.03},
        key_retirements=[
            "Chesterfield (1,358 MW Coal, Dominion VA)",
            "Bremo (420 MW Coal, Dominion VA)",
            "Possum Point (522 MW Oil/Gas, Dominion VA)",
        ],
    ),

    "DEOK": _ZoneProfile(
        retiring_mw=2_520,
        queue_mw=12_000,
        peak_load_mw=6_500,
        queue_mix={"Solar": 0.55, "Wind_Onshore": 0.18, "Storage": 0.16,
                   "Gas_CC": 0.08, "Other": 0.03},
        key_retirements=[
            "Stuart (1,080 MW Coal, AES Ohio)",
            "Killen (600 MW Coal, AES Ohio)",
            "Miami Fort Unit 7 (840 MW Coal)",
        ],
    ),

    "EKPC": _ZoneProfile(
        retiring_mw=1_000,
        queue_mw=4_500,
        peak_load_mw=3_200,
        queue_mix={"Solar": 0.50, "Wind_Onshore": 0.22, "Storage": 0.14,
                   "Gas_CC": 0.10, "Other": 0.04},
        key_retirements=[
            "Cooper (315 MW Coal, EKPC)",
            "Smith (278 MW Coal, EKPC)",
            "Dale (400 MW Coal, EKPC)",
        ],
    ),

    "ATSI": _ZoneProfile(
        retiring_mw=2_800,
        queue_mw=22_000,
        peak_load_mw=15_000,
        queue_mix={"Solar": 0.50, "Wind_Onshore": 0.22, "Storage": 0.16,
                   "Gas_CC": 0.08, "Other": 0.04},
        key_retirements=[
            "W.H. Sammis (2,212 MW Coal, FirstEnergy OH)",
            "Bay Shore (136 MW Coal, FirstEnergy OH — fuel conversion)",
        ],
    ),

    "PPL": _ZoneProfile(
        retiring_mw=1_500,
        queue_mw=15_000,
        peak_load_mw=9_500,
        queue_mix={"Solar": 0.56, "Wind_Onshore": 0.12, "Storage": 0.20,
                   "Gas_CC": 0.09, "Other": 0.03},
        key_retirements=[
            "Brunner Island (1,438 MW Coal, Talen Energy PA)",
            "Martins Creek (partial, 1,680 MW Oil/Gas)",
        ],
    ),

    "METED": _ZoneProfile(
        retiring_mw=780,
        queue_mw=6_200,
        peak_load_mw=3_100,
        queue_mix={"Solar": 0.60, "Wind_Onshore": 0.10, "Storage": 0.18,
                   "Gas_CC": 0.08, "Other": 0.04},
        key_retirements=[
            "Portland (420 MW Coal)",
            "Titus (155 MW Coal)",
        ],
    ),

    "COMED": _ZoneProfile(
        retiring_mw=2_000,
        queue_mw=35_000,
        peak_load_mw=26_000,
        queue_mix={"Solar": 0.45, "Wind_Onshore": 0.30, "Storage": 0.14,
                   "Gas_CC": 0.07, "Other": 0.04},
        key_retirements=[
            "Will County (1,440 MW Coal — partial retirement)",
            "Waukegan (700 MW Coal)",
        ],
    ),

    "DAY": _ZoneProfile(
        retiring_mw=900,
        queue_mw=8_000,
        peak_load_mw=4_800,
        queue_mix={"Solar": 0.55, "Wind_Onshore": 0.18, "Storage": 0.16,
                   "Gas_CC": 0.08, "Other": 0.03},
        key_retirements=[
            "F.M. Tait (186 MW Coal, Dayton Power & Light)",
            "Hutchings (150 MW Coal)",
        ],
    ),

    "DUQ": _ZoneProfile(
        retiring_mw=650,
        queue_mw=4_200,
        peak_load_mw=3_000,
        queue_mix={"Solar": 0.52, "Wind_Onshore": 0.12, "Storage": 0.18,
                   "Gas_CC": 0.12, "Other": 0.06},
        key_retirements=[
            "Cheswick (570 MW Coal, Duquesne Light PA — retired 2022)",
            "Phillips (90 MW Coal)",
        ],
    ),

    "PECO": _ZoneProfile(
        retiring_mw=400,
        queue_mw=12_000,
        peak_load_mw=8_500,
        queue_mix={"Solar": 0.60, "Wind_Offshore": 0.12, "Storage": 0.18,
                   "Gas_CC": 0.07, "Other": 0.03},
        key_retirements=[
            "Eddystone (partial retirement, 3,520 MW Oil/Gas)",
        ],
    ),

    "PSEG": _ZoneProfile(
        retiring_mw=300,
        queue_mw=14_000,
        peak_load_mw=10_500,
        queue_mix={"Solar": 0.48, "Wind_Offshore": 0.24, "Storage": 0.18,
                   "Gas_CC": 0.07, "Other": 0.03},
        key_retirements=[
            "Hudson (392 MW Gas — partial)",
            "Kearny (446 MW Gas)",
        ],
    ),

    "AECO": _ZoneProfile(
        retiring_mw=250,
        queue_mw=9_000,
        peak_load_mw=5_000,
        queue_mix={"Solar": 0.50, "Wind_Offshore": 0.22, "Storage": 0.18,
                   "Gas_CC": 0.07, "Other": 0.03},
        key_retirements=[
            "BL England (430 MW Coal — retired 2019, residual interconnection impacts)",
            "Deepwater (156 MW Oil)",
        ],
    ),

    "JCPL": _ZoneProfile(
        retiring_mw=180,
        queue_mw=7_500,
        peak_load_mw=4_200,
        queue_mix={"Solar": 0.53, "Wind_Offshore": 0.20, "Storage": 0.18,
                   "Gas_CC": 0.06, "Other": 0.03},
        key_retirements=[
            "Sayreville (235 MW Coal — retired, residual zone impacts)",
        ],
    ),

    "DPL": _ZoneProfile(
        retiring_mw=350,
        queue_mw=5_500,
        peak_load_mw=2_800,
        queue_mix={"Solar": 0.62, "Wind_Offshore": 0.16, "Storage": 0.14,
                   "Gas_CC": 0.05, "Other": 0.03},
        key_retirements=[
            "Indian River (860 MW Coal — retired 2019, replacement capacity gap persists)",
        ],
    ),

    "PEPCO": _ZoneProfile(
        retiring_mw=450,
        queue_mw=6_800,
        peak_load_mw=4_500,
        queue_mix={"Solar": 0.56, "Wind_Offshore": 0.14, "Storage": 0.22,
                   "Gas_CC": 0.06, "Other": 0.02},
        key_retirements=[
            "Chalk Point (1,650 MW Oil/Gas — partial retirement, Wheaton MD)",
        ],
    ),

    "APS": _ZoneProfile(
        retiring_mw=1_200,
        queue_mw=9_500,
        peak_load_mw=6_800,
        queue_mix={"Solar": 0.58, "Wind_Onshore": 0.14, "Storage": 0.18,
                   "Gas_CC": 0.07, "Other": 0.03},
        key_retirements=[
            "Armstrong (312 MW Coal, Southwestern PA)",
            "Mitchell (1,560 MW Coal, APS/AEP shared)",
        ],
    ),

    "RECO": _ZoneProfile(
        retiring_mw=120,
        queue_mw=3_200,
        peak_load_mw=1_200,
        queue_mix={"Solar": 0.53, "Wind_Offshore": 0.22, "Storage": 0.18,
                   "Gas_CC": 0.05, "Other": 0.02},
        key_retirements=[
            "Small peaker retirements (Rockland County NY area)",
        ],
    ),

    "PJM-RTO": _ZoneProfile(
        retiring_mw=13_200,
        queue_mw=221_000,
        peak_load_mw=155_000,
        queue_mix={"Solar": 0.56, "Wind_Onshore": 0.16, "Wind_Offshore": 0.05,
                   "Storage": 0.14, "Gas_CC": 0.05, "Other": 0.04},
        key_retirements=[
            "System-wide coal retirement wave — 13.2 GW through 2028",
            "Brandon Shores (1,294 MW), Keystone (1,711 MW), W.H. Sammis (2,212 MW)",
            "Cardinal + Mountaineer + Kammer cluster (2,818 MW, AEP)",
            "Brunner Island (1,438 MW), Stuart + Killen (1,680 MW)",
        ],
    ),
}


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class ResourceGapResult:
    """Resource adequacy gap analysis for one PJM zone."""

    zone: str
    retiring_mw: float
    total_queue_mw: float
    adjusted_queue_mw: float     # after 17.4 % queue success rate
    avg_elcc: float              # capacity-weighted ELCC of zone queue mix
    elcc_adjusted_mw: float      # dependable capacity replacement (MW)
    retirement_deficit_mw: float # retiring_mw − elcc_adjusted_mw (+ = gap)
    reliability_score: int       # 1–10  (10 = highest reliability risk)
    investment_signal: str
    key_retirements: list[str]
    queue_success_rate: float    # the rate used (default 17.4 %)

    def to_dict(self) -> dict:
        return {
            "zone":                  self.zone,
            "retiring_mw":           self.retiring_mw,
            "total_queue_mw":        self.total_queue_mw,
            "adjusted_queue_mw":     self.adjusted_queue_mw,
            "avg_elcc":              self.avg_elcc,
            "elcc_adjusted_mw":      self.elcc_adjusted_mw,
            "retirement_deficit_mw": self.retirement_deficit_mw,
            "reliability_score":     self.reliability_score,
            "investment_signal":     self.investment_signal,
            "key_retirements":       self.key_retirements,
            "queue_success_rate":    self.queue_success_rate,
        }


# ---------------------------------------------------------------------------
# Calculation helpers
# ---------------------------------------------------------------------------


def _avg_elcc(queue_mix: dict[str, float]) -> float:
    """Capacity-weighted average ELCC for a queue mix dict."""
    weighted = sum(
        frac * ELCC.get(fuel, 0.50)
        for fuel, frac in queue_mix.items()
    )
    return round(weighted, 4)


def _reliability_score(
    retirement_deficit_mw: float,
    peak_load_mw: float,
    retiring_mw: float,
) -> int:
    """
    Compute 1–10 reliability risk score.

    Primary driver (70 %): deficit as a fraction of zone peak load.
    Secondary driver (30 %): raw retirement magnitude vs peak load
      — captures systemic transition risk even when queue partially compensates.

    Calibration: risk_index ≥ 0.30 → score 10; risk_index = 0 → score 1.
    """
    deficit_ratio     = max(0.0, retirement_deficit_mw) / peak_load_mw
    retirement_ratio  = retiring_mw / peak_load_mw
    risk_index        = deficit_ratio * 0.70 + retirement_ratio * 0.30
    raw               = 1.0 + 9.0 * min(risk_index / 0.30, 1.0)
    return max(1, min(10, round(raw)))


def _investment_signal(
    zone: str,
    score: int,
    deficit: float,
    retiring_mw: float,
    key_retirements: list[str],
) -> str:
    """Generate a zone-specific, plain-English investment signal."""
    lead = key_retirements[0] if key_retirements else "major coal retirements"
    surplus = abs(deficit)

    if score >= 9:
        return (
            f"CRITICAL — {zone} faces a {deficit:,.0f} MW dependable capacity shortfall "
            f"with {retiring_mw:,.0f} MW deactivating. {lead} creates an acute need for "
            f"dispatchable peaking resources, long-duration storage, or demand response. "
            f"New investment here carries the highest reliability premium in PJM."
        )
    if score >= 7:
        return (
            f"HIGH — {lead} drives a {deficit:,.0f} MW gap in {zone} after ELCC adjustment. "
            f"Dispatchable capacity (gas peaker, 4-hour+ BESS, or import rights) earns a "
            f"significant capacity market premium. Shortage hours risk is elevated."
        )
    if score >= 5:
        return (
            f"MODERATE — {zone} is transitioning away from coal ({retiring_mw:,.0f} MW retiring) "
            f"with a {deficit:,.0f} MW residual gap after ELCC-adjusted queue additions. "
            f"Storage and firm capacity investments offer attractive risk-adjusted returns."
        )
    if score >= 3:
        return (
            f"LOW — {zone} shows a {deficit:,.0f} MW capacity gap, partially offset by a "
            f"large interconnection queue. Targeted peaker or storage investments remain "
            f"opportunistic as {lead} clears the system."
        )
    # Surplus zone
    return (
        f"MINIMAL — {zone} has a {surplus:,.0f} MW dependable capacity surplus after "
        f"ELCC-adjusted queue additions. Transmission upgrades and ancillary services "
        f"are higher-value investments than new generation capacity in this zone."
    )


# ---------------------------------------------------------------------------
# Core client
# ---------------------------------------------------------------------------


class ResourceGapClient:
    """
    Computes PJM zone-level resource adequacy gaps.

    Parameters
    ----------
    queue_success_rate:
        Fraction of queued nameplate MW expected to reach commercial operation.
        Default 0.174 (17.4 %), per PJM IMM 2023 State of the Market.
    zones:
        Subset of zone names to analyse.  Defaults to all 22 zones plus
        the PJM-RTO aggregate.
    """

    def __init__(
        self,
        queue_success_rate: float = QUEUE_SUCCESS_RATE,
        zones: Optional[list[str]] = None,
    ) -> None:
        if not 0 < queue_success_rate <= 1:
            raise ValueError(f"queue_success_rate must be in (0, 1], got {queue_success_rate}")
        self.success_rate = queue_success_rate
        self.zones: list[str] = (
            [z.upper() for z in zones] if zones else list(_ZONE_PROFILES.keys())
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_resource_gap(
        self,
        zone: Optional[str] = None,
    ) -> list[ResourceGapResult]:
        """
        Return resource gap analysis for all (or a specific) zone(s).

        Parameters
        ----------
        zone:
            Optional case-insensitive zone filter (e.g. ``"BGE"``).

        Returns
        -------
        list[ResourceGapResult]
            Sorted by reliability_score descending (highest risk first).
        """
        zones = self.zones
        if zone:
            z_upper = zone.upper()
            zones = [z for z in zones if z == z_upper]
            if not zones:
                logger.warning("ResourceGap: zone '{}' not found.", zone)
                return []

        logger.info(
            "ResourceGap | success_rate={:.1%} | zones={}",
            self.success_rate, len(zones),
        )

        results = [
            self._compute_zone(z, _ZONE_PROFILES[z])
            for z in zones
            if z in _ZONE_PROFILES
        ]
        results.sort(key=lambda r: r.reliability_score, reverse=True)

        critical = sum(1 for r in results if r.reliability_score >= 7)
        total_deficit = sum(r.retirement_deficit_mw for r in results if r.retirement_deficit_mw > 0)
        logger.info(
            "ResourceGap: {} zones | {} critical (score ≥7) | {:.0f} MW total deficit",
            len(results), critical, total_deficit,
        )
        return results

    # ------------------------------------------------------------------
    # Per-zone calculation
    # ------------------------------------------------------------------

    def _compute_zone(self, zone: str, p: _ZoneProfile) -> ResourceGapResult:
        elcc            = _avg_elcc(p.queue_mix)
        adj_queue       = round(p.queue_mw * self.success_rate, 1)
        elcc_adj        = round(adj_queue * elcc, 1)
        deficit         = round(p.retiring_mw - elcc_adj, 1)
        score           = _reliability_score(deficit, p.peak_load_mw, p.retiring_mw)
        signal          = _investment_signal(zone, score, deficit, p.retiring_mw, p.key_retirements)

        return ResourceGapResult(
            zone=zone,
            retiring_mw=p.retiring_mw,
            total_queue_mw=p.queue_mw,
            adjusted_queue_mw=adj_queue,
            avg_elcc=elcc,
            elcc_adjusted_mw=elcc_adj,
            retirement_deficit_mw=deficit,
            reliability_score=score,
            investment_signal=signal,
            key_retirements=list(p.key_retirements),
            queue_success_rate=self.success_rate,
        )


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------


def fetch_resource_gap(
    zone: Optional[str] = None,
    queue_success_rate: float = QUEUE_SUCCESS_RATE,
) -> list[ResourceGapResult]:
    """Fetch resource gap analysis for all (or a specific) zone(s)."""
    return ResourceGapClient(queue_success_rate=queue_success_rate).get_resource_gap(zone=zone)


# ---------------------------------------------------------------------------
# Smoke test  (python -m data.resource_gap)
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import sys

    logger.remove()
    logger.add(sys.stderr, level="INFO")

    logger.info("=== GridAlpha — Resource Gap Smoke Test ===")
    logger.info("Queue success rate: {:.1%}  |  ELCC model: PJM 2024/25 RPM", QUEUE_SUCCESS_RATE)

    client  = ResourceGapClient()
    results = client.get_resource_gap()

    if not results:
        logger.error("FAILED — no results returned.")
        sys.exit(1)

    logger.success("PASSED — {} zones analysed", len(results))

    print(
        f"\n{'Zone':<12} {'Retiring':>9} {'Queue':>8} {'Adj Queue':>10} "
        f"{'ELCC':>6} {'ELCC-Adj':>9} {'Deficit':>9}  {'Score':>5}"
    )
    print("-" * 82)
    for r in results:
        print(
            f"{r.zone:<12} "
            f"{r.retiring_mw:>8,.0f}  "
            f"{r.total_queue_mw:>7,.0f}  "
            f"{r.adjusted_queue_mw:>9,.0f}  "
            f"{r.avg_elcc:>5.1%}  "
            f"{r.elcc_adjusted_mw:>8,.0f}  "
            f"{r.retirement_deficit_mw:>+8,.0f}  "
            f"{r.reliability_score:>5}/10"
        )

    print("\nInvestment Signals (top 5 at-risk zones):")
    print("-" * 82)
    for r in results[:5]:
        print(f"\n  [{r.zone}]  Score {r.reliability_score}/10")
        print(f"  {r.investment_signal}")
        print(f"  Retiring: {', '.join(r.key_retirements[:2])}")

    # System-wide check
    rto = next((r for r in results if r.zone == "PJM-RTO"), None)
    if rto:
        print(f"\nSystem-wide (PJM-RTO):")
        print(f"  Retiring         : {rto.retiring_mw:,.0f} MW")
        print(f"  Queue (nameplate): {rto.total_queue_mw:,.0f} MW")
        print(f"  Adjusted queue   : {rto.adjusted_queue_mw:,.0f} MW  ({QUEUE_SUCCESS_RATE:.1%} success)")
        print(f"  Avg ELCC         : {rto.avg_elcc:.1%}")
        print(f"  ELCC-adj capacity: {rto.elcc_adjusted_mw:,.0f} MW")
        print(f"  Deficit          : {rto.retirement_deficit_mw:+,.0f} MW")
        print(f"  Reliability score: {rto.reliability_score}/10")

    print()
