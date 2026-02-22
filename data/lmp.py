"""
GridAlpha — PJM LMP Price Intelligence Client
Fetches Real-Time Hourly LMP data by transmission zone.

Feed:    rt_unverified_hrl_lmps  (updated every hour, all 22 PJM zones)
Endpoint: https://api.pjm.com/api/v1/rt_unverified_hrl_lmps

LMP decomposition
-----------------
  LMP  =  Energy  +  Congestion  +  Loss

The unverified feed omits the system energy price column, so energy is
derived: energy = total_lmp_rt − congestion_price_rt − marginal_loss_price_rt.
This identity always holds by definition of LMP pricing.

Each record in the output maps to one PJM transmission zone for one hour.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

import pandas as pd
import requests
from dotenv import load_dotenv
from loguru import logger

load_dotenv()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SETTINGS_URL = "http://dataminer2.pjm.com/config/settings.json"
API_BASE_URL = "https://api.pjm.com/api/v1"
LMP_ENDPOINT = f"{API_BASE_URL}/rt_unverified_hrl_lmps"

PJM_TIMEZONE = ZoneInfo("America/New_York")
ROWS_PER_PAGE = 100
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0
REQUEST_TIMEOUT = 30.0

# All 22 PJM transmission zones (including the RTO aggregate)
PJM_ZONES = {
    "AECO", "AEP", "APS", "ATSI", "BGE", "COMED", "DAY", "DEOK",
    "DOM", "DPL", "DUQ", "EKPC", "JCPL", "METED", "OVEC", "PECO",
    "PENELEC", "PEPCO", "PJM-RTO", "PPL", "PSEG", "RECO",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fmt_ept(dt: datetime) -> str:
    """Format a datetime as the PJM EPT string 'YYYY-MM-DD HH:MM'."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=PJM_TIMEZONE)
    return dt.astimezone(PJM_TIMEZONE).strftime("%Y-%m-%d %H:%M")


def _fetch_public_key(timeout: float = REQUEST_TIMEOUT) -> str:
    """Retrieve the PJM public subscription key from their settings endpoint."""
    try:
        resp = requests.get(SETTINGS_URL, timeout=timeout)
        resp.raise_for_status()
        key = resp.json().get("subscriptionKey", "")
        if key:
            logger.debug("LMP client: public key obtained ({} chars).", len(key))
        else:
            logger.warning("LMP client: settings JSON returned no subscriptionKey.")
        return key
    except Exception as exc:
        logger.warning("LMP client: could not fetch public key: {}", exc)
        return ""


# ---------------------------------------------------------------------------
# Core client
# ---------------------------------------------------------------------------


class LMPClient:
    """
    Fetches Real-Time LMP data by PJM transmission zone.

    Uses the rt_unverified_hrl_lmps feed, which is updated every hour and
    provides the most current pricing available before settlement verification.

    The LMP for each zone is decomposed into:
        total  =  energy  +  congestion  +  loss

    Parameters
    ----------
    timeout:      Per-request HTTP timeout in seconds.
    max_retries:  Number of retry attempts on transient errors.
    rows_per_page: Rows per paginated request.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = REQUEST_TIMEOUT,
        max_retries: int = MAX_RETRIES,
        rows_per_page: int = ROWS_PER_PAGE,
    ) -> None:
        self._timeout = timeout
        self._max_retries = max_retries
        self._rows_per_page = rows_per_page
        self._session = requests.Session()
        self._subscription_key: Optional[str] = api_key

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_key(self) -> str:
        if not self._subscription_key:
            self._subscription_key = _fetch_public_key(self._timeout)
        return self._subscription_key

    def _headers(self) -> dict[str, str]:
        return {"Ocp-Apim-Subscription-Key": self._get_key()}

    def _get(self, url: str, params: dict[str, Any]) -> Any:
        """GET with retry/backoff. Returns parsed JSON."""
        last_exc: Exception = RuntimeError("No attempts made")
        for attempt in range(1, self._max_retries + 1):
            try:
                logger.debug("LMP GET {} params={} attempt={}/{}", url, params, attempt, self._max_retries)
                resp = self._session.get(url, params=params, headers=self._headers(), timeout=self._timeout)
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.Timeout as exc:
                logger.warning("LMP timeout (attempt {}): {}", attempt, exc)
                last_exc = exc
            except requests.exceptions.ConnectionError as exc:
                logger.warning("LMP connection error (attempt {}): {}", attempt, exc)
                last_exc = exc
            except requests.exceptions.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else "?"
                if exc.response is not None and 400 <= exc.response.status_code < 500:
                    logger.error("LMP client error {}: {}", status, exc)
                    raise
                logger.warning("LMP server error {} (attempt {}): {}", status, attempt, exc)
                last_exc = exc

            if attempt < self._max_retries:
                wait = RETRY_BACKOFF * attempt
                logger.info("LMP retry in {:.1f}s…", wait)
                time.sleep(wait)

        raise last_exc

    def _get_all_pages(self, url: str, params: dict[str, Any]) -> list[dict]:
        """Follow PJM pagination links until all rows are retrieved."""
        all_items: list[dict] = []
        current_url: Optional[str] = url
        current_params: Optional[dict] = params

        while current_url:
            body = self._get(current_url, current_params or {})
            items = body.get("items", [])
            all_items.extend(items)

            total = body.get("totalRows", len(all_items))
            logger.debug("LMP paginating: {}/{} rows", len(all_items), total)

            next_href = next(
                (lnk["href"] for lnk in body.get("links", []) if lnk.get("rel") == "next"),
                None,
            )
            current_url = next_href
            current_params = None

        return all_items

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def get_lmp_by_zone(
        self,
        start_dt: Optional[datetime] = None,
        end_dt: Optional[datetime] = None,
        rolling_window_hours: int = 2,
    ) -> pd.DataFrame:
        """
        Fetch hourly real-time LMP data for all PJM transmission zones.

        Parameters
        ----------
        start_dt / end_dt:
            Explicit time window in Eastern Time.
        rolling_window_hours:
            Convenience shorthand when start_dt is None (default: 2h).

        Returns
        -------
        pd.DataFrame
            Columns: zone_name, lmp_total, energy_component,
                     congestion_component, loss_component, timestamp_ept,
                     timestamp_utc
        """
        if end_dt is None:
            end_dt = datetime.now(tz=PJM_TIMEZONE)
        if start_dt is None:
            start_dt = end_dt - timedelta(hours=rolling_window_hours)

        date_range = f"{_fmt_ept(start_dt)} to {_fmt_ept(end_dt)}"
        params: dict[str, Any] = {
            "startRow": 1,
            "rowCount": self._rows_per_page,
            "datetime_beginning_ept": date_range,
            "type": "ZONE",
            "fields": (
                "datetime_beginning_ept,datetime_beginning_utc,"
                "pnode_name,type,total_lmp_rt,congestion_price_rt,marginal_loss_price_rt"
            ),
            "sort": "datetime_beginning_ept",
            "order": 1,
        }

        logger.info("Fetching LMP by zone | {}", date_range)
        items = self._get_all_pages(LMP_ENDPOINT, params)
        return self._parse(items)

    def get_latest_lmp_snapshot(self) -> pd.DataFrame:
        """
        Return LMP data for the most recent completed hour across all zones.

        Queries the last 2 hours and returns only the latest timestamp.
        """
        df = self.get_lmp_by_zone(rolling_window_hours=2)
        if df.empty:
            logger.warning("No LMP data returned for latest snapshot.")
            return df

        latest_ts = df["timestamp_ept"].max()
        snapshot = df[df["timestamp_ept"] == latest_ts].copy()
        logger.info(
            "LMP snapshot: {} — {} zones | avg total LMP {:.2f} $/MWh",
            latest_ts,
            len(snapshot),
            snapshot["lmp_total"].mean(),
        )
        return snapshot

    # ------------------------------------------------------------------
    # Parsing / normalization
    # ------------------------------------------------------------------

    @staticmethod
    def _parse(items: list[dict]) -> pd.DataFrame:
        """
        Normalize raw API items into the clean LMP schema.

        Output columns
        --------------
        zone_name           PJM transmission zone name (e.g. 'BGE', 'COMED')
        lmp_total           Total LMP in $/MWh
        energy_component    Energy price = total − congestion − loss  ($/MWh)
        congestion_component  Congestion price component ($/MWh)
        loss_component      Marginal loss price component ($/MWh)
        timestamp_ept       Hour-beginning timestamp, Eastern Time (ISO str)
        timestamp_utc       Hour-beginning timestamp, UTC (ISO str)
        """
        if not items:
            logger.warning("LMP: no items to parse.")
            return pd.DataFrame()

        df = pd.DataFrame(items)
        df.columns = [c.lower().replace(" ", "_") for c in df.columns]

        # Parse timestamps
        for col in ("datetime_beginning_ept", "datetime_beginning_utc"):
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], utc=(col.endswith("_utc")))

        # Numeric coercion
        for col in ("total_lmp_rt", "congestion_price_rt", "marginal_loss_price_rt"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        # Derive energy component: LMP = energy + congestion + loss
        df["energy_component"] = (
            df["total_lmp_rt"]
            - df["congestion_price_rt"]
            - df["marginal_loss_price_rt"]
        ).round(6)

        # Rename to clean output schema
        df = df.rename(columns={
            "pnode_name":             "zone_name",
            "total_lmp_rt":           "lmp_total",
            "congestion_price_rt":    "congestion_component",
            "marginal_loss_price_rt": "loss_component",
            "datetime_beginning_ept": "timestamp_ept",
            "datetime_beginning_utc": "timestamp_utc",
        })

        # Keep only the columns we care about, in order
        keep = [
            "zone_name", "lmp_total", "energy_component",
            "congestion_component", "loss_component",
            "timestamp_ept", "timestamp_utc",
        ]
        df = df[[c for c in keep if c in df.columns]]

        logger.debug("LMP: parsed {} zone-hour rows.", len(df))
        return df


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def fetch_lmp_by_zone(hours: int = 2) -> pd.DataFrame:
    """Fetch LMP data for the last *hours* across all PJM zones."""
    return LMPClient().get_lmp_by_zone(rolling_window_hours=hours)


def fetch_latest_lmp_snapshot() -> pd.DataFrame:
    """Fetch the most recent completed hour of LMP data for all zones."""
    return LMPClient().get_latest_lmp_snapshot()


# ---------------------------------------------------------------------------
# Smoke test  (python data/lmp.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    logger.remove()
    logger.add(sys.stderr, level="DEBUG")

    logger.info("=== GridAlpha — LMP Client Smoke Test ===")
    client = LMPClient()

    # Test 1: latest snapshot
    logger.info("Test 1: Latest LMP snapshot by zone…")
    df = client.get_latest_lmp_snapshot()

    if df.empty:
        logger.error("Test 1 FAILED — empty DataFrame.")
    else:
        logger.success("Test 1 PASSED — {} zone records", len(df))
        logger.info("\n{}", df[["zone_name","lmp_total","energy_component",
                                "congestion_component","loss_component"]].to_string(index=False))

    print()

    # Test 2: rolling window
    logger.info("Test 2: Last 4h of LMP data…")
    df4 = client.get_lmp_by_zone(rolling_window_hours=4)
    if df4.empty:
        logger.error("Test 2 FAILED — empty DataFrame.")
    else:
        logger.success("Test 2 PASSED — {} rows across {} unique hours",
                       len(df4), df4["timestamp_ept"].nunique())

    print()

    # Test 3: decomposition check — energy + congestion + loss should equal total
    if not df.empty:
        df["_check"] = (
            df["energy_component"] + df["congestion_component"] + df["loss_component"]
        ).round(4)
        df["_total_r"] = df["lmp_total"].round(4)
        mismatches = df[df["_check"] != df["_total_r"]]
        if mismatches.empty:
            logger.success("Test 3 PASSED — LMP decomposition identity holds for all zones.")
        else:
            logger.warning("Test 3: {} decomposition mismatches (rounding):", len(mismatches))
            logger.info("\n{}", mismatches[["zone_name","lmp_total","_check"]].to_string(index=False))
