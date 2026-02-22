"""
GridAlpha — DA/RT LMP Convergence Analyzer
Fetches Day-Ahead and Real-Time hourly LMPs for the same 24-hour window from
PJM's API and calculates the convergence spread for each hour.

Background
----------
PJM clears two electricity markets:
  * **Day-Ahead (DA)**: Forward market published by ~17:00 EPT the day before.
    Price = LMP that clears the financial transmission rights auction.
  * **Real-Time (RT)**: Spot market settled every 5 minutes (we use the hourly
    average from the `rt_unverified_hrl_lmps` feed).

The **convergence spread** is the difference between these two prices:

    spread ($/MWh) = RT_LMP − DA_LMP

Interpretation
--------------
  spread ≈ 0   → Markets converged; supply matched demand as forecast.
  spread > $50 → Scarcity event: real-time demand exceeded DA forecast,
                 shortage pricing in effect, or transmission constraints
                 elevated RT prices above DA.
  spread < −$50 → Oversupply event: excess generation (often renewable)
                  depressed RT prices well below DA expectations.

Virtual traders (ISOs call them "virtuals" or "inc/dec" bids) exploit this
spread by:
  * Buying in DA and selling in RT (if they expect spread > 0)
  * Selling in DA and buying in RT (if they expect spread < 0)

PJM API feeds
-------------
  DA : https://api.pjm.com/api/v1/da_hrl_lmps
       Key field: total_lmp_da
  RT : https://api.pjm.com/api/v1/rt_unverified_hrl_lmps
       Key field: total_lmp_rt

Both feeds support:  type=ZONE, datetime_beginning_ept range, pagination.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

import pandas as pd
import requests
from loguru import logger

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SETTINGS_URL = "http://dataminer2.pjm.com/config/settings.json"
API_BASE_URL  = "https://api.pjm.com/api/v1"
DA_ENDPOINT   = f"{API_BASE_URL}/da_hrl_lmps"
RT_ENDPOINT   = f"{API_BASE_URL}/rt_unverified_hrl_lmps"

PJM_TIMEZONE = ZoneInfo("America/New_York")
ROWS_PER_PAGE = 100
MAX_RETRIES   = 3
RETRY_BACKOFF = 2.0
REQUEST_TIMEOUT = 30.0

DEFAULT_ZONE = "PJM-RTO"

SCARCITY_THRESHOLD: float   =  50.0   # $/MWh — RT well above DA
OVERSUPPLY_THRESHOLD: float = -50.0   # $/MWh — RT well below DA

# Narrative thresholds — fraction of hours required to assign a dominant signal
NARRATIVE_THRESHOLD: float = 0.60     # 60 % of hours must agree

NARRATIVE_VIRTUAL_SELLER = (
    "Wind and solar suppressed Real-Time prices below Day-Ahead forecasts"
    " — virtual sellers who sold RT and bought DA were profitable."
)
NARRATIVE_VIRTUAL_BUYER = (
    "Demand exceeded forecasts and pushed Real-Time prices above"
    " Day-Ahead commitments — virtual buyers were profitable."
)
NARRATIVE_MIXED = (
    "Mixed convergence signals"
    " — no dominant virtual trading direction today."
)


# ---------------------------------------------------------------------------
# Output dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ConvergenceHour:
    """Convergence spread for a single hour in one zone."""

    hour: str          # hour-beginning EPT, ISO format
    da_price: float    # Day-Ahead LMP ($/MWh)
    rt_price: float    # Real-Time LMP ($/MWh)
    spread: float      # RT − DA ($/MWh); positive = scarcity signal
    event_flag: str    # "Scarcity" | "Oversupply" | "Normal"

    def to_dict(self) -> dict:
        return {
            "hour":       self.hour,
            "da_price":   self.da_price,
            "rt_price":   self.rt_price,
            "spread":     self.spread,
            "event_flag": self.event_flag,
        }


@dataclass
class ConvergenceResult:
    """Full convergence analysis for one zone over a 24-hour window."""

    zone: str
    records: list[ConvergenceHour]
    avg_spread: float
    max_spread: float
    min_spread: float
    scarcity_hours: int      # hours where spread > SCARCITY_THRESHOLD
    oversupply_hours: int    # hours where spread < OVERSUPPLY_THRESHOLD
    total_hours: int         # number of aligned DA+RT hours found
    window_start: str        # EPT ISO
    window_end: str          # EPT ISO
    dominant_signal: str     # "VIRTUAL_SELLER" | "VIRTUAL_BUYER" | "MIXED"
    market_narrative: str    # human-readable explanation for the pattern

    def to_dict(self) -> dict:
        return {
            "zone":             self.zone,
            "records":          [r.to_dict() for r in self.records],
            "avg_spread":       self.avg_spread,
            "max_spread":       self.max_spread,
            "min_spread":       self.min_spread,
            "scarcity_hours":   self.scarcity_hours,
            "oversupply_hours": self.oversupply_hours,
            "total_hours":      self.total_hours,
            "window_start":     self.window_start,
            "window_end":       self.window_end,
            "dominant_signal":  self.dominant_signal,
            "market_narrative": self.market_narrative,
        }


# ---------------------------------------------------------------------------
# Core client
# ---------------------------------------------------------------------------


class ConvergenceClient:
    """
    Fetches Day-Ahead and Real-Time LMPs and computes hourly convergence spreads.

    For each hour in the window, the spread is:

        spread = total_lmp_rt  −  total_lmp_da

    Hours are only included when *both* a DA price and an RT price are available.
    For partially completed days, only the hours published in both feeds appear.

    Parameters
    ----------
    timeout:
        Per-request HTTP timeout in seconds.
    max_retries:
        Retry attempts on transient errors (5xx, connection, timeout).
    rows_per_page:
        Page size for PJM's paginated API.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = REQUEST_TIMEOUT,
        max_retries: int = MAX_RETRIES,
        rows_per_page: int = ROWS_PER_PAGE,
    ) -> None:
        self._timeout      = timeout
        self._max_retries  = max_retries
        self._rows_per_page = rows_per_page
        self._session      = requests.Session()
        self._key: Optional[str] = api_key

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_convergence(
        self,
        zone: str = DEFAULT_ZONE,
        window_date: Optional[date] = None,
    ) -> ConvergenceResult:
        """
        Return hourly DA/RT convergence analysis for one zone.

        Parameters
        ----------
        zone:
            PJM transmission zone name (e.g. ``"BGE"``, ``"PJM-RTO"``).
            Case-insensitive.
        window_date:
            The EPT calendar date to analyse (full 24 hours, 00:00–23:59).
            Defaults to **yesterday EPT** — the most recent day for which
            both a complete DA schedule and a complete RT settlement exist.

        Returns
        -------
        ConvergenceResult
            Hourly spread records sorted chronologically, plus summary stats.
        """
        zone = zone.upper()

        if window_date is None:
            window_date = (datetime.now(tz=PJM_TIMEZONE) - timedelta(days=1)).date()

        start_dt = datetime(window_date.year, window_date.month, window_date.day,
                            0, 0, 0, tzinfo=PJM_TIMEZONE)
        end_dt   = start_dt + timedelta(hours=24)

        logger.info(
            "Convergence | zone={} | window={} to {} EPT",
            zone,
            start_dt.strftime("%Y-%m-%d %H:%M"),
            end_dt.strftime("%Y-%m-%d %H:%M"),
        )

        da_df = self._fetch_da(start_dt, end_dt)
        rt_df = self._fetch_rt(start_dt, end_dt)

        return self._build_result(zone, da_df, rt_df, start_dt, end_dt)

    def get_convergence_rolling(
        self,
        zone: str = DEFAULT_ZONE,
        window_hours: int = 24,
    ) -> ConvergenceResult:
        """
        Return convergence for the last *window_hours* of available data.

        Uses ``now − window_hours`` as the start and ``now`` as the end.
        Hours without *both* a DA and RT price are silently dropped.

        Parameters
        ----------
        zone:
            PJM zone name (case-insensitive).
        window_hours:
            Rolling lookback in hours (default 24).
        """
        zone     = zone.upper()
        end_dt   = datetime.now(tz=PJM_TIMEZONE)
        start_dt = end_dt - timedelta(hours=window_hours)

        logger.info(
            "Convergence rolling | zone={} | {}h window | {} to {}",
            zone, window_hours,
            start_dt.strftime("%Y-%m-%d %H:%M"),
            end_dt.strftime("%Y-%m-%d %H:%M"),
        )

        da_df = self._fetch_da(start_dt, end_dt)
        rt_df = self._fetch_rt(start_dt, end_dt)

        return self._build_result(zone, da_df, rt_df, start_dt, end_dt)

    # ------------------------------------------------------------------
    # Feed fetchers
    # ------------------------------------------------------------------

    def _fetch_da(self, start_dt: datetime, end_dt: datetime) -> pd.DataFrame:
        """Fetch Day-Ahead hourly LMPs for all ZONE nodes in the window."""
        date_range = f"{_fmt_ept(start_dt)} to {_fmt_ept(end_dt)}"
        params: dict[str, Any] = {
            "startRow":               1,
            "rowCount":               self._rows_per_page,
            "datetime_beginning_ept": date_range,
            "type":                   "ZONE",
            "fields": (
                "datetime_beginning_ept,datetime_beginning_utc,"
                "pnode_name,type,total_lmp_da,congestion_price_da,marginal_loss_price_da"
            ),
            "sort":  "datetime_beginning_ept",
            "order": 1,
        }
        logger.info("Fetching DA LMPs | {}", date_range)
        items = self._get_all_pages(DA_ENDPOINT, params)
        return self._parse_da(items)

    def _fetch_rt(self, start_dt: datetime, end_dt: datetime) -> pd.DataFrame:
        """Fetch Real-Time hourly LMPs for all ZONE nodes in the window."""
        date_range = f"{_fmt_ept(start_dt)} to {_fmt_ept(end_dt)}"
        params: dict[str, Any] = {
            "startRow":               1,
            "rowCount":               self._rows_per_page,
            "datetime_beginning_ept": date_range,
            "type":                   "ZONE",
            "fields": (
                "datetime_beginning_ept,datetime_beginning_utc,"
                "pnode_name,type,total_lmp_rt,congestion_price_rt,marginal_loss_price_rt"
            ),
            "sort":  "datetime_beginning_ept",
            "order": 1,
        }
        logger.info("Fetching RT LMPs | {}", date_range)
        items = self._get_all_pages(RT_ENDPOINT, params)
        return self._parse_rt(items)

    # ------------------------------------------------------------------
    # Parsers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_da(items: list[dict]) -> pd.DataFrame:
        if not items:
            logger.warning("Convergence: DA feed returned 0 items.")
            return pd.DataFrame()

        df = pd.DataFrame(items)
        df.columns = [c.lower() for c in df.columns]

        for col in ("total_lmp_da", "congestion_price_da", "marginal_loss_price_da"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        if "datetime_beginning_ept" in df.columns:
            df["timestamp_ept"] = pd.to_datetime(
                df["datetime_beginning_ept"], utc=False
            )

        df = df.rename(columns={"pnode_name": "zone_name", "total_lmp_da": "da_price"})
        logger.debug("Convergence: parsed {} DA rows.", len(df))
        return df[["zone_name", "timestamp_ept", "da_price"]]

    @staticmethod
    def _parse_rt(items: list[dict]) -> pd.DataFrame:
        if not items:
            logger.warning("Convergence: RT feed returned 0 items.")
            return pd.DataFrame()

        df = pd.DataFrame(items)
        df.columns = [c.lower() for c in df.columns]

        for col in ("total_lmp_rt", "congestion_price_rt", "marginal_loss_price_rt"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        if "datetime_beginning_ept" in df.columns:
            df["timestamp_ept"] = pd.to_datetime(
                df["datetime_beginning_ept"], utc=False
            )

        df = df.rename(columns={"pnode_name": "zone_name", "total_lmp_rt": "rt_price"})
        logger.debug("Convergence: parsed {} RT rows.", len(df))
        return df[["zone_name", "timestamp_ept", "rt_price"]]

    # ------------------------------------------------------------------
    # Merge & calculate
    # ------------------------------------------------------------------

    def _build_result(
        self,
        zone: str,
        da_df: pd.DataFrame,
        rt_df: pd.DataFrame,
        start_dt: datetime,
        end_dt: datetime,
    ) -> ConvergenceResult:
        """Merge DA + RT on (zone, hour), compute spread, flag events, generate narrative."""
        empty = ConvergenceResult(
            zone=zone, records=[],
            avg_spread=0.0, max_spread=0.0, min_spread=0.0,
            scarcity_hours=0, oversupply_hours=0, total_hours=0,
            window_start=_iso(start_dt), window_end=_iso(end_dt),
            dominant_signal="MIXED", market_narrative=NARRATIVE_MIXED,
        )

        if da_df.empty or rt_df.empty:
            logger.warning(
                "Convergence: {} data missing (DA empty={}, RT empty={}).",
                zone, da_df.empty, rt_df.empty,
            )
            return empty

        # Filter to the requested zone
        da_zone = da_df[da_df["zone_name"].str.upper() == zone].copy()
        rt_zone = rt_df[rt_df["zone_name"].str.upper() == zone].copy()

        if da_zone.empty or rt_zone.empty:
            logger.warning(
                "Convergence: zone '{}' not found in {} feed. "
                "Available zones: {}",
                zone,
                "DA" if da_zone.empty else "RT",
                sorted((da_df if da_zone.empty else rt_df)["zone_name"].unique().tolist()),
            )
            return empty

        # Inner join on timestamp — only include hours where both prices exist
        merged = pd.merge(
            da_zone[["timestamp_ept", "da_price"]],
            rt_zone[["timestamp_ept", "rt_price"]],
            on="timestamp_ept",
            how="inner",
        ).sort_values("timestamp_ept")

        if merged.empty:
            logger.warning("Convergence: no overlapping hours for zone '{}'.", zone)
            return empty

        # Compute spread and classify events
        merged["spread"] = (merged["rt_price"] - merged["da_price"]).round(4)
        merged["da_price"] = merged["da_price"].round(4)
        merged["rt_price"]  = merged["rt_price"].round(4)

        def _flag(s: float) -> str:
            if s > SCARCITY_THRESHOLD:   return "Scarcity"
            if s < OVERSUPPLY_THRESHOLD: return "Oversupply"
            return "Normal"

        merged["event_flag"] = merged["spread"].apply(_flag)

        records = [
            ConvergenceHour(
                hour=_iso(row["timestamp_ept"]),
                da_price=row["da_price"],
                rt_price=row["rt_price"],
                spread=row["spread"],
                event_flag=row["event_flag"],
            )
            for _, row in merged.iterrows()
        ]

        spreads = merged["spread"]
        scarcity_count   = int((merged["event_flag"] == "Scarcity").sum())
        oversupply_count = int((merged["event_flag"] == "Oversupply").sum())

        dominant_signal, market_narrative = _generate_narrative(merged["spread"])

        logger.info(
            "Convergence: zone={} | {}h aligned | avg spread ${:.2f} | "
            "Scarcity={}h  Oversupply={}h | signal={}",
            zone, len(records), float(spreads.mean()),
            scarcity_count, oversupply_count, dominant_signal,
        )

        return ConvergenceResult(
            zone=zone,
            records=records,
            avg_spread=round(float(spreads.mean()), 4),
            max_spread=round(float(spreads.max()), 4),
            min_spread=round(float(spreads.min()), 4),
            scarcity_hours=scarcity_count,
            oversupply_hours=oversupply_count,
            total_hours=len(records),
            window_start=_iso(start_dt),
            window_end=_iso(end_dt),
            dominant_signal=dominant_signal,
            market_narrative=market_narrative,
        )

    # ------------------------------------------------------------------
    # HTTP helpers  (same pattern as data/lmp.py)
    # ------------------------------------------------------------------

    def _get_key(self) -> str:
        if not self._key:
            try:
                resp = requests.get(SETTINGS_URL, timeout=self._timeout)
                resp.raise_for_status()
                self._key = resp.json().get("subscriptionKey", "")
                logger.debug("Convergence: subscription key fetched ({} chars).", len(self._key))
            except Exception as exc:
                logger.warning("Convergence: could not fetch public key: {}", exc)
                self._key = ""
        return self._key

    def _headers(self) -> dict[str, str]:
        return {"Ocp-Apim-Subscription-Key": self._get_key()}

    def _get(self, url: str, params: dict[str, Any]) -> Any:
        last_exc: Exception = RuntimeError("No attempts made")
        for attempt in range(1, self._max_retries + 1):
            try:
                resp = self._session.get(
                    url, params=params, headers=self._headers(), timeout=self._timeout
                )
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.Timeout as exc:
                logger.warning("Convergence timeout (attempt {}): {}", attempt, exc)
                last_exc = exc
            except requests.exceptions.ConnectionError as exc:
                logger.warning("Convergence connection error (attempt {}): {}", attempt, exc)
                last_exc = exc
            except requests.exceptions.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else "?"
                if exc.response is not None and 400 <= exc.response.status_code < 500:
                    logger.error("Convergence client error {}: {}", status, exc)
                    raise
                logger.warning("Convergence server error {} (attempt {}): {}", status, attempt, exc)
                last_exc = exc

            if attempt < self._max_retries:
                wait = RETRY_BACKOFF * attempt
                logger.info("Convergence retry in {:.1f}s…", wait)
                time.sleep(wait)

        raise last_exc

    def _get_all_pages(self, url: str, params: dict[str, Any]) -> list[dict]:
        all_items: list[dict] = []
        current_url: Optional[str] = url
        current_params: Optional[dict] = params

        while current_url:
            body          = self._get(current_url, current_params or {})
            items         = body.get("items", [])
            all_items.extend(items)
            total         = body.get("totalRows", len(all_items))
            logger.debug("Convergence paginating: {}/{} rows", len(all_items), total)
            next_href     = next(
                (lnk["href"] for lnk in body.get("links", []) if lnk.get("rel") == "next"),
                None,
            )
            current_url   = next_href
            current_params = None

        return all_items


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_narrative(spreads: "pd.Series") -> tuple[str, str]:
    """
    Determine the dominant virtual trading signal and compose a market narrative.

    Logic
    -----
    A spread of (RT − DA) < 0 means RT was cheaper than DA:
      → virtual *sellers* profited (sold in RT, bought back in DA).

    A spread > 0 means RT was more expensive than DA:
      → virtual *buyers* profited (bought in DA, sold in RT).

    If more than ``NARRATIVE_THRESHOLD`` (60 %) of hours share a direction,
    that direction is declared dominant.  Otherwise the session is MIXED.

    Parameters
    ----------
    spreads:
        pandas Series of (RT − DA) values, one per hour.

    Returns
    -------
    (dominant_signal, market_narrative)
        ``dominant_signal`` ∈ {"VIRTUAL_SELLER", "VIRTUAL_BUYER", "MIXED"}
    """
    n = len(spreads)
    if n == 0:
        return "MIXED", NARRATIVE_MIXED

    rt_below_da = int((spreads < 0).sum())   # hours where RT < DA → seller profit
    rt_above_da = int((spreads > 0).sum())   # hours where RT > DA → buyer profit

    seller_fraction = rt_below_da / n
    buyer_fraction  = rt_above_da / n

    if seller_fraction > NARRATIVE_THRESHOLD:
        return "VIRTUAL_SELLER", NARRATIVE_VIRTUAL_SELLER
    if buyer_fraction > NARRATIVE_THRESHOLD:
        return "VIRTUAL_BUYER", NARRATIVE_VIRTUAL_BUYER
    return "MIXED", NARRATIVE_MIXED


def _fmt_ept(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=PJM_TIMEZONE)
    return dt.astimezone(PJM_TIMEZONE).strftime("%Y-%m-%d %H:%M")


def _iso(dt) -> str:
    """Convert a datetime or pandas Timestamp to a plain ISO string."""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------


def fetch_convergence(
    zone: str = DEFAULT_ZONE,
    window_date: Optional[date] = None,
) -> ConvergenceResult:
    """Fetch DA/RT convergence for a zone on a given calendar date (EPT)."""
    return ConvergenceClient().get_convergence(zone=zone, window_date=window_date)


def fetch_convergence_rolling(
    zone: str = DEFAULT_ZONE,
    window_hours: int = 24,
) -> ConvergenceResult:
    """Fetch DA/RT convergence for the last *window_hours* hours of data."""
    return ConvergenceClient().get_convergence_rolling(zone=zone, window_hours=window_hours)


# ---------------------------------------------------------------------------
# Smoke test  (python -m data.convergence)
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import sys
    from datetime import date as dt_date

    logger.remove()
    logger.add(sys.stderr, level="INFO")

    now_ept      = datetime.now(tz=PJM_TIMEZONE)
    yesterday    = (now_ept - timedelta(days=1)).date()
    client       = ConvergenceClient()

    logger.info("=== GridAlpha — DA/RT Convergence Smoke Test ===")
    logger.info("Testing zone=PJM-RTO | date={}", yesterday)

    # Test 1: yesterday's full 24h window
    logger.info("Test 1: Yesterday full 24h window (PJM-RTO)…")
    result = client.get_convergence(zone="PJM-RTO", window_date=yesterday)

    if not result.records:
        logger.error("Test 1 FAILED — no records returned.")
        sys.exit(1)

    logger.success("Test 1 PASSED — {} aligned hours", result.total_hours)

    print(f"\nZone: {result.zone}  |  Window: {result.window_start[:10]}")
    print(f"{'Hour':<22} {'DA':>9} {'RT':>9} {'Spread':>9}  {'Flag'}")
    print("-" * 62)
    for r in result.records:
        flag_marker = " <-- !" if r.event_flag != "Normal" else ""
        print(
            f"{r.hour:<22} "
            f"${r.da_price:>8.2f} "
            f"${r.rt_price:>8.2f} "
            f"${r.spread:>+8.2f}  "
            f"{r.event_flag}{flag_marker}"
        )

    print(f"\nSummary:")
    print(f"  Hours aligned     : {result.total_hours}/24")
    print(f"  Avg spread        : ${result.avg_spread:+.2f}/MWh")
    print(f"  Max spread        : ${result.max_spread:+.2f}/MWh")
    print(f"  Min spread        : ${result.min_spread:+.2f}/MWh")
    print(f"  Scarcity hours    : {result.scarcity_hours}  (spread > +$50)")
    print(f"  Oversupply hours  : {result.oversupply_hours}  (spread < -$50)")
    print(f"  Dominant signal   : {result.dominant_signal}")
    print(f"  Narrative         : {result.market_narrative}")

    print()

    # Test 2: rolling 24h window (current day, partial data expected)
    logger.info("Test 2: Rolling 24h window (partial today + yesterday)…")
    result_rolling = client.get_convergence_rolling(zone="PJM-RTO", window_hours=24)
    if result_rolling.records:
        logger.success(
            "Test 2 PASSED — {} aligned hours | avg spread ${:+.2f}/MWh",
            result_rolling.total_hours, result_rolling.avg_spread,
        )
    else:
        logger.warning("Test 2: no aligned hours returned for rolling window.")

    print()

    # Test 3: single zone with high-congestion history
    logger.info("Test 3: BGE zone (Brandon Shores area, high congestion)…")
    result_bge = client.get_convergence(zone="BGE", window_date=yesterday)
    if result_bge.records:
        logger.success(
            "Test 3 PASSED — BGE: {} hours | avg spread ${:+.2f}/MWh",
            result_bge.total_hours, result_bge.avg_spread,
        )
        # Show event flags
        flags = [r.event_flag for r in result_bge.records]
        from collections import Counter
        for flag, cnt in Counter(flags).most_common():
            print(f"  {flag:<12} {cnt} hours")
    else:
        logger.warning("Test 3: no BGE data returned.")

    print()
