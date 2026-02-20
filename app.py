"""
GridAlpha — PJM Electricity Market Intelligence Dashboard
Main Streamlit entry point.

Run:  streamlit run app.py
"""

from __future__ import annotations

import os
import sys

import streamlit as st
from dotenv import load_dotenv
from loguru import logger

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

# Direct loguru output to stderr so it doesn't bleed into Streamlit's stdout
logger.remove()
logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))

# ---------------------------------------------------------------------------
# Page configuration (must be the first Streamlit call)
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="GridAlpha | PJM Market Intelligence",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Lazy import of data layer — gives a clear error if dependencies are missing
# ---------------------------------------------------------------------------

try:
    from data.pjm_client import PJMClient, fetch_latest_snapshot
except ImportError as exc:
    st.error(
        f"Failed to import data layer: {exc}\n\n"
        "Run `pip install -r requirements.txt` and restart."
    )
    st.stop()

# ---------------------------------------------------------------------------
# Session-state defaults
# ---------------------------------------------------------------------------

if "api_key_confirmed" not in st.session_state:
    st.session_state["api_key_confirmed"] = False

# ---------------------------------------------------------------------------
# Sidebar — configuration
# ---------------------------------------------------------------------------

with st.sidebar:
    st.title("⚡ GridAlpha")
    st.caption("PJM Market Intelligence · Penn State Energy Portfolio")
    st.divider()

    st.info(
        "Uses PJM's public subscription key — no API account needed.",
        icon="🔑",
    )

    rolling_hours = st.slider(
        "Rolling window (hours)",
        min_value=1,
        max_value=168,
        value=24,
        step=1,
        help="How many hours of historical generation data to fetch.",
    )

    st.divider()
    st.caption("Data source: PJM Data Miner 2 API")
    st.caption("Endpoint: gen_by_fuel")

# ---------------------------------------------------------------------------
# Main content area — data pipeline status (frontend phase coming next)
# ---------------------------------------------------------------------------

st.title("⚡ GridAlpha — PJM Generation Mix")
st.markdown(
    "**Data pipeline active.** Frontend charts will be added in the next phase. "
    "Use the panel below to verify that the API connection is working."
)

st.divider()

col_fetch, col_status = st.columns([2, 3])

with col_fetch:
    fetch_btn = st.button("Fetch Latest Snapshot", type="primary", use_container_width=True)
    fetch_24h_btn = st.button(
        f"Fetch Last {rolling_hours}h", use_container_width=True
    )

with col_status:
    status_placeholder = st.empty()

# ---------------------------------------------------------------------------
# Fetch actions
# ---------------------------------------------------------------------------

if fetch_btn:
    client = PJMClient()
    with st.spinner("Calling PJM Data Miner 2…"):
        try:
            df = client.get_latest_gen_snapshot()
            if df.empty:
                status_placeholder.warning("API returned no data.")
            else:
                status_placeholder.success(
                    f"Snapshot fetched — {len(df)} fuel types, "
                    f"{df['mw'].sum():,.0f} MW total generation."
                )
                st.subheader("Latest Generation Snapshot")
                st.dataframe(
                    df[["fuel_type", "mw", "is_renewable"]].sort_values("mw", ascending=False),
                    use_container_width=True,
                    hide_index=True,
                )
        except Exception as exc:
            status_placeholder.error(f"Request failed: {exc}")
            logger.exception("Snapshot fetch error")

if fetch_24h_btn:
    client = PJMClient()
    with st.spinner(f"Fetching {rolling_hours}h of generation data…"):
        try:
            df = client.get_gen_by_fuel(rolling_window_hours=rolling_hours)
            if df.empty:
                status_placeholder.warning("API returned no data.")
            else:
                status_placeholder.success(
                    f"Fetched {len(df):,} rows across {rolling_hours}h window."
                )
                st.subheader(f"Generation by Fuel — Last {rolling_hours}h")
                st.dataframe(df, use_container_width=True, hide_index=True)
        except Exception as exc:
            status_placeholder.error(f"Request failed: {exc}")
            logger.exception("Rolling-window fetch error")

# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------

st.divider()
st.caption(
    "GridAlpha v0.1 · Built for Penn State Energy Business & Finance Portfolio · "
    "Data © PJM Interconnection"
)
