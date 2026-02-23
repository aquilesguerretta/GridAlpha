"""
GridAlpha — FastAPI Middleware Server
Acts as an async proxy between the GridAlpha frontend and PJM's Data Miner 2 API.

Run:  uvicorn api:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
import os
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Generic, Optional, TypeVar
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# Constants  (mirrors data/pjm_client.py)
# ---------------------------------------------------------------------------

SETTINGS_URL = "http://dataminer2.pjm.com/config/settings.json"
API_BASE_URL = "https://api.pjm.com/api/v1"
GEN_BY_FUEL_ENDPOINT = f"{API_BASE_URL}/gen_by_fuel"
LMP_ENDPOINT = f"{API_BASE_URL}/rt_unverified_hrl_lmps"

PJM_TIMEZONE = ZoneInfo("America/New_York")
ROWS_PER_PAGE = 100
REQUEST_TIMEOUT = 30.0
RENEWABLE_FUELS = {"Wind", "Solar", "Hydro", "Other Renewables"}

# ---------------------------------------------------------------------------
# Application state — shared httpx client and cached subscription key
# ---------------------------------------------------------------------------

_http_client: Optional[httpx.AsyncClient] = None
_subscription_key: Optional[str] = None
_key_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create a single shared httpx client for the lifetime of the process."""
    global _http_client
    _http_client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
    logger.info("httpx AsyncClient initialised.")
    yield
    await _http_client.aclose()
    logger.info("httpx AsyncClient closed.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="GridAlpha API",
    description=(
        "Async middleware between the GridAlpha dashboard and the "
        "PJM Data Miner 2 REST API. Exposes cleaned, paginated generation data."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Envelope — standard top-level wrapper for all data endpoints
# ---------------------------------------------------------------------------

_T_data    = TypeVar("_T_data")
_T_summary = TypeVar("_T_summary")


class EnvelopeMeta(BaseModel):
    """Metadata block present on every GridAlpha API response."""
    api_version:      str = "1.0"
    is_demo:          bool
    zone:             str   # zone param or "ALL" for multi-zone responses
    start:            str   # window start, EPT ISO string
    end:              str   # window end,   EPT ISO string
    timezone:         str = "America/New_York"
    last_updated_ept: str   # server timestamp when response was built
    units:            str   # primary unit, e.g. "MW", "$/MWh"
    data_quality:     str   # "LIVE" | "DEMO"


class ApiResponse(BaseModel, Generic[_T_data, _T_summary]):
    """Uniform envelope returned by every GridAlpha data endpoint."""
    meta:    EnvelopeMeta
    data:    list[_T_data]
    summary: _T_summary


# ---------------------------------------------------------------------------
# Record models  (per-row shape inside data[])
# ---------------------------------------------------------------------------

class GenerationRecord(BaseModel):
    datetime_beginning_ept: str
    datetime_beginning_utc: str
    fuel_type:    str
    mw:           float
    is_renewable: bool


class LMPRecord(BaseModel):
    zone_name:            str
    lmp_total:            float
    energy_component:     float
    congestion_component: float
    loss_component:       float
    timestamp:            str   # hour-beginning EPT (ISO)
    timestamp_utc:        str   # hour-beginning UTC (ISO)


class BatteryArbitrageRecord(BaseModel):
    zone_name:             str
    charge_hours:          list[str]
    discharge_hours:       list[str]
    charge_price:          float
    discharge_price:       float
    round_trip_efficiency: float
    cycling_cost:          float
    daily_spread_per_mwh:  float
    total_cycling_costs:   float
    net_profit_per_mwh:    float
    is_profitable:         bool
    timestamp:             str
    hours_available:       int
    charge_hours_used:     int
    discharge_hours_used:  int
    hours_gated_out:       int


class SparkSpreadRecord(BaseModel):
    zone_name:      str
    lmp:            float
    gas_cost:       float
    spark_spread:   float
    heat_rate:      float
    gas_price_used: float
    timestamp:      str


class ConvergenceHourRecord(BaseModel):
    hour:       str     # hour-beginning EPT, ISO format
    da_price:   float   # Day-Ahead LMP ($/MWh)
    rt_price:   float   # Real-Time LMP ($/MWh)
    spread:     float   # RT − DA ($/MWh)
    event_flag: str     # "Scarcity" | "Oversupply" | "Normal"


class ResourceGapRecord(BaseModel):
    zone:                  str
    retiring_mw:           float
    total_queue_mw:        float
    adjusted_queue_mw:     float   # after queue_success_rate
    avg_elcc:              float   # capacity-weighted ELCC
    elcc_adjusted_mw:      float   # dependable replacement capacity (MW)
    retirement_deficit_mw: float   # positive = gap; negative = surplus
    reliability_score:     int     # 1–10 (10 = highest risk)
    investment_signal:     str
    key_retirements:       list[str]
    queue_success_rate:    float


class TimelineHour(BaseModel):
    hour:      int   # 0–23 EPT
    fuel_type: str


class MarginalFuelRecord(BaseModel):
    zone:            str
    current_fuel:    str
    is_fossil:       bool
    signal_strength: int   # 0–100; higher = more stable/certain
    market_note:     str
    timeline_24h:    list[TimelineHour]


class WeatherHourRecord(BaseModel):
    """Single hour of weather + load data for a PJM zone."""
    timestamp:        str
    temperature_f:    float
    temperature_c:    float
    zone:             str
    station_id:       str
    load_forecast_mw: float
    actual_load_mw:   float
    load_delta_pct:   float
    weather_alert:    str   # "Heat Stress" | "Cold Snap" | "Normal"


# ---------------------------------------------------------------------------
# Summary models  (aggregated fields inside summary{})
# ---------------------------------------------------------------------------

class GenerationSummary(BaseModel):
    total_rows:       int
    total_mw:         float
    renewable_mw:     float
    renewable_pct:    float
    window_start_ept: str
    window_end_ept:   str


class LMPSummary(BaseModel):
    total_zones:          int
    avg_lmp:              float
    max_lmp:              float
    min_lmp:              float
    max_congestion_zone:  str
    snapshot_hour_ept:    str


class BatteryArbitrageSummary(BaseModel):
    total_zones:           int
    profitable_zones:      int
    cycling_cost:          float
    avg_daily_spread:      float
    avg_net_profit:        float
    best_zone:             str
    best_spread:           float
    worst_zone:            str
    worst_spread:          float
    total_gated_hours:     int
    round_trip_efficiency: float
    window_hours:          int
    n_charge_hours:        int
    n_discharge_hours:     int


class SparkSpreadSummary(BaseModel):
    total_zones:         int
    profitable_zones:    int
    avg_spark_spread:    float
    best_zone:           str
    worst_zone:          str
    gas_cost_per_mwh:    float
    heat_rate:           float
    gas_price_per_mmbtu: float
    snapshot_hour_ept:   str


class ConvergenceSummary(BaseModel):
    zone:             str
    avg_spread:       float
    max_spread:       float
    min_spread:       float
    scarcity_hours:   int
    oversupply_hours: int
    total_hours:      int
    window_start:     str
    window_end:       str
    dominant_signal:  str   # "VIRTUAL_SELLER" | "VIRTUAL_BUYER" | "MIXED"
    market_narrative: str


class ResourceGapSummary(BaseModel):
    total_zones:              int
    critical_zones:           int
    total_deficit_mw:         float
    queue_success_rate:       float
    most_at_risk_zone:        str
    system_reliability_score: int


class MarginalFuelSummary(BaseModel):
    total_zones:          int
    snapshot_hour_ept:    int   # current EPT hour (0–23)
    dominant_fuel:        str
    fossil_zone_count:    int
    renewable_zone_count: int


class WeatherSummary(BaseModel):
    zone:         str
    station_id:   str
    station_city: str
    avg_temp_f:   float
    max_temp_f:   float
    min_temp_f:   float
    heat_hours:   int
    cold_hours:   int
    total_hours:  int
    window_start: str
    window_end:   str


# ---------------------------------------------------------------------------
# Typed envelope aliases — one per data endpoint
# ---------------------------------------------------------------------------

GenerationApiResponse       = ApiResponse[GenerationRecord,       GenerationSummary]
LMPApiResponse              = ApiResponse[LMPRecord,              LMPSummary]
BatteryArbitrageApiResponse = ApiResponse[BatteryArbitrageRecord, BatteryArbitrageSummary]
SparkSpreadApiResponse      = ApiResponse[SparkSpreadRecord,      SparkSpreadSummary]
ConvergenceApiResponse      = ApiResponse[ConvergenceHourRecord,  ConvergenceSummary]
ResourceGapApiResponse      = ApiResponse[ResourceGapRecord,      ResourceGapSummary]
MarginalFuelApiResponse     = ApiResponse[MarginalFuelRecord,     MarginalFuelSummary]
WeatherApiResponse          = ApiResponse[WeatherHourRecord,      WeatherSummary]


# ---------------------------------------------------------------------------
# Meta-only models (health, sync-status — not wrapped in envelope)
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status:         str
    timestamp:      str
    pjm_key_cached: bool


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _fmt_ept(dt: datetime) -> str:
    """Format a datetime as the PJM EPT string 'YYYY-MM-DD HH:MM'."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=PJM_TIMEZONE)
    return dt.astimezone(PJM_TIMEZONE).strftime("%Y-%m-%d %H:%M")


async def _get_subscription_key() -> str:
    """
    Return the cached PJM public subscription key, fetching it if needed.

    The key is fetched once from PJM's own settings endpoint and reused for
    the lifetime of the process.  A lock prevents concurrent duplicate fetches.
    """
    global _subscription_key
    if _subscription_key:
        return _subscription_key

    async with _key_lock:
        if _subscription_key:
            return _subscription_key

        try:
            resp = await _http_client.get(SETTINGS_URL)
            resp.raise_for_status()
            key = resp.json().get("subscriptionKey", "")
            if not key:
                raise ValueError("subscriptionKey missing from settings JSON")
            _subscription_key = key
            logger.info("PJM public subscription key fetched ({} chars).", len(key))
        except Exception as exc:
            logger.error("Failed to fetch PJM subscription key: {}", exc)
            raise HTTPException(
                status_code=502,
                detail=f"Could not obtain PJM subscription key: {exc}",
            ) from exc

    return _subscription_key


def _pjm_headers(key: str) -> dict[str, str]:
    return {"Ocp-Apim-Subscription-Key": key}


async def _pjm_get(url: str, params: dict[str, Any]) -> dict:
    """Single authenticated GET to api.pjm.com. Raises HTTPException on error."""
    key = await _get_subscription_key()
    try:
        resp = await _http_client.get(url, params=params, headers=_pjm_headers(key))
        resp.raise_for_status()
        return resp.json()
    except httpx.TimeoutException as exc:
        logger.warning("PJM request timed out: {}", exc)
        raise HTTPException(status_code=504, detail="PJM API timed out.") from exc
    except httpx.HTTPStatusError as exc:
        logger.error("PJM returned {}: {}", exc.response.status_code, exc)
        raise HTTPException(
            status_code=502,
            detail=f"PJM API error {exc.response.status_code}.",
        ) from exc


async def _fetch_all_pages(url: str, params: dict[str, Any]) -> list[dict]:
    """
    Async paginator for PJM endpoints.

    Follows the 'next' link in each response's 'links' list until all rows
    are retrieved.
    """
    all_items: list[dict] = []
    current_url: Optional[str] = url
    current_params: Optional[dict] = params

    while current_url:
        body = await _pjm_get(current_url, current_params or {})
        items = body.get("items", [])
        all_items.extend(items)

        total = body.get("totalRows", len(all_items))
        logger.debug("Paginating gen_by_fuel: {}/{} rows", len(all_items), total)

        next_href = next(
            (lnk["href"] for lnk in body.get("links", []) if lnk.get("rel") == "next"),
            None,
        )
        current_url = next_href
        current_params = None  # next URL already encodes all params

    return all_items


def _normalize_items(items: list[dict]) -> list[GenerationRecord]:
    """Convert raw PJM item dicts into typed GenerationRecord objects."""
    records: list[GenerationRecord] = []
    for item in items:
        raw_ept = item.get("datetime_beginning_ept", "")
        raw_utc = item.get("datetime_beginning_utc", "")
        fuel = item.get("fuel_type", "Unknown")
        mw = float(item.get("mw") or 0.0)

        # Normalise ISO strings — PJM omits timezone info; add it explicitly
        try:
            dt_ept = datetime.fromisoformat(str(raw_ept).replace("Z", ""))
            ept_str = dt_ept.strftime("%Y-%m-%dT%H:%M:%S")
        except ValueError:
            ept_str = str(raw_ept)

        try:
            dt_utc = datetime.fromisoformat(str(raw_utc).replace("Z", ""))
            utc_str = dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            utc_str = str(raw_utc)

        records.append(
            GenerationRecord(
                datetime_beginning_ept=ept_str,
                datetime_beginning_utc=utc_str,
                fuel_type=fuel,
                mw=mw,
                is_renewable=fuel in RENEWABLE_FUELS,
            )
        )
    return records


def _make_meta(
    *,
    is_demo: bool,
    zone: str,
    start: str,
    end: str,
    units: str,
    data_quality: str,
) -> EnvelopeMeta:
    """Build the standard EnvelopeMeta for a response."""
    return EnvelopeMeta(
        is_demo=is_demo,
        zone=zone,
        start=start,
        end=end,
        units=units,
        data_quality=data_quality,
        last_updated_ept=datetime.now(tz=PJM_TIMEZONE).isoformat(),
    )


def _build_summary(
    records: list[GenerationRecord],
    window_start: datetime,
    window_end: datetime,
) -> GenerationSummary:
    total_mw     = sum(r.mw for r in records)
    renewable_mw = sum(r.mw for r in records if r.is_renewable)
    renewable_pct = (renewable_mw / total_mw * 100) if total_mw > 0 else 0.0
    return GenerationSummary(
        total_rows=len(records),
        total_mw=round(total_mw, 2),
        renewable_mw=round(renewable_mw, 2),
        renewable_pct=round(renewable_pct, 2),
        window_start_ept=_fmt_ept(window_start),
        window_end_ept=_fmt_ept(window_end),
    )


def _normalize_lmp_items(items: list[dict]) -> list[LMPRecord]:
    """
    Convert raw rt_unverified_hrl_lmps items into typed LMPRecord objects.

    Energy component is derived: energy = total − congestion − loss.
    This identity holds by the LMP decomposition definition.
    """
    records: list[LMPRecord] = []
    for item in items:
        total = float(item.get("total_lmp_rt") or 0.0)
        cong  = float(item.get("congestion_price_rt") or 0.0)
        loss  = float(item.get("marginal_loss_price_rt") or 0.0)
        energy = round(total - cong - loss, 6)

        raw_ept = item.get("datetime_beginning_ept", "")
        raw_utc = item.get("datetime_beginning_utc", "")

        try:
            ept_str = datetime.fromisoformat(str(raw_ept).replace("Z", "")).strftime("%Y-%m-%dT%H:%M:%S")
        except ValueError:
            ept_str = str(raw_ept)

        try:
            utc_str = datetime.fromisoformat(str(raw_utc).replace("Z", "")).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            utc_str = str(raw_utc)

        records.append(LMPRecord(
            zone_name=item.get("pnode_name", "UNKNOWN"),
            lmp_total=round(total, 6),
            energy_component=energy,
            congestion_component=round(cong, 6),
            loss_component=round(loss, 6),
            timestamp=ept_str,
            timestamp_utc=utc_str,
        ))
    return records


def _build_lmp_summary(records: list[LMPRecord]) -> LMPSummary:
    if not records:
        return LMPSummary(
            total_zones=0, avg_lmp=0.0, max_lmp=0.0, min_lmp=0.0,
            max_congestion_zone="N/A", snapshot_hour_ept="N/A",
        )
    totals        = [r.lmp_total for r in records]
    max_cong_rec  = max(records, key=lambda r: r.congestion_component)
    snapshot_hour = max(r.timestamp for r in records)
    return LMPSummary(
        total_zones=len(records),
        avg_lmp=round(sum(totals) / len(totals), 4),
        max_lmp=round(max(totals), 4),
        min_lmp=round(min(totals), 4),
        max_congestion_zone=max_cong_rec.zone_name,
        snapshot_hour_ept=snapshot_hour,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

_DEMO_QUERY = Query(
    default=False,
    description=(
        "Return the deterministic Demo Mode snapshot instead of hitting "
        "live PJM or NOAA APIs. Useful for demos, offline development, and "
        "API-down scenarios. Returns the same values every time."
    ),
)


@app.get("/health", response_model=HealthResponse, tags=["Meta"])
async def health():
    """Returns service health status and whether the PJM key is cached."""
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(tz=PJM_TIMEZONE).isoformat(),
        pjm_key_cached=bool(_subscription_key),
    )


@app.get("/generation", response_model=GenerationApiResponse, tags=["Generation"])
async def get_generation(
    hours: int = Query(
        default=24,
        ge=1,
        le=168,
        description="Rolling window in hours (1–168). Default 24h for full daily view.",
    ),
    start: Optional[str] = Query(
        default=None,
        description="Window start in Eastern Time, ISO format: 'YYYY-MM-DDTHH:MM' or 'YYYY-MM-DD HH:MM'.",
    ),
    end: Optional[str] = Query(
        default=None,
        description="Window end in Eastern Time. Defaults to now.",
    ),
    snapshot: bool = Query(
        default=False,
        description="When true, return only the most recent hour's data.",
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Return PJM generation by fuel type for a requested time window.

    - **hours**: convenience shorthand (default 24h rolling)
    - **start / end**: explicit ISO datetime strings in Eastern Time
    - **snapshot**: set to true to get only the latest available hour
    - **demo**: return Demo Mode snapshot (deterministic, no live API call)

    The response includes per-record data plus aggregate summary fields
    (total MW, renewable MW, renewable %).
    """
    if demo:
        logger.info("GET /generation [DEMO]")
        return _demo_section("generation")

    # Resolve time window
    now_et = datetime.now(tz=PJM_TIMEZONE)

    try:
        end_dt = (
            datetime.fromisoformat(end.replace(" ", "T")).replace(tzinfo=PJM_TIMEZONE)
            if end
            else now_et
        )
        start_dt = (
            datetime.fromisoformat(start.replace(" ", "T")).replace(tzinfo=PJM_TIMEZONE)
            if start
            else end_dt - timedelta(hours=hours if not snapshot else 2)
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid datetime format: {exc}. Use 'YYYY-MM-DDTHH:MM'.",
        ) from exc

    if start_dt >= end_dt:
        raise HTTPException(
            status_code=422, detail="'start' must be earlier than 'end'."
        )

    date_range = f"{_fmt_ept(start_dt)} to {_fmt_ept(end_dt)}"
    logger.info("GET /generation | window={} | snapshot={}", date_range, snapshot)

    params: dict[str, Any] = {
        "startRow": 1,
        "rowCount": ROWS_PER_PAGE,
        "datetime_beginning_ept": date_range,
        "fields": "datetime_beginning_ept,datetime_beginning_utc,fuel_type,mw",
        "sort": "datetime_beginning_utc",
        "order": 1,
    }

    items = await _fetch_all_pages(GEN_BY_FUEL_ENDPOINT, params)

    _meta_args = dict(
        is_demo=False, zone="ALL",
        start=_fmt_ept(start_dt), end=_fmt_ept(end_dt),
        units="MW", data_quality="LIVE",
    )

    if not items:
        logger.warning("PJM returned 0 items for window: {}", date_range)
        return GenerationApiResponse(
            meta=_make_meta(**_meta_args),
            data=[],
            summary=GenerationSummary(
                total_rows=0, total_mw=0.0, renewable_mw=0.0, renewable_pct=0.0,
                window_start_ept=_fmt_ept(start_dt), window_end_ept=_fmt_ept(end_dt),
            ),
        )

    records = _normalize_items(items)

    # Snapshot: keep only the most recent hour
    if snapshot and records:
        latest_ept = max(r.datetime_beginning_ept for r in records)
        records = [r for r in records if r.datetime_beginning_ept == latest_ept]
        logger.info("Snapshot filtered to {} ({} fuel types)", latest_ept, len(records))

    return GenerationApiResponse(
        meta=_make_meta(**_meta_args),
        data=records,
        summary=_build_summary(records, start_dt, end_dt),
    )


@app.get("/lmp", response_model=LMPApiResponse, tags=["LMP"])
async def get_lmp(
    hours: int = Query(
        default=2,
        ge=1,
        le=72,
        description="Rolling window in hours (1–72). Ignored when start/end are provided.",
    ),
    start: Optional[str] = Query(
        default=None,
        description="Window start in Eastern Time: 'YYYY-MM-DDTHH:MM'.",
    ),
    end: Optional[str] = Query(
        default=None,
        description="Window end in Eastern Time. Defaults to now.",
    ),
    snapshot: bool = Query(
        default=True,
        description=(
            "When true (default), return only the most recent completed hour. "
            "Set to false to return all hours in the window."
        ),
    ),
    zone: Optional[str] = Query(
        default=None,
        description="Filter to a single zone name (e.g. 'BGE', 'COMED'). Case-insensitive.",
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Return real-time LMP data by PJM transmission zone.

    Source: **rt_unverified_hrl_lmps** — updated every hour, covers all 22
    PJM transmission zones (AECO, AEP, APS, ATSI, BGE, COMED, DAY, DEOK,
    DOM, DPL, DUQ, EKPC, JCPL, METED, OVEC, PECO, PENELEC, PEPCO, PJM-RTO,
    PPL, PSEG, RECO).

    Each record contains the full LMP decomposition:

        LMP  =  energy  +  congestion  +  loss

    The **energy** component is derived as `total − congestion − loss`
    (the unverified feed does not publish system energy price separately;
    this identity always holds by LMP definition).

    Response summary fields include avg/max/min LMP across zones and the
    zone with the highest congestion price for the snapshot hour.
    """
    if demo:
        logger.info("GET /lmp [DEMO]")
        return _demo_section("lmp")

    now_et = datetime.now(tz=PJM_TIMEZONE)

    try:
        end_dt = (
            datetime.fromisoformat(end.replace(" ", "T")).replace(tzinfo=PJM_TIMEZONE)
            if end else now_et
        )
        start_dt = (
            datetime.fromisoformat(start.replace(" ", "T")).replace(tzinfo=PJM_TIMEZONE)
            if start else end_dt - timedelta(hours=hours)
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid datetime format: {exc}. Use 'YYYY-MM-DDTHH:MM'.",
        ) from exc

    if start_dt >= end_dt:
        raise HTTPException(status_code=422, detail="'start' must be earlier than 'end'.")

    date_range = f"{_fmt_ept(start_dt)} to {_fmt_ept(end_dt)}"
    logger.info("GET /lmp | window={} | snapshot={} | zone={}", date_range, snapshot, zone)

    params: dict[str, Any] = {
        "startRow": 1,
        "rowCount": ROWS_PER_PAGE,
        "datetime_beginning_ept": date_range,
        "type": "ZONE",
        "fields": (
            "datetime_beginning_ept,datetime_beginning_utc,"
            "pnode_name,type,total_lmp_rt,congestion_price_rt,marginal_loss_price_rt"
        ),
        "sort": "datetime_beginning_ept",
        "order": 1,
    }

    items = await _fetch_all_pages(LMP_ENDPOINT, params)

    _lmp_meta_args = dict(
        is_demo=False, zone=zone or "ALL",
        start=_fmt_ept(start_dt), end=_fmt_ept(end_dt),
        units="$/MWh", data_quality="LIVE",
    )

    if not items:
        logger.warning("LMP: PJM returned 0 items for window: {}", date_range)
        return LMPApiResponse(
            meta=_make_meta(**_lmp_meta_args),
            data=[],
            summary=LMPSummary(
                total_zones=0, avg_lmp=0.0, max_lmp=0.0, min_lmp=0.0,
                max_congestion_zone="N/A", snapshot_hour_ept="N/A",
            ),
        )

    records = _normalize_lmp_items(items)

    # Snapshot: keep only the latest hour
    if snapshot and records:
        latest_ts = max(r.timestamp for r in records)
        records = [r for r in records if r.timestamp == latest_ts]
        logger.info("LMP snapshot: {} ({} zones)", latest_ts, len(records))

    # Optional zone filter
    if zone:
        zone_upper = zone.upper()
        records = [r for r in records if r.zone_name.upper() == zone_upper]
        if not records:
            raise HTTPException(
                status_code=404,
                detail=f"Zone '{zone}' not found. Check spelling (e.g. BGE, COMED, DOM).",
            )

    sorted_records = sorted(records, key=lambda r: r.zone_name)
    return LMPApiResponse(
        meta=_make_meta(**_lmp_meta_args),
        data=sorted_records,
        summary=_build_lmp_summary(sorted_records),
    )


@app.get("/spark-spread", response_model=SparkSpreadApiResponse, tags=["Spark Spread"])
async def get_spark_spread(
    heat_rate: float = Query(
        default=7.0,
        ge=5.0,
        le=15.0,
        description=(
            "Plant heat rate in MMBtu/MWh (5.0–15.0). "
            "7.0 = efficient CCGT (default). "
            "9.0–10.5 = simple-cycle peaker."
        ),
    ),
    gas_price: float = Query(
        default=4.00,
        ge=0.50,
        le=20.00,
        description=(
            "Henry Hub natural gas price in $/MMBtu ($0.50–$20.00). "
            "Defaults to 4.00 (approximate Feb 2026 spot). "
            "Override to model different price scenarios."
        ),
    ),
    zone: Optional[str] = Query(
        default=None,
        description="Filter to a single zone (e.g. 'BGE', 'COMED'). Case-insensitive.",
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Return spark spread for all PJM transmission zones.

    **Spark Spread** measures the gross profitability of a gas-fired power
    plant — the margin between the electricity price it earns and the fuel
    cost it pays:

        spark_spread  =  LMP  −  (gas_price × heat_rate)

    A **positive** spread means the plant covers its variable fuel costs.
    A **negative** spread means generation is uneconomic at current prices
    (plant may still run due to capacity obligations or must-run status).

    | Parameter | Default | Typical range |
    |-----------|---------|---------------|
    | `heat_rate` | 7.0 MMBtu/MWh | 6.5–8.0 (CCGT), 9–11 (peaker) |
    | `gas_price` | $4.00/MMBtu | EIA Feb 2026 spot |

    LMP data is pulled live from PJM's `rt_unverified_hrl_lmps` feed
    (most recent completed hour, all 22 transmission zones).
    """
    if demo:
        logger.info("GET /spark-spread [DEMO]")
        return _demo_section("spark_spread")

    if not (5.0 <= heat_rate <= 15.0):
        raise HTTPException(
            status_code=422,
            detail="Heat rate must be between 5.0 and 15.0 MMBtu/MWh",
        )
    if not (0.50 <= gas_price <= 20.00):
        raise HTTPException(
            status_code=422,
            detail="Gas price must be between $0.50 and $20.00/MMBtu",
        )

    from data.spark_spread import (
        SparkSpreadClient,
        DEFAULT_HEAT_RATE,
        HENRY_HUB_PRICE_PER_MMBTU,
    )

    logger.info(
        "GET /spark-spread | heat_rate={} MMBtu/MWh | gas=${}/MMBtu | zone={}",
        heat_rate, gas_price, zone,
    )

    # SparkSpreadClient is sync (uses requests internally) — run off the event loop
    client = SparkSpreadClient(heat_rate=heat_rate, gas_price=gas_price)
    df = await asyncio.to_thread(client.get_snapshot)

    _ss_now = _fmt_ept(datetime.now(tz=PJM_TIMEZONE))
    _ss_meta_args = dict(
        is_demo=False, zone=zone or "ALL",
        start=_ss_now, end=_ss_now,
        units="$/MWh", data_quality="LIVE",
    )

    if df.empty:
        return SparkSpreadApiResponse(
            meta=_make_meta(**_ss_meta_args),
            data=[],
            summary=SparkSpreadSummary(
                total_zones=0, profitable_zones=0, avg_spark_spread=0.0,
                best_zone="N/A", worst_zone="N/A",
                gas_cost_per_mwh=round(gas_price * heat_rate, 4),
                heat_rate=heat_rate, gas_price_per_mmbtu=gas_price,
                snapshot_hour_ept="N/A",
            ),
        )

    # Optional zone filter
    if zone:
        filtered = df[df["zone_name"].str.upper() == zone.upper()]
        if filtered.empty:
            raise HTTPException(
                status_code=404,
                detail=f"Zone '{zone}' not found. Valid examples: BGE, COMED, DOM, PJM-RTO.",
            )
        df = filtered

    records = [
        SparkSpreadRecord(
            zone_name=row["zone_name"],
            lmp=row["lmp"],
            gas_cost=row["gas_cost"],
            spark_spread=row["spark_spread"],
            heat_rate=row["heat_rate"],
            gas_price_used=row["gas_price_used"],
            timestamp=str(row["timestamp"]),
        )
        for _, row in df.iterrows()
    ]

    profitable  = [r for r in records if r.spark_spread > 0]
    best        = records[0] if records else None
    worst       = records[-1] if records else None
    snap_hour   = records[0].timestamp if records else "N/A"

    return SparkSpreadApiResponse(
        meta=_make_meta(**{**_ss_meta_args, "start": snap_hour, "end": snap_hour}),
        data=records,
        summary=SparkSpreadSummary(
            total_zones=len(records),
            profitable_zones=len(profitable),
            avg_spark_spread=round(df["spark_spread"].mean(), 4),
            best_zone=best.zone_name if best else "N/A",
            worst_zone=worst.zone_name if worst else "N/A",
            gas_cost_per_mwh=round(gas_price * heat_rate, 4),
            heat_rate=heat_rate,
            gas_price_per_mmbtu=gas_price,
            snapshot_hour_ept=snap_hour,
        ),
    )


@app.get("/battery-arbitrage", response_model=BatteryArbitrageApiResponse, tags=["Battery Arbitrage"])
async def get_battery_arbitrage(
    window_hours: int = Query(
        default=24,
        ge=4,
        le=168,
        description="LMP history window in hours (min 4, max 168). Determines the pool of hours to select charge/discharge from.",
    ),
    efficiency: float = Query(
        default=0.87,
        ge=0.50,
        le=0.99,
        description="Round-trip efficiency (0.50–0.99). Default 0.87 = 87% for Li-ion BESS.",
    ),
    n_charge_hours: int = Query(
        default=4,
        ge=1,
        le=12,
        description="Number of cheapest hours to average for the charge price.",
    ),
    n_discharge_hours: int = Query(
        default=4,
        ge=1,
        le=12,
        description="Number of most expensive hours to average for the discharge price.",
    ),
    cycling_cost: float = Query(
        default=20.0,
        ge=0,
        description=(
            "Variable O&M (cycling cost) per MWh dispatched in $/MWh (default $20). "
            "A discharge hour is only included if its net margin after efficiency "
            "and cycling cost is positive: discharge_lmp × η − charge_price > cycling_cost."
        ),
    ),
    zone: Optional[str] = Query(
        default=None,
        description="Filter to a single zone (e.g. 'BGE', 'RECO'). Case-insensitive.",
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Return battery storage arbitrage analysis for all PJM transmission zones.

    **Strategy**: charge during the N cheapest hours; gate each candidate
    discharge hour through a cycling-cost hurdle; discharge only during the
    hours that pass the gate.

    **Formula**:

        charge_price       = mean(N cheapest LMP hours)                  $/MWh
        discharge_price    = mean(qualifying discharge hours) × η        $/MWh
        daily_spread       = discharge_price − charge_price              $/MWh  (gross)
        total_cycling_costs= cycling_cost × n_actual_dispatch_events     $
        net_profit         = daily_spread − cycling_cost                 $/MWh

    **Dispatch gate** (per discharge candidate hour):

        discharge_lmp × η  −  charge_price  >  cycling_cost

    Hours that fail the gate are idle — no cycle is registered for them.

    | Default config | Value |
    |---|---|
    | Efficiency | 87% (Li-ion BESS industry standard) |
    | Charge hours | 4 cheapest |
    | Discharge hours | up to 4 most expensive that clear the gate |
    | Cycling cost | $20/MWh V-O&M |
    | LMP window | 24h rolling |

    LMP data is sourced live from PJM's `rt_unverified_hrl_lmps` feed.
    """
    if demo:
        logger.info("GET /battery-arbitrage [DEMO]")
        return _demo_section("battery_arbitrage")

    if not (0.50 <= efficiency <= 0.99):
        raise HTTPException(
            status_code=422,
            detail="Efficiency must be between 50% and 99%",
        )
    if n_charge_hours + n_discharge_hours > 12:
        raise HTTPException(
            status_code=422,
            detail="Total charge and discharge hours cannot exceed 12",
        )

    from data.battery_arbitrage import BatteryArbitrageClient

    logger.info(
        "GET /battery-arbitrage | window={}h | η={:.0%} | charge={}h | discharge={}h | cycling=${}/MWh | zone={}",
        window_hours, efficiency, n_charge_hours, n_discharge_hours, cycling_cost, zone,
    )

    client = BatteryArbitrageClient(
        efficiency=efficiency,
        n_charge_hours=n_charge_hours,
        n_discharge_hours=n_discharge_hours,
        cycling_cost=cycling_cost,
    )
    results = await asyncio.to_thread(client.get_arbitrage, window_hours)

    _ba_now    = datetime.now(tz=PJM_TIMEZONE)
    _ba_start  = _fmt_ept(_ba_now - timedelta(hours=window_hours))
    _ba_end    = _fmt_ept(_ba_now)
    _ba_meta_args = dict(
        is_demo=False, zone=zone or "ALL",
        start=_ba_start, end=_ba_end,
        units="$/MWh", data_quality="LIVE",
    )

    if not results:
        return BatteryArbitrageApiResponse(
            meta=_make_meta(**_ba_meta_args),
            data=[],
            summary=BatteryArbitrageSummary(
                total_zones=0, profitable_zones=0, cycling_cost=cycling_cost,
                avg_daily_spread=0.0, avg_net_profit=0.0,
                best_zone="N/A", best_spread=0.0,
                worst_zone="N/A", worst_spread=0.0,
                total_gated_hours=0, round_trip_efficiency=efficiency,
                window_hours=window_hours,
                n_charge_hours=n_charge_hours, n_discharge_hours=n_discharge_hours,
            ),
        )

    # Optional zone filter
    if zone:
        results = [r for r in results if r.zone_name.upper() == zone.upper()]
        if not results:
            raise HTTPException(
                status_code=404,
                detail=f"Zone '{zone}' not found. Valid examples: BGE, COMED, RECO, PJM-RTO.",
            )

    records = [
        BatteryArbitrageRecord(
            zone_name=r.zone_name,
            charge_hours=r.charge_hours,
            discharge_hours=r.discharge_hours,
            charge_price=r.charge_price,
            discharge_price=r.discharge_price,
            round_trip_efficiency=r.round_trip_efficiency,
            cycling_cost=r.cycling_cost,
            daily_spread_per_mwh=r.daily_spread_per_mwh,
            total_cycling_costs=r.total_cycling_costs,
            net_profit_per_mwh=r.net_profit_per_mwh,
            is_profitable=r.is_profitable,
            timestamp=r.timestamp,
            hours_available=r.hours_available,
            charge_hours_used=r.charge_hours_used,
            discharge_hours_used=r.discharge_hours_used,
            hours_gated_out=r.hours_gated_out,
        )
        for r in results
    ]

    profitable = [r for r in records if r.is_profitable]
    spreads    = [r.daily_spread_per_mwh for r in records]
    nets       = [r.net_profit_per_mwh for r in records]
    gated      = sum(r.hours_gated_out for r in records)

    return BatteryArbitrageApiResponse(
        meta=_make_meta(**_ba_meta_args),
        data=records,
        summary=BatteryArbitrageSummary(
            total_zones=len(records),
            profitable_zones=len(profitable),
            cycling_cost=cycling_cost,
            avg_daily_spread=round(sum(spreads) / len(spreads), 4),
            avg_net_profit=round(sum(nets) / len(nets), 4),
            best_zone=records[0].zone_name,
            best_spread=records[0].daily_spread_per_mwh,
            worst_zone=records[-1].zone_name,
            worst_spread=records[-1].daily_spread_per_mwh,
            total_gated_hours=gated,
            round_trip_efficiency=efficiency,
            window_hours=window_hours,
            n_charge_hours=n_charge_hours,
            n_discharge_hours=n_discharge_hours,
        ),
    )


@app.get("/api/marginal-fuel", response_model=MarginalFuelApiResponse, tags=["Marginal Fuel"])
async def get_marginal_fuel(
    zone: Optional[str] = Query(
        default=None,
        description=(
            "Filter to a single PJM zone (e.g. 'COMED', 'DOM', 'PENELEC'). "
            "Case-insensitive.  Omit to return all 22 zones."
        ),
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Return simulated marginal fuel intelligence for PJM transmission zones.

    The **marginal fuel** is the generating unit type that would be dispatched
    (or curtailed) next if load changed by 1 MWh — it is the price-setter in
    the real-time LMP calculation.

    Because PJM does not publish a direct marginal-fuel feed, this endpoint
    generates a statistically realistic simulation based on:

    - **Hour-of-day dispatch logic** — off-peak hours favour low-cost baseload
      (nuclear, coal, wind); peak hours dispatch gas combined-cycle and peakers.
    - **Zone-specific fuel-mix bias** — COMED skews toward wind+nuclear;
      AEP/DOM/EKPC skew toward Appalachian coal; NJ/SE-PA zones skew gas.
    - **Day-level deterministic seeding** — stable within a calendar day,
      changes realistically day to day.
    - **Fuel persistence** — consecutive-hour weighting avoids unrealistic
      hour-to-hour oscillation.

    | Field | Description |
    |---|---|
    | `current_fuel` | Fuel type setting the margin right now |
    | `is_fossil` | True for Gas-CC, Gas-CT, Coal, Oil |
    | `signal_strength` | 0–100 stability score (higher = more certain) |
    | `market_note` | One-sentence market explanation |
    | `timeline_24h` | Array of 24 `{hour, fuel_type}` objects for today |

    > **Note**: Results are simulated, not sourced from a live PJM API.
    """
    if demo:
        logger.info("GET /api/marginal-fuel [DEMO]")
        return _demo_section("marginal_fuel")

    from data.marginal_fuel import MarginalFuelClient
    from collections import Counter

    logger.info("GET /api/marginal-fuel | zone={}", zone or "ALL")

    # MarginalFuelClient is pure Python (no I/O) — still run off the loop for
    # consistency with the rest of the middleware pattern.
    client  = MarginalFuelClient()
    results = await asyncio.to_thread(client.get_marginal_fuel, zone)

    if not results and zone:
        from data.marginal_fuel import ALL_ZONES as _ALL_ZONES
        raise HTTPException(
            status_code=404,
            detail=(
                f"Zone '{zone}' not recognised. "
                f"Valid zones: {', '.join(sorted(_ALL_ZONES))}."
            ),
        )

    records = [
        MarginalFuelRecord(
            zone=r.zone,
            current_fuel=r.current_fuel,
            is_fossil=r.is_fossil,
            signal_strength=r.signal_strength,
            market_note=r.market_note,
            timeline_24h=[TimelineHour(hour=e.hour, fuel_type=e.fuel_type) for e in r.timeline_24h],
        )
        for r in results
    ]

    fuel_counts     = Counter(r.current_fuel for r in records)
    dominant_fuel   = fuel_counts.most_common(1)[0][0] if fuel_counts else "N/A"
    fossil_count    = sum(1 for r in records if r.is_fossil)
    renewable_count = len(records) - fossil_count

    now_ept   = datetime.now(tz=PJM_TIMEZONE)
    day_start = _fmt_ept(now_ept.replace(hour=0, minute=0, second=0, microsecond=0))
    day_end   = _fmt_ept(now_ept.replace(hour=23, minute=59, second=0, microsecond=0))

    return MarginalFuelApiResponse(
        meta=_make_meta(
            is_demo=False, zone=zone or "ALL",
            start=day_start, end=day_end,
            units="signal_strength (0-100)", data_quality="LIVE",
        ),
        data=records,
        summary=MarginalFuelSummary(
            total_zones=len(records),
            snapshot_hour_ept=now_ept.hour,
            dominant_fuel=dominant_fuel,
            fossil_zone_count=fossil_count,
            renewable_zone_count=renewable_count,
        ),
    )


@app.get("/api/resource-gap", response_model=ResourceGapApiResponse, tags=["Resource Gap"])
async def get_resource_gap(
    zone: Optional[str] = Query(
        default=None,
        description=(
            "Filter to a single PJM zone (e.g. 'BGE', 'DEOK', 'AEP'). "
            "Omit to return all 22 zones plus PJM-RTO aggregate."
        ),
    ),
    queue_success_rate: float = Query(
        default=0.174,
        gt=0,
        le=1,
        description=(
            "Fraction of queued nameplate MW expected to reach commercial operation. "
            "Default 0.174 (17.4 %), per PJM IMM 2023 State of the Market. "
            "Adjust upward for optimistic scenarios, downward for stress tests."
        ),
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Return PJM zone-level resource adequacy gap analysis.

    Combines three data layers to compute each zone's dependable capacity balance:

    **1 — Retirements**
    Zone-level coal/gas deactivation totals (MW) through 2028, drawn from PJM's
    published Generator Deactivation Process notices.  The system-wide total is
    ~13.2 GW, led by Brandon Shores, Keystone, W.H. Sammis, and the AEP
    Cardinal/Mountaineer/Kammer cluster.

    **2 — Queue adjustment (17.4 % success rate)**

        adjusted_queue_mw = total_queue_mw × queue_success_rate

    PJM's ~221 GW interconnection queue has historically yielded only ~17.4 %
    of nameplate to commercial operation (PJM IMM 2023 SotM).

    **3 — ELCC capacity derating**

        elcc_adjusted_mw = adjusted_queue_mw × avg_elcc

    Renewables cannot substitute 1:1 for dispatchable capacity at peak hours.
    PJM 2024/25 accreditation values: Solar 19 %, Onshore Wind 13 %,
    Offshore Wind 25 %, 4-hour BESS 91 %, Gas CC 95 %.

    **Deficit and reliability score**

        retirement_deficit_mw = retiring_mw − elcc_adjusted_mw
        reliability_score     = 1–10  (10 = highest risk to grid reliability)

    | Score | Interpretation |
    |---|---|
    | 9–10 | CRITICAL — acute dispatchable capacity shortage |
    | 7–8  | HIGH — significant gap, peaker/storage investment warranted |
    | 5–6  | MODERATE — emerging gap, storage/DR investments economic |
    | 3–4  | LOW — modest tightness, queue additions likely sufficient |
    | 1–2  | MINIMAL — capacity surplus; transmission is higher priority |
    """
    if demo:
        logger.info("GET /api/resource-gap [DEMO]")
        return _demo_section("resource_gap")

    from data.resource_gap import ResourceGapClient, QUEUE_SUCCESS_RATE as _DEFAULT_RATE
    from data.resource_gap import _ZONE_PROFILES as _PROFILES

    logger.info(
        "GET /api/resource-gap | zone={} | success_rate={:.1%}",
        zone or "ALL", queue_success_rate,
    )

    client  = ResourceGapClient(queue_success_rate=queue_success_rate)
    results = await asyncio.to_thread(client.get_resource_gap, zone)

    if not results and zone:
        from data.resource_gap import _ZONE_PROFILES
        raise HTTPException(
            status_code=404,
            detail=(
                f"Zone '{zone}' not recognised. "
                f"Valid zones: {', '.join(sorted(_ZONE_PROFILES.keys()))}."
            ),
        )

    records = [
        ResourceGapRecord(
            zone=r.zone,
            retiring_mw=r.retiring_mw,
            total_queue_mw=r.total_queue_mw,
            adjusted_queue_mw=r.adjusted_queue_mw,
            avg_elcc=r.avg_elcc,
            elcc_adjusted_mw=r.elcc_adjusted_mw,
            retirement_deficit_mw=r.retirement_deficit_mw,
            reliability_score=r.reliability_score,
            investment_signal=r.investment_signal,
            key_retirements=r.key_retirements,
            queue_success_rate=r.queue_success_rate,
        )
        for r in results
    ]

    critical_zones  = sum(1 for r in records if r.reliability_score >= 7)
    total_deficit   = round(
        sum(r.retirement_deficit_mw for r in records if r.retirement_deficit_mw > 0), 1
    )
    most_at_risk    = records[0].zone if records else "N/A"

    # Use PJM-RTO aggregate score if present, otherwise average across zones
    rto_record = next((r for r in records if r.zone == "PJM-RTO"), None)
    if rto_record:
        sys_score = rto_record.reliability_score
    elif records:
        sys_score = round(sum(r.reliability_score for r in records) / len(records))
    else:
        sys_score = 1

    return ResourceGapApiResponse(
        meta=_make_meta(
            is_demo=False, zone=zone or "ALL",
            start="2024-01-01T00:00:00-05:00",
            end="2028-12-31T23:59:59-05:00",
            units="MW", data_quality="LIVE",
        ),
        data=records,
        summary=ResourceGapSummary(
            total_zones=len(records),
            critical_zones=critical_zones,
            total_deficit_mw=total_deficit,
            queue_success_rate=queue_success_rate,
            most_at_risk_zone=most_at_risk,
            system_reliability_score=sys_score,
        ),
    )


@app.get("/api/convergence", response_model=ConvergenceApiResponse, tags=["Convergence"])
async def get_convergence(
    zone: str = Query(
        default="PJM-RTO",
        description=(
            "PJM transmission zone (e.g. 'BGE', 'COMED', 'PJM-RTO'). "
            "Case-insensitive."
        ),
    ),
    date: Optional[str] = Query(
        default=None,
        description=(
            "Calendar date to analyse in EPT, ISO format: 'YYYY-MM-DD'. "
            "Defaults to yesterday EPT — the most recent day with a "
            "complete DA schedule and a complete RT settlement."
        ),
    ),
    rolling: bool = Query(
        default=False,
        description=(
            "When true, use a rolling 24h window ending now instead of a "
            "fixed calendar date.  Useful for intraday monitoring; "
            "hours without both DA and RT prices are dropped."
        ),
    ),
    window_hours: int = Query(
        default=24,
        ge=1,
        le=168,
        description="Rolling window size in hours. Only used when rolling=true.",
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Return hourly Day-Ahead / Real-Time LMP convergence analysis for a PJM zone.

    **What is convergence?**

    PJM clears two markets for each hour:

    * **Day-Ahead (DA)**: Forward price set in the financial auction published
      ~17:00 EPT the day before delivery.
    * **Real-Time (RT)**: Spot price settled from 5-minute dispatch intervals
      (this endpoint uses the unverified hourly average).

    The **convergence spread** reveals whether the market predicted demand correctly:

        spread ($/MWh)  =  RT_LMP  −  DA_LMP

    | spread | interpretation |
    |---|---|
    | near $0 | Markets converged; supply matched demand as forecast |
    | > **+$50** | **Scarcity** — RT demand exceeded forecast; shortage pricing in effect |
    | < **−$50** | **Oversupply** — excess generation (often renewables) crushed RT prices |

    **Virtual trading** exploits this spread: traders who correctly predict scarcity
    buy in DA and sell in RT, capturing the positive spread as profit.

    **Data sources**

    | Feed | Endpoint |
    |---|---|
    | DA | `api.pjm.com/api/v1/da_hrl_lmps` |
    | RT | `api.pjm.com/api/v1/rt_unverified_hrl_lmps` |
    """
    if demo:
        logger.info("GET /api/convergence [DEMO]")
        return _demo_section("convergence")

    from data.convergence import ConvergenceClient
    from datetime import date as dt_date

    logger.info(
        "GET /api/convergence | zone={} | date={} | rolling={} | window={}h",
        zone, date or "yesterday", rolling, window_hours,
    )

    client = ConvergenceClient()

    if rolling:
        result = await asyncio.to_thread(
            client.get_convergence_rolling, zone, window_hours
        )
    else:
        parsed_date: Optional[dt_date] = None
        if date:
            try:
                parsed_date = dt_date.fromisoformat(date)
            except ValueError as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid date format '{date}'. Use 'YYYY-MM-DD'.",
                ) from exc
        result = await asyncio.to_thread(
            client.get_convergence, zone, parsed_date
        )

    if not result.records:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No convergence data found for zone '{zone}' on "
                f"{date or 'yesterday'}. "
                "Verify the zone name (e.g. BGE, COMED, PJM-RTO) and that "
                "PJM has published both DA and RT prices for the requested window."
            ),
        )

    conv_records = [
        ConvergenceHourRecord(
            hour=r.hour,
            da_price=r.da_price,
            rt_price=r.rt_price,
            spread=r.spread,
            event_flag=r.event_flag,
        )
        for r in result.records
    ]

    return ConvergenceApiResponse(
        meta=_make_meta(
            is_demo=False, zone=result.zone,
            start=result.window_start, end=result.window_end,
            units="$/MWh", data_quality="LIVE",
        ),
        data=conv_records,
        summary=ConvergenceSummary(
            zone=result.zone,
            avg_spread=result.avg_spread,
            max_spread=result.max_spread,
            min_spread=result.min_spread,
            scarcity_hours=result.scarcity_hours,
            oversupply_hours=result.oversupply_hours,
            total_hours=result.total_hours,
            window_start=result.window_start,
            window_end=result.window_end,
            dominant_signal=result.dominant_signal,
            market_narrative=result.market_narrative,
        ),
    )


# ===========================================================================
# Weather & Load Intelligence
# ===========================================================================


class DataSourceStatus(BaseModel):
    """Status of a single data source in the GridAlpha pipeline."""
    name:         str
    endpoint:     str
    status:       str            # "LIVE" | "DEMO" | "STALE" | "ERROR"
    last_updated: str
    latency_ms:   Optional[float] = None


class SyncStatusResponse(BaseModel):
    """System-wide data freshness and Demo Mode indicator."""
    mode:               str                    # "live" | "demo"
    snapshot_timestamp: str
    demo_mode_active:   bool
    message:            str
    data_sources:       list[DataSourceStatus]


# ---------------------------------------------------------------------------
# Ghost Mode — deterministic demo snapshot
# ---------------------------------------------------------------------------

_DEMO_SNAPSHOT: dict = {}


def _demo_section(key: str) -> dict:
    """
    Return the named section of the demo snapshot, loading it lazily.

    The JSON file is read once and cached for the process lifetime.
    Returning a plain dict is intentional — FastAPI validates it against
    the endpoint's response_model and serialises it identically to a live
    response, so callers cannot distinguish demo from live data.
    """
    global _DEMO_SNAPSHOT
    if not _DEMO_SNAPSHOT:
        snap_path = Path(__file__).parent / "data" / "demo_snapshot.json"
        with snap_path.open(encoding="utf-8") as fh:
            _DEMO_SNAPSHOT = json.load(fh)
        logger.info("Ghost Mode: demo snapshot loaded ({} sections).", len(_DEMO_SNAPSHOT) - 1)
    return _DEMO_SNAPSHOT[key]


@app.get(
    "/weather",
    response_model=WeatherApiResponse,
    summary="Real-time weather & load for a PJM zone",
    tags=["Weather & Load"],
)
async def get_weather(
    zone: str = Query(
        default="PJM-RTO",
        description=(
            "PJM zone name (case-insensitive). "
            "Examples: BGE, COMED, AEP, PSEG, DOM, PPL, PJM-RTO."
        ),
    ),
    window_hours: int = Query(
        default=24,
        ge=1,
        le=48,
        description="Rolling window of hourly observations to return (1–48, default 24).",
    ),
    demo: bool = _DEMO_QUERY,
):
    """
    Returns real hourly temperature observations from NOAA and PJM
    actual vs forecast load for the requested zone.

    **Weather data** comes from NOAA Weather.gov (no API key required):
    - The zone is mapped to the nearest NWS forecast office grid point.
    - Stations are resolved from the gridpoints API; known airport stations
      serve as fallbacks (KPHL, KORD, KPIT).
    - Temperature unit: °F (also °C included).

    **Load data** comes from PJM's `inst_load` feed:
    - Actual load: 5-min instantaneous readings aggregated to hourly means.
    - Forecast: day-ahead persistence — yesterday's same-hour actual load
      (standard operational baseline; no public PJM forecast API available).
    - Zone-level load area codes are resolved automatically.

    **Zone → station mapping (user-specified)**

    | Zones | NOAA Grid | Fallback station |
    |---|---|---|
    | BGE, PECO, PPL, PSEG, … | Philadelphia (PAX/96,70) | KPHL |
    | COMED, DAY, EKPC | Chicago (LOT/65,73) | KORD |
    | AEP, ATSI, DPL, … | Pittsburgh (PBZ/75,65) | KPIT |

    **Weather alerts**

    | Threshold | Alert |
    |---|---|
    | temp > 90 °F | `Heat Stress` — peak cooling load risk |
    | temp < 20 °F | `Cold Snap` — heating load surge risk |
    | otherwise | `Normal` |
    """
    if demo:
        logger.info("GET /weather [DEMO]")
        return _demo_section("weather")

    from data.weather import WeatherClient

    logger.info("GET /weather | zone={} | window={}h", zone.upper(), window_hours)

    client = WeatherClient()
    result = await asyncio.to_thread(
        client.get_weather, zone.upper(), window_hours
    )

    if not result.records:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No weather data found for zone '{zone.upper()}'. "
                "Verify the zone name (e.g. BGE, COMED, AEP, PJM-RTO) and check "
                "NOAA API availability."
            ),
        )

    wx_records = [
        WeatherHourRecord(
            timestamp        = r.timestamp,
            temperature_f    = r.temperature_f,
            temperature_c    = r.temperature_c,
            zone             = r.zone,
            station_id       = r.station_id,
            load_forecast_mw = r.load_forecast_mw,
            actual_load_mw   = r.actual_load_mw,
            load_delta_pct   = r.load_delta_pct,
            weather_alert    = r.weather_alert,
        )
        for r in result.records
    ]

    return WeatherApiResponse(
        meta=_make_meta(
            is_demo=False, zone=result.zone,
            start=result.window_start, end=result.window_end,
            units="°F / MW", data_quality="LIVE",
        ),
        data=wx_records,
        summary=WeatherSummary(
            zone         = result.zone,
            station_id   = result.station_id,
            station_city = result.station_city,
            avg_temp_f   = result.avg_temp_f,
            max_temp_f   = result.max_temp_f,
            min_temp_f   = result.min_temp_f,
            heat_hours   = result.heat_hours,
            cold_hours   = result.cold_hours,
            total_hours  = result.total_hours,
            window_start = result.window_start,
            window_end   = result.window_end,
        ),
    )


# ---------------------------------------------------------------------------
# Sync Status — pipeline health / Ghost Mode indicator
# ---------------------------------------------------------------------------

_LIVE_SOURCES = [
    ("PJM Generation by Fuel",        "/generation"),
    ("PJM Real-Time LMP",             "/lmp"),
    ("Spark Spread (LMP + Henry Hub)", "/spark-spread"),
    ("Battery Storage Arbitrage",     "/battery-arbitrage"),
    ("DA/RT LMP Convergence",         "/api/convergence"),
    ("NOAA Weather + PJM Load",       "/weather"),
    ("Marginal Fuel (Simulated)",     "/api/marginal-fuel"),
    ("Resource Adequacy Gap",         "/api/resource-gap"),
]


@app.get("/sync-status", response_model=SyncStatusResponse, tags=["Meta"])
async def get_sync_status(
    demo: bool = _DEMO_QUERY,
):
    """
    Return the data pipeline's current mode and source freshness.

    In **live** mode every data source is polled on demand; this endpoint
    reports them all as `LIVE` with the current server timestamp.

    In **demo** mode (`?demo=true`) the Demo Mode snapshot is returned —
    all sources show `DEMO` with the snapshot timestamp so callers know
    they are viewing deterministic data.
    """
    if demo:
        logger.info("GET /sync-status [DEMO]")
        return _demo_section("sync_status")

    now_str = datetime.now(tz=PJM_TIMEZONE).isoformat()
    return SyncStatusResponse(
        mode="live",
        snapshot_timestamp=now_str,
        demo_mode_active=False,
        message="All GridAlpha data sources are operating in live mode.",
        data_sources=[
            DataSourceStatus(
                name=name,
                endpoint=ep,
                status="LIVE",
                last_updated=now_str,
                latency_ms=None,
            )
            for name, ep in _LIVE_SOURCES
        ],
    )


# ---------------------------------------------------------------------------
# Static reference endpoints  (/zones, /assumptions)
# ---------------------------------------------------------------------------


class ZoneEntry(BaseModel):
    zone_id:      str   # canonical PJM identifier, e.g. "AEP"
    display_name: str   # human-readable label,    e.g. "AEP Zone"
    type:         str   # "zone" | "hub"
    sort_order:   int


class AssumptionsResponse(BaseModel):
    cycling_hurdle_per_mwh:       float   # $/MWh minimum spread to dispatch battery
    default_efficiency_pct:       float   # round-trip efficiency, %
    default_heat_rate_mmbtu_mwh:  float   # gas plant heat rate, MMBtu/MWh
    default_gas_price_mmbtu:      float   # Henry Hub reference price, $/MMBtu
    queue_success_rate_pct:       float   # historical interconnection queue success, %
    solar_elcc_pct:               float   # PJM solar capacity credit (ELCC), %
    stale_threshold_minutes:      int     # minutes before a live data source is flagged stale
    down_threshold_minutes:       int     # minutes before a live data source is flagged down


_PJM_ZONES: list[dict] = [
    {"zone_id": "AEP",     "display_name": "AEP Zone",         "type": "zone", "sort_order":  1},
    {"zone_id": "AECO",    "display_name": "AECO Zone",        "type": "zone", "sort_order":  2},
    {"zone_id": "APS",     "display_name": "APS Zone",         "type": "zone", "sort_order":  3},
    {"zone_id": "ATSI",    "display_name": "ATSI Zone",        "type": "zone", "sort_order":  4},
    {"zone_id": "BGE",     "display_name": "BGE Zone",         "type": "zone", "sort_order":  5},
    {"zone_id": "COMED",   "display_name": "ComEd Zone",       "type": "zone", "sort_order":  6},
    {"zone_id": "DAY",     "display_name": "Dayton Zone",      "type": "zone", "sort_order":  7},
    {"zone_id": "DEOK",    "display_name": "Duke Ohio/KY Zone","type": "zone", "sort_order":  8},
    {"zone_id": "DOM",     "display_name": "Dominion Zone",    "type": "zone", "sort_order":  9},
    {"zone_id": "DPL",     "display_name": "Delmarva Zone",    "type": "zone", "sort_order": 10},
    {"zone_id": "DUQ",     "display_name": "Duquesne Zone",    "type": "zone", "sort_order": 11},
    {"zone_id": "EKPC",    "display_name": "East KY Power Zone","type": "zone","sort_order": 12},
    {"zone_id": "JCPL",    "display_name": "Jersey Central Zone","type": "zone","sort_order":13},
    {"zone_id": "METED",   "display_name": "Met-Ed Zone",      "type": "zone", "sort_order": 14},
    {"zone_id": "OVEC",    "display_name": "Ohio Valley Zone", "type": "zone", "sort_order": 15},
    {"zone_id": "PECO",    "display_name": "PECO Zone",        "type": "zone", "sort_order": 16},
    {"zone_id": "PENELEC", "display_name": "Penelec Zone",     "type": "zone", "sort_order": 17},
    {"zone_id": "PEPCO",   "display_name": "Pepco Zone",       "type": "zone", "sort_order": 18},
    {"zone_id": "PJM-RTO", "display_name": "PJM RTO (System)", "type": "zone","sort_order": 19},
    {"zone_id": "PPL",     "display_name": "PPL Zone",         "type": "zone", "sort_order": 20},
    {"zone_id": "PSEG",    "display_name": "PSEG Zone",        "type": "zone", "sort_order": 21},
    {"zone_id": "RECO",    "display_name": "Rockland Zone",    "type": "zone", "sort_order": 22},
    {"zone_id": "WEST HUB","display_name": "Western Hub",      "type": "hub",  "sort_order": 23},
    {"zone_id": "EAST HUB","display_name": "Eastern Hub",      "type": "hub",  "sort_order": 24},
]

_PLATFORM_ASSUMPTIONS = AssumptionsResponse(
    cycling_hurdle_per_mwh      = 20.0,
    default_efficiency_pct      = 87.0,
    default_heat_rate_mmbtu_mwh = 7.0,
    default_gas_price_mmbtu     = 4.00,
    queue_success_rate_pct      = 17.4,
    solar_elcc_pct              = 19.0,
    stale_threshold_minutes     = 90,
    down_threshold_minutes      = 180,
)


@app.get("/zones", response_model=list[ZoneEntry], tags=["Reference"])
async def get_zones():
    """
    Return the canonical PJM transmission zone list.

    Includes all 22 pricing zones plus Western Hub and Eastern Hub.
    Hubs are listed last (`type = 'hub'`).  Results are sorted by
    `sort_order` and are identical on every call — no demo flag needed.
    """
    return _PJM_ZONES


@app.get("/assumptions", response_model=AssumptionsResponse, tags=["Reference"])
async def get_assumptions():
    """
    Return the platform-wide modelling constants used by GridAlpha.

    These values are the defaults baked into every calculation endpoint.
    They are static and identical on every call — no demo flag needed.
    """
    return _PLATFORM_ASSUMPTIONS
