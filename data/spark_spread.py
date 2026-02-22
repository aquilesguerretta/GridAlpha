"""
GridAlpha — Spark Spread Calculator
Profitability metric for natural gas-fired power plants.

Formula
-------
    Spark Spread  =  LMP  −  Gas Cost
    Gas Cost      =  Gas Price ($/MMBtu)  ×  Heat Rate (MMBtu/MWh)

Interpretation
--------------
  > 0  Plant is profitable at current prices — it covers fuel cost.
  = 0  Break-even.
  < 0  Plant is running at a fuel-cost loss (often indicates must-run or
       capacity obligations keeping the unit online anyway).

A positive spark spread does not guarantee overall profitability; it only
covers variable fuel costs.  Fixed costs (O&M, debt service) are excluded.

LMP source
----------
  Pulled live from PJM's rt_unverified_hrl_lmps feed via data/lmp.py.
  One calculation is produced per PJM transmission zone per hour.

Gas price
---------
  Henry Hub spot price, hardcoded as HENRY_HUB_PRICE_PER_MMBTU.
  Source: EIA / market data as of Feb 21, 2026.
  After the Winter Storm Fern spike (Jan avg $7.72), prices declined to the
  $3–5 range in February.  $4.00/MMBtu is used as a representative value.

  Replace this constant or pass `gas_price` explicitly to make it dynamic.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd
from loguru import logger

from data.lmp import LMPClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Standard heat rate for a combined-cycle gas turbine (CCGT).
# Typical range: 6.5–8.0 MMBtu/MWh.  7.0 is the industry benchmark.
DEFAULT_HEAT_RATE: float = 7.0  # MMBtu/MWh

# Henry Hub natural gas spot price — hardcoded, replace with live feed later.
# EIA data, February 2026: prices returned to ~$3–5/MMBtu after the Jan spike.
# Last updated: Feb 21, 2026.
HENRY_HUB_PRICE_PER_MMBTU: float = 4.00  # $/MMBtu

PJM_TIMEZONE = ZoneInfo("America/New_York")


# ---------------------------------------------------------------------------
# Core client
# ---------------------------------------------------------------------------


class SparkSpreadClient:
    """
    Calculates spark spreads for all PJM transmission zones.

    Wraps LMPClient to pull live zonal LMP data, then applies the
    spark spread formula for a natural gas plant at a given heat rate.

    Parameters
    ----------
    heat_rate:
        Plant efficiency in MMBtu/MWh (default 7.0 — typical CCGT).
    gas_price:
        Henry Hub price in $/MMBtu.  Defaults to HENRY_HUB_PRICE_PER_MMBTU.
    lmp_client:
        Optional pre-configured LMPClient instance.  A default one is
        created if not supplied.
    """

    def __init__(
        self,
        heat_rate: float = DEFAULT_HEAT_RATE,
        gas_price: float = HENRY_HUB_PRICE_PER_MMBTU,
        lmp_client: Optional[LMPClient] = None,
    ) -> None:
        if heat_rate <= 0:
            raise ValueError(f"heat_rate must be positive, got {heat_rate}")
        if gas_price < 0:
            raise ValueError(f"gas_price cannot be negative, got {gas_price}")

        self.heat_rate = heat_rate
        self.gas_price = gas_price
        self._lmp = lmp_client or LMPClient()

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def get_snapshot(self) -> pd.DataFrame:
        """
        Return spark spread for the most recent completed hour, all zones.

        Returns
        -------
        pd.DataFrame
            Columns: zone_name, lmp, gas_cost, spark_spread,
                     heat_rate, gas_price_used, timestamp
        """
        logger.info(
            "Calculating spark spread snapshot | heat_rate={} MMBtu/MWh | gas=${}/MMBtu",
            self.heat_rate,
            self.gas_price,
        )
        lmp_df = self._lmp.get_latest_lmp_snapshot()
        return self._calculate(lmp_df)

    def get_by_zone(self, rolling_window_hours: int = 4) -> pd.DataFrame:
        """
        Return spark spread for all zones over a rolling time window.

        Parameters
        ----------
        rolling_window_hours:
            How many hours of LMP history to include.

        Returns
        -------
        pd.DataFrame
            Same columns as get_snapshot(), multiple rows per zone.
        """
        logger.info(
            "Calculating spark spread | window={}h | heat_rate={} | gas=${}/MMBtu",
            rolling_window_hours,
            self.heat_rate,
            self.gas_price,
        )
        lmp_df = self._lmp.get_lmp_by_zone(rolling_window_hours=rolling_window_hours)
        return self._calculate(lmp_df)

    # ------------------------------------------------------------------
    # Calculation
    # ------------------------------------------------------------------

    def _calculate(self, lmp_df: pd.DataFrame) -> pd.DataFrame:
        """
        Apply the spark spread formula to an LMP DataFrame.

        spark_spread  =  lmp  −  (gas_price  ×  heat_rate)

        The gas cost ($/MWh) is the same for every zone because it depends
        only on the fuel price and plant efficiency — not on location.
        """
        if lmp_df.empty:
            logger.warning("SparkSpread: LMP DataFrame is empty, returning empty result.")
            return pd.DataFrame(columns=[
                "zone_name", "lmp", "gas_cost", "spark_spread",
                "heat_rate", "gas_price_used", "timestamp",
            ])

        gas_cost = round(self.gas_price * self.heat_rate, 4)  # $/MWh

        df = pd.DataFrame()
        df["zone_name"] = lmp_df["zone_name"]
        df["lmp"] = lmp_df["lmp_total"].round(4)
        df["gas_cost"] = gas_cost
        df["spark_spread"] = (df["lmp"] - gas_cost).round(4)
        df["heat_rate"] = self.heat_rate
        df["gas_price_used"] = self.gas_price

        # Timestamp: use ept column if present, else fall back gracefully
        ts_col = "timestamp_ept" if "timestamp_ept" in lmp_df.columns else lmp_df.columns[-1]
        df["timestamp"] = lmp_df[ts_col].apply(
            lambda v: v.isoformat() if hasattr(v, "isoformat") else str(v)
        )

        df = df.sort_values("spark_spread", ascending=False).reset_index(drop=True)

        positive = (df["spark_spread"] > 0).sum()
        logger.info(
            "Spark spread: gas_cost=${:.2f}/MWh | {}/{} zones profitable",
            gas_cost,
            positive,
            len(df),
        )
        return df


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def fetch_spark_spread_snapshot(
    heat_rate: float = DEFAULT_HEAT_RATE,
    gas_price: float = HENRY_HUB_PRICE_PER_MMBTU,
) -> pd.DataFrame:
    """Fetch the latest spark spread snapshot across all PJM zones."""
    return SparkSpreadClient(heat_rate=heat_rate, gas_price=gas_price).get_snapshot()


def fetch_spark_spread(
    hours: int = 4,
    heat_rate: float = DEFAULT_HEAT_RATE,
    gas_price: float = HENRY_HUB_PRICE_PER_MMBTU,
) -> pd.DataFrame:
    """Fetch spark spread for the last *hours* across all PJM zones."""
    return SparkSpreadClient(heat_rate=heat_rate, gas_price=gas_price).get_by_zone(hours)


# ---------------------------------------------------------------------------
# Smoke test  (python data/spark_spread.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    logger.remove()
    logger.add(sys.stderr, level="INFO")

    logger.info("=== GridAlpha — Spark Spread Smoke Test ===")
    logger.info(
        "Parameters: heat_rate={}  gas_price=${}/MMBtu  gas_cost=${:.2f}/MWh",
        DEFAULT_HEAT_RATE,
        HENRY_HUB_PRICE_PER_MMBTU,
        DEFAULT_HEAT_RATE * HENRY_HUB_PRICE_PER_MMBTU,
    )

    client = SparkSpreadClient()

    # Test 1: snapshot
    logger.info("Test 1: Snapshot across all zones…")
    df = client.get_snapshot()

    if df.empty:
        logger.error("Test 1 FAILED — empty result.")
    else:
        logger.success("Test 1 PASSED — {} zones", len(df))

        profitable = df[df["spark_spread"] > 0]
        loss_zones = df[df["spark_spread"] <= 0]

        print(f"\n{'Zone':<12} {'LMP':>8} {'Gas Cost':>9} {'Spread':>8}  Status")
        print("-" * 52)
        for _, row in df.iterrows():
            status = "PROFIT" if row["spark_spread"] > 0 else "LOSS  "
            print(
                f"{row['zone_name']:<12} "
                f"${row['lmp']:>7.2f} "
                f"${row['gas_cost']:>8.2f} "
                f"${row['spark_spread']:>7.2f}  {status}"
            )

        print(f"\nSummary (gas cost = ${df['gas_cost'].iloc[0]:.2f}/MWh):")
        print(f"  Profitable zones : {len(profitable)}/{len(df)}")
        print(f"  Avg spark spread : ${df['spark_spread'].mean():.2f}/MWh")
        print(f"  Best zone        : {df.iloc[0]['zone_name']} (${df.iloc[0]['spark_spread']:.2f}/MWh)")
        print(f"  Worst zone       : {df.iloc[-1]['zone_name']} (${df.iloc[-1]['spark_spread']:.2f}/MWh)")
        print(f"  Snapshot hour    : {df['timestamp'].iloc[0]}")

    print()

    # Test 2: custom heat rate (peaker plant — less efficient)
    logger.info("Test 2: Peaker plant heat rate (9.5 MMBtu/MWh)…")
    df_peaker = SparkSpreadClient(heat_rate=9.5).get_snapshot()
    if not df_peaker.empty:
        peaker_gas_cost = df_peaker["gas_cost"].iloc[0]
        peaker_profitable = (df_peaker["spark_spread"] > 0).sum()
        logger.success(
            "Test 2 PASSED — peaker gas_cost=${:.2f}/MWh | {}/{} profitable",
            peaker_gas_cost, peaker_profitable, len(df_peaker),
        )
