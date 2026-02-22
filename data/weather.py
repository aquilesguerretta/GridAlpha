"""
GridAlpha — Weather & Load Intelligence
Fetches real hourly temperature observations from NOAA's free API and
hourly actual/forecast load from PJM, joins them by timestamp, and
produces weather-alert annotated records.

Weather source
--------------
  NOAA Weather.gov API  (no API key required; User-Agent header mandatory)

  Station resolution (two-step):
    1. GET /gridpoints/{office}/{gridX},{gridY}/stations  → first listed station
    2. If step 1 fails, fall back to a known airport ICAO station

  Observations:
    GET /stations/{stationId}/observations?start={utc_iso}&limit=30

  Temperatures are returned in Celsius; converted to Fahrenheit here.
  Observation timestamps are UTC; converted to EPT and floored to the hour.

Zone → NOAA grid mapping (user-specified + geographic fill-in)
--------------------------------------------------------------
  Eastern zones     → Philadelphia (PAX / 96,70)   fallback KPHL
  Midwest / ComEd   → Chicago     (LOT / 65,73)   fallback KORD
  Western/Appalachia→ Pittsburgh  (PBZ / 75,65)   fallback KPIT

PJM load source
---------------
  Actual load  : GET /api/v1/inst_load  (5-min instantaneous; aggregated to hourly mean)
                 Field: instantaneous_load.  Area codes are short-form PJM identifiers
                 (e.g. "BC"=BGE, "PS"=PSEG, "PJM RTO"=system-wide aggregate).

  Load forecast: Day-ahead persistence forecast — yesterday's actual load at the
                 same hours.  Computed by fetching inst_load for [now−48h, now−24h]
                 and aligning with today's hours.  This is the standard naive
                 day-ahead baseline used in grid operations when no published
                 forecast feed is available via the public API.

Output per hour
---------------
  timestamp        : hour-beginning EPT (ISO string)
  temperature_f    : observed temperature (°F)
  temperature_c    : observed temperature (°C)
  zone             : PJM zone name
  station_id       : NOAA station identifier (e.g. "KPHL")
  load_forecast_mw : forecast load (MW)
  actual_load_mw   : actual load (MW)
  load_delta_pct   : (actual − forecast) / forecast × 100
  weather_alert    : "Heat Stress" if temp > 90 °F
                     "Cold Snap"   if temp < 20 °F
                     "Normal"      otherwise
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

import pandas as pd
import requests
from loguru import logger

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NOAA_BASE    = "https://api.weather.gov"
NOAA_HEADERS = {
    # NOAA requires a descriptive User-Agent; requests without it may be blocked
    "User-Agent": "GridAlpha/1.0 (energy-dashboard@psu.edu)",
    "Accept":     "application/geo+json",
}

SETTINGS_URL       = "http://dataminer2.pjm.com/config/settings.json"
API_BASE_URL       = "https://api.pjm.com/api/v1"
INST_LOAD_ENDPOINT = f"{API_BASE_URL}/inst_load"

PJM_TIMEZONE   = ZoneInfo("America/New_York")
UTC            = ZoneInfo("UTC")

ROWS_PER_PAGE   = 500
MAX_RETRIES     = 3
RETRY_BACKOFF   = 2.0
REQUEST_TIMEOUT = 30.0

HEAT_STRESS_F: float = 90.0
COLD_SNAP_F:   float = 20.0


# ---------------------------------------------------------------------------
# Zone → NOAA grid mapping
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _GridInfo:
    office:           str   # NWS Weather Forecast Office code
    grid_x:           int
    grid_y:           int
    city:             str
    fallback_station: str   # ICAO airport station; used when gridpoints lookup fails


# User-specified: PHI (eastern), LOT (Chicago), PBZ (Pittsburgh)
# Remaining zones filled in by geographic proximity
ZONE_GRID_MAP: dict[str, _GridInfo] = {

    # ── Philadelphia (PAX/96/70) ── eastern corridor ─────────────────────────
    "BGE":     _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "PECO":    _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "PPL":     _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "PSEG":    _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "PEPCO":   _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "AECO":    _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "JCPL":    _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "RECO":    _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "METED":   _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
    "DOM":     _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),

    # ── Chicago (LOT/65/73) ── Midwest ───────────────────────────────────────
    "COMED":   _GridInfo("LOT", 65, 73, "Chicago",      "KORD"),
    "DAY":     _GridInfo("LOT", 65, 73, "Chicago",      "KORD"),
    "EKPC":    _GridInfo("LOT", 65, 73, "Chicago",      "KORD"),

    # ── Pittsburgh (PBZ/75/65) ── Ohio Valley / Appalachia ───────────────────
    "AEP":     _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),
    "ATSI":    _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),
    "DPL":     _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),
    "DUQ":     _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),
    "DEOK":    _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),
    "OVEC":    _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),
    "PENELEC": _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),
    "APS":     _GridInfo("PBZ", 75, 65, "Pittsburgh",   "KPIT"),

    # ── System-wide default ──────────────────────────────────────────────────
    "PJM-RTO": _GridInfo("PAX", 96, 70, "Philadelphia", "KPHL"),
}

# PJM zone name → inst_load area code
# Determined by live probe of api.pjm.com/api/v1/inst_load (2026-02).
# Short-form codes are PJM's internal load balancing area abbreviations.
ZONE_LOAD_AREA: dict[str, str] = {
    "AECO":    "AE",
    "AEP":     "AEP",
    "APS":     "APS",
    "ATSI":    "ATSI",
    "BGE":     "BC",
    "COMED":   "COMED",
    "DAY":     "DAYTON",
    "DEOK":    "DEOK",
    "DOM":     "DOM",
    "DPL":     "DPL",
    "DUQ":     "DUQ",
    "EKPC":    "EKPC",
    "JCPL":    "JC",
    "METED":   "ME",
    "OVEC":    "UG",
    "PECO":    "PE",
    "PENELEC": "PN",
    "PEPCO":   "PEP",
    "PJM-RTO": "PJM RTO",
    "PPL":     "PL",
    "PSEG":    "PS",
    "RECO":    "RECO",
}


# ---------------------------------------------------------------------------
# Output dataclasses
# ---------------------------------------------------------------------------


@dataclass
class WeatherHour:
    """Weather + load snapshot for a single hour."""

    timestamp:        str    # hour-beginning EPT, ISO
    temperature_f:    float
    temperature_c:    float
    zone:             str
    station_id:       str
    load_forecast_mw: float
    actual_load_mw:   float
    load_delta_pct:   float
    weather_alert:    str    # "Heat Stress" | "Cold Snap" | "Normal"

    def to_dict(self) -> dict:
        return {
            "timestamp":        self.timestamp,
            "temperature_f":    self.temperature_f,
            "temperature_c":    self.temperature_c,
            "zone":             self.zone,
            "station_id":       self.station_id,
            "load_forecast_mw": self.load_forecast_mw,
            "actual_load_mw":   self.actual_load_mw,
            "load_delta_pct":   self.load_delta_pct,
            "weather_alert":    self.weather_alert,
        }


@dataclass
class WeatherResult:
    """Full weather/load result for one zone over the requested window."""

    zone:         str
    station_id:   str
    station_city: str
    records:      list[WeatherHour]
    avg_temp_f:   float
    max_temp_f:   float
    min_temp_f:   float
    heat_hours:   int
    cold_hours:   int
    total_hours:  int
    window_start: str
    window_end:   str

    def to_dict(self) -> dict:
        return {
            "zone":         self.zone,
            "station_id":   self.station_id,
            "station_city": self.station_city,
            "records":      [r.to_dict() for r in self.records],
            "avg_temp_f":   self.avg_temp_f,
            "max_temp_f":   self.max_temp_f,
            "min_temp_f":   self.min_temp_f,
            "heat_hours":   self.heat_hours,
            "cold_hours":   self.cold_hours,
            "total_hours":  self.total_hours,
            "window_start": self.window_start,
            "window_end":   self.window_end,
        }


# ---------------------------------------------------------------------------
# Core client
# ---------------------------------------------------------------------------


class WeatherClient:
    """
    Joins NOAA hourly temperature data with PJM actual/forecast load.

    For each requested zone:
      1. Resolves the nearest NOAA observation station via the NWS gridpoints API.
      2. Fetches hourly temperature observations for the requested window.
      3. Fetches PJM actual load (inst_load, aggregated to hourly averages).
      4. Fetches PJM load forecast (load_frcstd_7day) for the same window.
      5. Inner-joins weather + load on the hour-beginning EPT timestamp.
      6. Computes load_delta_pct and weather_alert for each aligned hour.

    Station IDs are cached within the process lifetime to avoid repeated
    gridpoints lookups.

    Parameters
    ----------
    timeout:       Per-request HTTP timeout in seconds.
    max_retries:   Retry attempts on transient HTTP errors.
    rows_per_page: PJM API pagination size.
    """

    # class-level cache: (office, grid_x, grid_y) → resolved NOAA station ID
    _station_cache: dict[tuple, str] = {}

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = REQUEST_TIMEOUT,
        max_retries: int = MAX_RETRIES,
        rows_per_page: int = ROWS_PER_PAGE,
    ) -> None:
        self._timeout  = timeout
        self._retries  = max_retries
        self._rows     = rows_per_page
        self._pjm_session  = requests.Session()
        self._noaa_session = requests.Session()
        self._pjm_key: Optional[str] = api_key

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_weather(
        self,
        zone: str = "PJM-RTO",
        window_hours: int = 24,
    ) -> WeatherResult:
        """
        Return hourly weather + load records for the requested zone.

        Parameters
        ----------
        zone:
            PJM zone name (case-insensitive). Defaults to ``"PJM-RTO"``.
        window_hours:
            How many hours of history to return (default 24).

        Returns
        -------
        WeatherResult
            Hourly records sorted chronologically; summary stats included.
        """
        zone = zone.upper()
        grid = ZONE_GRID_MAP.get(zone, ZONE_GRID_MAP["PJM-RTO"])

        end_dt   = datetime.now(tz=PJM_TIMEZONE)
        start_dt = end_dt - timedelta(hours=window_hours)

        logger.info(
            "Weather | zone={} | city={} ({}/{},{}) | window={}h",
            zone, grid.city, grid.office, grid.grid_x, grid.grid_y, window_hours,
        )

        # Resolve the NOAA station (cached after first lookup per grid point)
        station_id = self._resolve_station(grid)

        # Parallel data fetch
        obs_df      = self._fetch_observations(station_id, start_dt, end_dt)
        actual_df   = self._fetch_actual_load(zone, start_dt, end_dt)
        forecast_df = self._fetch_forecast_load(zone, start_dt, end_dt)

        records = self._build_records(zone, station_id, obs_df, actual_df, forecast_df)

        return self._build_result(zone, station_id, grid.city, records, start_dt, end_dt)

    # ------------------------------------------------------------------
    # NOAA helpers
    # ------------------------------------------------------------------

    def _resolve_station(self, grid: _GridInfo) -> str:
        """
        Return the NOAA station ID for a grid cell.

        First queries the NWS gridpoints/stations endpoint; if that fails
        (invalid grid reference or API error) falls back to the known
        airport ICAO station in the _GridInfo.
        """
        cache_key = (grid.office, grid.grid_x, grid.grid_y)
        if cache_key in WeatherClient._station_cache:
            return WeatherClient._station_cache[cache_key]

        url = f"{NOAA_BASE}/gridpoints/{grid.office}/{grid.grid_x},{grid.grid_y}/stations"
        try:
            resp = self._noaa_session.get(url, headers=NOAA_HEADERS, timeout=self._timeout)
            resp.raise_for_status()
            features = resp.json().get("features", [])
            if features:
                station_id = features[0]["properties"]["stationIdentifier"]
                logger.info(
                    "NOAA: resolved grid {}/{},{} → station {}",
                    grid.office, grid.grid_x, grid.grid_y, station_id,
                )
                WeatherClient._station_cache[cache_key] = station_id
                return station_id
        except Exception as exc:
            logger.warning(
                "NOAA: gridpoints lookup failed for {}/{},{} — using fallback {}. ({})",
                grid.office, grid.grid_x, grid.grid_y, grid.fallback_station, exc,
            )

        # Fallback: known airport station
        WeatherClient._station_cache[cache_key] = grid.fallback_station
        return grid.fallback_station

    def _fetch_observations(
        self,
        station_id: str,
        start_dt: datetime,
        end_dt: datetime,
    ) -> pd.DataFrame:
        """
        Fetch hourly temperature observations from NOAA.

        Returns a DataFrame with columns:
            hour_ept  (datetime, EPT, floored to hour)
            temp_c    (float, Celsius)
            temp_f    (float, Fahrenheit)

        Observations without a valid temperature are dropped.
        Multiple observations within the same hour are averaged.
        """
        # NOAA uses UTC ISO 8601 for the start parameter
        start_utc = start_dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        url = f"{NOAA_BASE}/stations/{station_id}/observations"
        params = {"start": start_utc, "limit": 30}

        logger.info("NOAA: fetching observations | station={} | start={}", station_id, start_utc)
        try:
            resp = self._noaa_session.get(url, params=params, headers=NOAA_HEADERS,
                                          timeout=self._timeout)
            resp.raise_for_status()
            features = resp.json().get("features", [])
        except Exception as exc:
            logger.error("NOAA: observations fetch failed for {}: {}", station_id, exc)
            return pd.DataFrame()

        if not features:
            logger.warning("NOAA: no observations returned for station {}.", station_id)
            return pd.DataFrame()

        rows = []
        for feat in features:
            props = feat.get("properties", {})
            ts_str = props.get("timestamp")
            temp   = props.get("temperature", {})
            val    = temp.get("value") if isinstance(temp, dict) else None
            if ts_str is None or val is None:
                continue
            try:
                # Parse UTC timestamp, convert to EPT, floor to hour
                ts_utc  = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                ts_ept  = ts_utc.astimezone(PJM_TIMEZONE)
                hour_ept = ts_ept.replace(minute=0, second=0, microsecond=0)
                temp_c  = float(val)
                temp_f  = round(temp_c * 9 / 5 + 32, 2)
                rows.append({"hour_ept": hour_ept, "temp_c": temp_c, "temp_f": temp_f})
            except Exception as exc:
                logger.debug("NOAA: skipping malformed observation: {}", exc)

        if not rows:
            logger.warning("NOAA: no valid temperature observations parsed.")
            return pd.DataFrame()

        df = pd.DataFrame(rows)
        # Average multiple readings within the same hour (shouldn't often happen)
        df = (
            df.groupby("hour_ept", as_index=False)
              .agg(temp_c=("temp_c", "mean"), temp_f=("temp_f", "mean"))
        )
        df["temp_c"] = df["temp_c"].round(2)
        df["temp_f"] = df["temp_f"].round(2)
        df = df.sort_values("hour_ept")

        logger.info("NOAA: {} hourly temperature records from {}.", len(df), station_id)
        return df

    # ------------------------------------------------------------------
    # PJM load helpers
    # ------------------------------------------------------------------

    def _fetch_actual_load(
        self,
        zone: str,
        start_dt: datetime,
        end_dt: datetime,
    ) -> pd.DataFrame:
        """
        Fetch PJM instantaneous load (inst_load) and aggregate to hourly averages.

        Uses the live-probed area code mapping (ZONE_LOAD_AREA).
        Falls back to "PJM RTO" aggregate if zone-level data is unavailable.

        Returns DataFrame with columns: hour_ept, actual_mw
        """
        load_area = ZONE_LOAD_AREA.get(zone, "PJM RTO")
        date_range = f"{_fmt_ept(start_dt)} to {_fmt_ept(end_dt)}"

        for area in (load_area, "PJM RTO"):
            params: dict[str, Any] = {
                "startRow":               1,
                "rowCount":               self._rows,
                "area":                   area,
                "datetime_beginning_ept": date_range,
                "sort":                   "datetime_beginning_ept",
                "order":                  1,
            }
            try:
                items = self._pjm_get_all_pages(INST_LOAD_ENDPOINT, params)
            except Exception as exc:
                logger.warning("PJM inst_load (area={}): {}", area, exc)
                items = []

            if items:
                df = self._parse_load(items, ["instantaneous_load", "mw", "load_mw"])
                if not df.empty:
                    df["hour_ept"] = df["ts_ept"].dt.floor("h")
                    hourly = (
                        df.groupby("hour_ept", as_index=False)
                          .agg(actual_mw=("load_val", "mean"))
                    )
                    hourly["actual_mw"] = hourly["actual_mw"].round(1)
                    logger.info(
                        "PJM inst_load: {} hourly rows (area={}).", len(hourly), area,
                    )
                    return hourly

        logger.warning("PJM inst_load: no data for zone '{}' or RTO.", zone)
        return pd.DataFrame()

    def _fetch_forecast_load(
        self,
        zone: str,
        start_dt: datetime,
        end_dt: datetime,
    ) -> pd.DataFrame:
        """
        Build a day-ahead persistence load forecast.

        PJM's public API does not expose a working load-forecast feed at the
        zone level.  The standard operational fallback is the **persistence
        forecast**: yesterday's actual load at the same clock hours is the
        best naive predictor of today's load (captures weekday/seasonal pattern).

        Fetches inst_load for [start_dt − 24h, end_dt − 24h] and shifts the
        timestamps forward 24 hours to align with the current window.

        Returns DataFrame with columns: hour_ept, forecast_mw
        """
        fcst_start = start_dt - timedelta(hours=24)
        fcst_end   = end_dt   - timedelta(hours=24)
        date_range = f"{_fmt_ept(fcst_start)} to {_fmt_ept(fcst_end)}"
        load_area  = ZONE_LOAD_AREA.get(zone, "PJM RTO")

        for area in (load_area, "PJM RTO"):
            params: dict[str, Any] = {
                "startRow":               1,
                "rowCount":               self._rows,
                "area":                   area,
                "datetime_beginning_ept": date_range,
                "sort":                   "datetime_beginning_ept",
                "order":                  1,
            }
            try:
                items = self._pjm_get_all_pages(INST_LOAD_ENDPOINT, params)
            except Exception as exc:
                logger.warning("PJM forecast (persistence, area={}): {}", area, exc)
                items = []

            if items:
                df = self._parse_load(items, ["instantaneous_load", "mw", "load_mw"])
                if not df.empty:
                    df["hour_ept"] = df["ts_ept"].dt.floor("h")
                    hourly = (
                        df.groupby("hour_ept", as_index=False)
                          .agg(forecast_mw=("load_val", "mean"))
                    )
                    # Shift yesterday's hours forward 24h to match current window
                    hourly["hour_ept"]   = hourly["hour_ept"] + timedelta(hours=24)
                    hourly["forecast_mw"] = hourly["forecast_mw"].round(1)
                    logger.info(
                        "PJM forecast (persistence): {} hourly rows (area={}).",
                        len(hourly), area,
                    )
                    return hourly

        logger.warning("PJM persistence forecast: no data for zone '{}' or RTO.", zone)
        return pd.DataFrame()

    @staticmethod
    def _parse_load(items: list[dict], mw_candidates: list[str]) -> pd.DataFrame:
        """
        Parse raw PJM load items into a normalised DataFrame.

        Tries each key in mw_candidates in order for the MW value.
        Returns DataFrame with columns: ts_ept, load_val
        """
        if not items:
            return pd.DataFrame()

        df = pd.DataFrame(items)
        df.columns = [c.lower().strip() for c in df.columns]

        # Resolve timestamp; PJM EPT strings have no tz-offset suffix
        if "datetime_beginning_ept" in df.columns:
            df["ts_ept"] = (
                pd.to_datetime(df["datetime_beginning_ept"])
                  .dt.tz_localize(PJM_TIMEZONE, ambiguous="infer", nonexistent="shift_forward")
            )
        elif "datetime_beginning_utc" in df.columns:
            df["ts_ept"] = (
                pd.to_datetime(df["datetime_beginning_utc"], utc=True)
                  .dt.tz_convert(PJM_TIMEZONE)
            )
        else:
            logger.debug("_parse_load: no timestamp column found in items.")
            return pd.DataFrame()

        # Resolve MW value
        for mw_col in mw_candidates:
            if mw_col in df.columns:
                df["load_val"] = pd.to_numeric(df[mw_col], errors="coerce").fillna(0.0)
                break
        else:
            logger.debug("_parse_load: none of {} found in columns: {}", mw_candidates, list(df.columns))
            return pd.DataFrame()

        return df[["ts_ept", "load_val"]].dropna(subset=["ts_ept"])

    # ------------------------------------------------------------------
    # Join & build
    # ------------------------------------------------------------------

    def _build_records(
        self,
        zone: str,
        station_id: str,
        obs_df: pd.DataFrame,
        actual_df: pd.DataFrame,
        forecast_df: pd.DataFrame,
    ) -> list[WeatherHour]:
        """
        Left-join weather observations with load data on hour_ept.

        Missing load values default to 0.0; load_delta_pct is only
        meaningful when both actual and forecast are non-zero.
        """
        if obs_df.empty:
            logger.warning("Weather: no temperature observations — cannot build records.")
            return []

        merged = obs_df.copy()

        # Merge actual load
        if not actual_df.empty:
            merged = merged.merge(actual_df[["hour_ept", "actual_mw"]], on="hour_ept", how="left")
        else:
            merged["actual_mw"] = 0.0

        # Merge forecast load
        if not forecast_df.empty:
            merged = merged.merge(forecast_df[["hour_ept", "forecast_mw"]], on="hour_ept", how="left")
        else:
            merged["forecast_mw"] = 0.0

        merged["actual_mw"]   = merged["actual_mw"].fillna(0.0)
        merged["forecast_mw"] = merged["forecast_mw"].fillna(0.0)

        records: list[WeatherHour] = []
        for _, row in merged.iterrows():
            temp_f   = float(row["temp_f"])
            temp_c   = float(row["temp_c"])
            actual   = float(row["actual_mw"])
            forecast = float(row["forecast_mw"])

            if forecast > 0:
                delta_pct = round((actual - forecast) / forecast * 100, 2)
            else:
                delta_pct = 0.0

            if temp_f > HEAT_STRESS_F:
                alert = "Heat Stress"
            elif temp_f < COLD_SNAP_F:
                alert = "Cold Snap"
            else:
                alert = "Normal"

            ts = row["hour_ept"]
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)

            records.append(WeatherHour(
                timestamp        = ts_str,
                temperature_f    = temp_f,
                temperature_c    = round(temp_c, 2),
                zone             = zone,
                station_id       = station_id,
                load_forecast_mw = round(forecast, 1),
                actual_load_mw   = round(actual, 1),
                load_delta_pct   = delta_pct,
                weather_alert    = alert,
            ))

        return records

    @staticmethod
    def _build_result(
        zone: str,
        station_id: str,
        city: str,
        records: list[WeatherHour],
        start_dt: datetime,
        end_dt: datetime,
    ) -> WeatherResult:
        if not records:
            return WeatherResult(
                zone=zone, station_id=station_id, station_city=city,
                records=[], avg_temp_f=0.0, max_temp_f=0.0, min_temp_f=0.0,
                heat_hours=0, cold_hours=0, total_hours=0,
                window_start=start_dt.isoformat(), window_end=end_dt.isoformat(),
            )

        temps = [r.temperature_f for r in records]
        return WeatherResult(
            zone         = zone,
            station_id   = station_id,
            station_city = city,
            records      = records,
            avg_temp_f   = round(sum(temps) / len(temps), 2),
            max_temp_f   = round(max(temps), 2),
            min_temp_f   = round(min(temps), 2),
            heat_hours   = sum(1 for r in records if r.weather_alert == "Heat Stress"),
            cold_hours   = sum(1 for r in records if r.weather_alert == "Cold Snap"),
            total_hours  = len(records),
            window_start = start_dt.isoformat(),
            window_end   = end_dt.isoformat(),
        )

    # ------------------------------------------------------------------
    # PJM HTTP helpers  (mirrors data/lmp.py pattern)
    # ------------------------------------------------------------------

    def _get_pjm_key(self) -> str:
        if not self._pjm_key:
            try:
                resp = requests.get(SETTINGS_URL, timeout=self._timeout)
                resp.raise_for_status()
                self._pjm_key = resp.json().get("subscriptionKey", "")
            except Exception as exc:
                logger.warning("Weather: PJM key fetch failed: {}", exc)
                self._pjm_key = ""
        return self._pjm_key

    def _pjm_headers(self) -> dict[str, str]:
        return {"Ocp-Apim-Subscription-Key": self._get_pjm_key()}

    def _pjm_get(self, url: str, params: dict[str, Any]) -> Any:
        last_exc: Exception = RuntimeError("no attempts")
        for attempt in range(1, self._retries + 1):
            try:
                resp = self._pjm_session.get(
                    url, params=params, headers=self._pjm_headers(), timeout=self._timeout
                )
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.Timeout as exc:
                logger.warning("PJM timeout (attempt {}): {}", attempt, exc)
                last_exc = exc
            except requests.exceptions.HTTPError as exc:
                code = exc.response.status_code if exc.response is not None else "?"
                if exc.response is not None and 400 <= exc.response.status_code < 500:
                    raise
                logger.warning("PJM server error {} (attempt {})", code, attempt)
                last_exc = exc
            except Exception as exc:
                logger.warning("PJM request error (attempt {}): {}", attempt, exc)
                last_exc = exc
            if attempt < self._retries:
                time.sleep(RETRY_BACKOFF * attempt)
        raise last_exc

    def _pjm_get_all_pages(self, url: str, params: dict[str, Any]) -> list[dict]:
        all_items: list[dict] = []
        current_url: Optional[str] = url
        current_params: Optional[dict] = params
        while current_url:
            body = self._pjm_get(current_url, current_params or {})
            all_items.extend(body.get("items", []))
            next_href = next(
                (lnk["href"] for lnk in body.get("links", []) if lnk.get("rel") == "next"),
                None,
            )
            current_url    = next_href
            current_params = None
        return all_items


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fmt_ept(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=PJM_TIMEZONE)
    return dt.astimezone(PJM_TIMEZONE).strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------


def fetch_weather(zone: str = "PJM-RTO", window_hours: int = 24) -> WeatherResult:
    """Fetch weather + load intelligence for the given PJM zone."""
    return WeatherClient().get_weather(zone=zone, window_hours=window_hours)


# ---------------------------------------------------------------------------
# Smoke test  (python -m data.weather)
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import sys

    logger.remove()
    logger.add(sys.stderr, level="INFO")

    logger.info("=== GridAlpha — Weather Intelligence Smoke Test ===")
    client = WeatherClient()

    # Test 1: Philadelphia-area zone (BGE)
    logger.info("Test 1: BGE zone → Philadelphia station (PAX/96/70)…")
    result_bge = client.get_weather(zone="BGE", window_hours=24)

    if not result_bge.records:
        logger.error("Test 1 FAILED — no records returned.")
        sys.exit(1)

    logger.success("Test 1 PASSED — {} hours | station={} | avg {:.1f}°F",
                   result_bge.total_hours, result_bge.station_id, result_bge.avg_temp_f)

    print(f"\nBGE  ({result_bge.station_id} — {result_bge.station_city})")
    print(f"{'Timestamp':<22} {'Temp F':>7} {'Temp C':>7} {'Actual MW':>11} "
          f"{'Fcst MW':>9} {'Delta%':>8}  {'Alert'}")
    print("-" * 82)
    for r in result_bge.records:
        flag = f" *** {r.weather_alert} ***" if r.weather_alert != "Normal" else ""
        print(
            f"{r.timestamp:<22} "
            f"{r.temperature_f:>6.1f}F "
            f"{r.temperature_c:>6.1f}C "
            f"{r.actual_load_mw:>10,.0f} "
            f"{r.load_forecast_mw:>8,.0f} "
            f"{r.load_delta_pct:>7.1f}%  "
            f"{r.weather_alert}{flag}"
        )

    print(f"\nSummary:")
    print(f"  Station        : {result_bge.station_id} ({result_bge.station_city})")
    print(f"  Avg temp       : {result_bge.avg_temp_f:.1f}°F")
    print(f"  Max temp       : {result_bge.max_temp_f:.1f}°F")
    print(f"  Min temp       : {result_bge.min_temp_f:.1f}°F")
    print(f"  Heat stress hrs: {result_bge.heat_hours}")
    print(f"  Cold snap hrs  : {result_bge.cold_hours}")

    print()

    # Test 2: Midwest zone (COMED)
    logger.info("Test 2: COMED zone → Chicago station (LOT/65/73)…")
    result_comed = client.get_weather(zone="COMED", window_hours=24)
    if result_comed.records:
        logger.success(
            "Test 2 PASSED — {} hours | station={} | {:.1f}°F avg",
            result_comed.total_hours, result_comed.station_id, result_comed.avg_temp_f,
        )
        alerts = [r.weather_alert for r in result_comed.records if r.weather_alert != "Normal"]
        if alerts:
            logger.info("COMED alerts: {}", alerts)
    else:
        logger.warning("Test 2: no records for COMED.")

    # Test 3: Pittsburgh zone (AEP)
    logger.info("Test 3: AEP zone → Pittsburgh station (PBZ/75/65)…")
    result_aep = client.get_weather(zone="AEP", window_hours=24)
    if result_aep.records:
        logger.success(
            "Test 3 PASSED — {} hours | station={} | {:.1f}°F avg",
            result_aep.total_hours, result_aep.station_id, result_aep.avg_temp_f,
        )
    else:
        logger.warning("Test 3: no records for AEP.")

    print()
