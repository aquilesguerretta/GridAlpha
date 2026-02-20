"""
GridAlpha — PJM Data Miner 2 API Client
Fetches Generation by Fuel Type data from the PJM Data Miner 2 API.

Real API base:    https://api.pjm.com/api/v1/
Public key feed:  http://dataminer2.pjm.com/config/settings.json

How it works
------------
1. A *public* subscription key is fetched once from the settings endpoint —
   no user registration is required for read-only public feeds.
2. All data requests go to api.pjm.com, not dataminer2.pjm.com (that domain
   hosts the web UI, not the REST API).
3. Responses are paginated: totalRows / rowCount drive how many pages to fetch,
   and each page returns a 'links' list with a 'next' rel for the next page URL.
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
GEN_BY_FUEL_ENDPOINT = f"{API_BASE_URL}/gen_by_fuel"

PJM_TIMEZONE = ZoneInfo("America/New_York")

# Rows per page — PJM caps individual responses; we page through all results
ROWS_PER_PAGE = 100

# Retry settings
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0
REQUEST_TIMEOUT_SECONDS = 30

# Renewable fuel types for convenience flag
RENEWABLE_FUELS = {"Wind", "Solar", "Hydro", "Other Renewables"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pjm_datetime_str(dt: datetime) -> str:
    """Format a datetime as the string PJM expects: 'YYYY-MM-DD HH:MM'."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=PJM_TIMEZONE)
    return dt.astimezone(PJM_TIMEZONE).strftime("%Y-%m-%d %H:%M")


def _fetch_public_key(timeout: float = REQUEST_TIMEOUT_SECONDS) -> str:
    """
    Retrieve the publicly available Data Miner subscription key.

    PJM publishes a shared subscription key in their front-end settings file.
    This key covers all public (unauthenticated) feeds — no account needed.
    """
    try:
        resp = requests.get(SETTINGS_URL, timeout=timeout)
        resp.raise_for_status()
        key = resp.json().get("subscriptionKey", "")
        if key:
            logger.debug("Public subscription key obtained ({} chars).", len(key))
        else:
            logger.warning("Settings JSON returned no subscriptionKey.")
        return key
    except Exception as exc:
        logger.warning("Could not fetch public key: {}. Proceeding without key.", exc)
        return ""


# ---------------------------------------------------------------------------
# Core client class
# ---------------------------------------------------------------------------


class PJMClient:
    """
    Thin wrapper around the PJM Data Miner 2 REST API (api.pjm.com/api/v1).

    All public methods return a ``pandas.DataFrame`` with a consistent
    schema so callers never need to parse raw JSON.

    The public feeds do not require user registration.  A shared subscription
    key is fetched automatically from PJM's own settings endpoint on first use.

    Parameters
    ----------
    timeout:
        Per-request HTTP timeout in seconds.
    max_retries:
        How many times to retry on transient network/server errors.
    rows_per_page:
        Number of rows to request per API page (max ~500; default 100).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,  # reserved; public key auto-fetched
        timeout: float = REQUEST_TIMEOUT_SECONDS,
        max_retries: int = MAX_RETRIES,
        rows_per_page: int = ROWS_PER_PAGE,
    ) -> None:
        self._timeout = timeout
        self._max_retries = max_retries
        self._rows_per_page = rows_per_page
        self._session = requests.Session()
        self._subscription_key: Optional[str] = api_key  # lazy-fetch if None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_subscription_key(self) -> str:
        if not self._subscription_key:
            self._subscription_key = _fetch_public_key(self._timeout)
        return self._subscription_key

    def _headers(self) -> dict[str, str]:
        return {"Ocp-Apim-Subscription-Key": self._get_subscription_key()}

    def _get(self, url: str, params: dict[str, Any]) -> Any:
        """
        Single GET with retry/backoff. Returns parsed JSON body.
        Raises ``requests.HTTPError`` on a non-2xx final response.
        """
        last_exc: Exception = RuntimeError("No attempts made")
        for attempt in range(1, self._max_retries + 1):
            try:
                logger.debug("GET {} params={} attempt={}/{}", url, params, attempt, self._max_retries)
                resp = self._session.get(
                    url, params=params, headers=self._headers(), timeout=self._timeout
                )
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.Timeout as exc:
                logger.warning("Timeout (attempt {}): {}", attempt, exc)
                last_exc = exc
            except requests.exceptions.ConnectionError as exc:
                logger.warning("Connection error (attempt {}): {}", attempt, exc)
                last_exc = exc
            except requests.exceptions.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else "?"
                if exc.response is not None and 400 <= exc.response.status_code < 500:
                    logger.error("Client error {}: {}", status, exc)
                    raise
                logger.warning("Server error {} (attempt {}): {}", status, attempt, exc)
                last_exc = exc

            if attempt < self._max_retries:
                wait = RETRY_BACKOFF_SECONDS * attempt
                logger.info("Retrying in {:.1f}s…", wait)
                time.sleep(wait)

        raise last_exc

    def _get_all_pages(self, url: str, params: dict[str, Any]) -> list[dict]:
        """
        Fetch all pages for a paginated endpoint.

        PJM returns a 'links' list in each response; we follow the 'next'
        link until no more pages remain.
        """
        all_items: list[dict] = []
        current_url: Optional[str] = url
        current_params: Optional[dict] = params

        while current_url:
            body = self._get(current_url, current_params or {})
            items = body.get("items", [])
            all_items.extend(items)

            total = body.get("totalRows", len(all_items))
            logger.debug("Fetched {}/{} rows so far.", len(all_items), total)

            # Follow pagination link if present
            next_href = next(
                (lnk["href"] for lnk in body.get("links", []) if lnk.get("rel") == "next"),
                None,
            )
            current_url = next_href
            current_params = None  # next-page URL already contains all params

        return all_items

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    def get_gen_by_fuel(
        self,
        start_dt: Optional[datetime] = None,
        end_dt: Optional[datetime] = None,
        rolling_window_hours: int = 24,
    ) -> pd.DataFrame:
        """
        Fetch generation by fuel type from PJM for the given time window.

        Parameters
        ----------
        start_dt:
            Start of the window (Eastern Time). Defaults to
            ``rolling_window_hours`` before ``end_dt``.
        end_dt:
            End of the window (Eastern Time). Defaults to now.
        rolling_window_hours:
            Convenience shorthand when ``start_dt`` is None.

        Returns
        -------
        pandas.DataFrame
            Columns: datetime_beginning_ept, datetime_beginning_utc,
                     fuel_type, mw, is_renewable
        """
        if end_dt is None:
            end_dt = datetime.now(tz=PJM_TIMEZONE)
        if start_dt is None:
            start_dt = end_dt - timedelta(hours=rolling_window_hours)

        date_range = f"{_pjm_datetime_str(start_dt)} to {_pjm_datetime_str(end_dt)}"
        params: dict[str, Any] = {
            "startRow": 1,
            "rowCount": self._rows_per_page,
            "datetime_beginning_ept": date_range,
            "fields": "datetime_beginning_ept,datetime_beginning_utc,fuel_type,mw",
            "sort": "datetime_beginning_utc",
            "order": 1,
        }

        logger.info("Fetching gen_by_fuel | {}", date_range)
        items = self._get_all_pages(GEN_BY_FUEL_ENDPOINT, params)
        return self._parse_gen_by_fuel(items)

    def get_latest_gen_snapshot(self) -> pd.DataFrame:
        """
        Return the most-recent single-hour generation snapshot.

        Queries the last 2 hours and returns only the latest timestamp,
        giving a clean point-in-time picture of the current fuel mix.
        """
        df = self.get_gen_by_fuel(rolling_window_hours=2)
        if df.empty:
            logger.warning("No data returned for latest snapshot.")
            return df

        latest_ts = df["datetime_beginning_ept"].max()
        snapshot = df[df["datetime_beginning_ept"] == latest_ts].copy()
        logger.info(
            "Latest snapshot: {} — {} fuel types, {:.0f} MW total",
            latest_ts,
            len(snapshot),
            snapshot["mw"].sum(),
        )
        return snapshot

    # ------------------------------------------------------------------
    # Parsing / normalization
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_gen_by_fuel(items: list[dict]) -> pd.DataFrame:
        """Normalize a list of API item dicts into a clean DataFrame."""
        if not items:
            logger.warning("No items to parse.")
            return pd.DataFrame()

        df = pd.DataFrame(items)

        # Normalise column names
        df.columns = [c.lower().replace(" ", "_") for c in df.columns]

        # Parse timestamps
        for col in ("datetime_beginning_ept", "datetime_beginning_utc"):
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], utc=(col.endswith("_utc")))

        # Ensure numeric MW
        if "mw" in df.columns:
            df["mw"] = pd.to_numeric(df["mw"], errors="coerce").fillna(0.0)

        # Renewable flag
        if "fuel_type" in df.columns:
            df["is_renewable"] = df["fuel_type"].isin(RENEWABLE_FUELS)

        logger.debug("Parsed {} rows.", len(df))
        return df


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def fetch_gen_by_fuel(hours: int = 24) -> pd.DataFrame:
    """Fetch the last *hours* of generation-by-fuel data."""
    return PJMClient().get_gen_by_fuel(rolling_window_hours=hours)


def fetch_latest_snapshot() -> pd.DataFrame:
    """Fetch the most recent generation snapshot."""
    return PJMClient().get_latest_gen_snapshot()


# ---------------------------------------------------------------------------
# Smoke test  (python data/pjm_client.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    logger.remove()
    logger.add(sys.stderr, level="DEBUG")

    logger.info("=== GridAlpha — PJM Client Smoke Test ===")

    client = PJMClient()

    # Test 1: 24-hour window
    logger.info("Test 1: Fetching last 24 hours of gen_by_fuel…")
    df_24h = client.get_gen_by_fuel(rolling_window_hours=24)

    if df_24h.empty:
        logger.error("Test 1 FAILED — empty DataFrame.")
    else:
        logger.success("Test 1 PASSED — {} rows | columns: {}", len(df_24h), list(df_24h.columns))
        logger.info("\n{}", df_24h.head(5).to_string())

    print()

    # Test 2: Latest snapshot
    logger.info("Test 2: Fetching latest generation snapshot…")
    df_snap = client.get_latest_gen_snapshot()

    if df_snap.empty:
        logger.error("Test 2 FAILED — empty snapshot.")
    else:
        total_mw = df_snap["mw"].sum()
        ren_mw = df_snap.loc[df_snap["is_renewable"], "mw"].sum()
        ren_pct = ren_mw / total_mw * 100 if total_mw > 0 else 0.0
        logger.success(
            "Test 2 PASSED — Total: {:.0f} MW | Renewable: {:.0f} MW ({:.1f}%)",
            total_mw, ren_mw, ren_pct,
        )
        logger.info("\n{}", df_snap[["fuel_type", "mw", "is_renewable"]].to_string(index=False))
