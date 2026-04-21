"""
Wildfire Hotspot Monitor — FastAPI Backend
==========================================
Endpoints
---------
  GET /health                   → liveness probe
  GET /api/hotspots             → full cleaned+normalised hotspot list (cached 5 min)
  GET /api/hotspots/stats       → aggregate statistics on the current dataset
  GET /api/hotspots/region      → bounding-box filtered subset

Data pipeline
-------------
  1. Fetch MODIS C6.1 global 7-day CSV from NASA FIRMS
  2. Clean: keep latitude, longitude, brightness, confidence
  3. Normalise: brightness → [0.0, 1.0]
  4. Cache in-memory for CACHE_TTL seconds (default 300 s)
  5. On any failure (incl. HTTP 403) → fall back to mock_hotspots.json
"""

import json
import logging
import os
import time
from dataclasses import dataclass, field
from io import StringIO
from pathlib import Path
from typing import Optional

import httpx
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Environment Initialization ──────────────────────────────────────────────
# Load .env file and override system variables to ensure .env takes priority
load_dotenv(override=True)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Configuration (env-overridable) ──────────────────────────────────────────
NASA_API_KEY: str = os.getenv("NASA_API_KEY", "").strip()
NASA_FIRMS_URL: str = os.getenv("NASA_FIRMS_URL", "").strip()

# PRIORITY: If API Key is provided, upgrade to the authenticated MAPS API
if NASA_API_KEY:
    # Use the 'area' endpoint with a global bounding box for the most reliable response
    # Format: /api/area/csv/[KEY]/[SOURCE]/[WEST,SOUTH,EAST,NORTH]/[DAY_RANGE]
    NASA_FIRMS_URL = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_API_KEY}/MODIS_NRT/-180,-90,180,90/7"
    logger.info("📡 Using NASA FIRMS MAPS API (Key-authenticated)")
elif not NASA_FIRMS_URL:
    # FALLBACK: Use public feed only if no key and no manual URL is provided
    NASA_FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/active_fire/c6.1/csv/MODIS_C6_1_Global_7d.csv"
    logger.info("🌐 Using NASA FIRMS Public CSV Feed (No key provided)")
else:
    # MANUAL: Use the specific URL provided in the environment
    logger.info(f"🔗 Using manual NASA_FIRMS_URL: {NASA_FIRMS_URL}")
CACHE_TTL: int = int(os.getenv("CACHE_TTL_SECONDS", "300"))   # 5 minutes
BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

REQUIRED_COLS = {"latitude", "longitude", "brightness", "confidence"}
# Optional enrichment columns — included when present in the NASA CSV
OPTIONAL_COLS = ["frp", "acq_date", "acq_time", "satellite"]
MOCK_PATH = Path(__file__).parent / "mock_hotspots.json"


# ── In-memory cache ───────────────────────────────────────────────────────────
@dataclass
class _Cache:
    records: list[dict] = field(default_factory=list)
    fetched_at: float = 0.0          # Unix timestamp of last successful fetch
    source: str = "none"             # "nasa" | "mock"

    def is_fresh(self) -> bool:
        return bool(self.records) and (time.time() - self.fetched_at) < CACHE_TTL

    def store(self, records: list[dict], source: str) -> None:
        self.records = records
        self.fetched_at = time.time()
        self.source = source

    def age_seconds(self) -> int:
        return int(time.time() - self.fetched_at) if self.fetched_at else -1


_cache = _Cache()


# ── App & CORS ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Wildfire Hotspot Monitor API",
    description=(
        "Fetches NASA FIRMS active fire data, cleans it with Pandas, "
        "normalises brightness to [0,1], caches results for 5 minutes, "
        "and falls back to mock data when NASA is unavailable."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_ORIGIN,
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


# ── Helper: load mock fallback ────────────────────────────────────────────────
def _load_mock() -> list[dict]:
    """Read mock_hotspots.json from disk."""
    logger.warning("⚠  Falling back to local mock_hotspots.json")
    with open(MOCK_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ── Helper: Pandas clean + normalise pipeline ─────────────────────────────────
def _clean_and_normalise(df: pd.DataFrame) -> list[dict]:
    """
    Clean a raw NASA FIRMS dataframe:
      1. Assert required columns exist.
      2. Coerce all fields to numeric (map string confidence labels first).
      3. Drop rows missing lat / lon / brightness.
      4. Min-max normalise brightness → brightness_normalized ∈ [0, 1].
      5. Round values for compact JSON payload.
    Returns a list of dicts ready for JSON serialisation.
    """
    # 1. Column check
    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        raise ValueError(f"NASA CSV is missing required columns: {missing}")

    df = df[list(REQUIRED_COLS)].copy()

    # 2. Type coercion
    df["latitude"]   = pd.to_numeric(df["latitude"],   errors="coerce")
    df["longitude"]  = pd.to_numeric(df["longitude"],  errors="coerce")
    df["brightness"] = pd.to_numeric(df["brightness"], errors="coerce")

    # VIIRS/MODIS confidence: integer 0-100 OR string 'low'/'nominal'/'high'
    _conf_labels = {"low": 30.0, "nominal": 60.0, "high": 90.0}
    df["confidence"] = df["confidence"].apply(
        lambda v: _conf_labels.get(
            str(v).strip().lower(),
            pd.to_numeric(v, errors="coerce"),
        )
    )
    df["confidence"] = pd.to_numeric(df["confidence"], errors="coerce").fillna(50.0)

    # 3. Drop invalid rows
    df.dropna(subset=["latitude", "longitude", "brightness"], inplace=True)
    if df.empty:
        raise ValueError("No valid hotspot rows remain after cleaning.")

    # 4. Min-max normalise brightness → [0, 1]
    b_min, b_max = float(df["brightness"].min()), float(df["brightness"].max())
    if b_max > b_min:
        df["brightness_normalized"] = (df["brightness"] - b_min) / (b_max - b_min)
    else:
        df["brightness_normalized"] = 1.0

    # 5. Round for compact payload
    df["latitude"]             = df["latitude"].round(5)
    df["longitude"]            = df["longitude"].round(5)
    df["brightness"]           = df["brightness"].round(2)
    df["brightness_normalized"]= df["brightness_normalized"].round(4)
    df["confidence"]           = df["confidence"].round(1)

    # 6. Attach optional enrichment columns when present in the source CSV
    present_optional = [c for c in OPTIONAL_COLS if c in df.columns]
    if "frp" in present_optional:
        df["frp"] = pd.to_numeric(df["frp"], errors="coerce").round(2)
    output_cols = list(REQUIRED_COLS) + ["brightness_normalized"] + present_optional

    logger.info(
        f"✓  Pipeline complete: {len(df):,} hotspots | "
        f"brightness [{b_min:.1f} – {b_max:.1f} K] | "
        f"enrichment: {present_optional or 'none'}"
    )
    return df[output_cols].to_dict(orient="records")


# ── Core data fetch (with cache) ──────────────────────────────────────────────
async def _fetch_hotspots() -> tuple[list[dict], str]:
    """
    Return (records, source) where source is 'nasa' or 'mock'.
    Serves from in-memory cache if still fresh.
    """
    # Cache hit
    if _cache.is_fresh():
        logger.info(
            f"↩  Cache hit — {len(_cache.records):,} records "
            f"({_cache.age_seconds()}s old, TTL {CACHE_TTL}s)"
        )
        return _cache.records, _cache.source

    # Cache miss — fetch from NASA
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=5.0, pool=5.0),
            follow_redirects=True,
        ) as client:
            logger.info(f"→  GET {NASA_FIRMS_URL}")
            resp = await client.get(
                NASA_FIRMS_URL,
                headers={"User-Agent": "WildfireHotspotMonitor/2.0 (open-source research)"},
            )

        if resp.status_code == 403:
            logger.warning("✗  NASA FIRMS → 403 Forbidden")
            raise httpx.HTTPStatusError("403", request=resp.request, response=resp)

        if resp.status_code != 200:
            logger.warning(f"✗  NASA FIRMS → HTTP {resp.status_code}")
            raise httpx.HTTPStatusError(
                str(resp.status_code), request=resp.request, response=resp
            )

        df = pd.read_csv(StringIO(resp.text))
        logger.info(f"↓  Received {len(df):,} raw rows from NASA FIRMS")

        records = _clean_and_normalise(df)
        _cache.store(records, "nasa")
        return records, "nasa"

    except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.RequestError) as exc:
        logger.error(f"✗  NASA fetch failed: {exc!r}")

    except ValueError as exc:
        logger.error(f"✗  Data cleaning error: {exc}")

    except Exception as exc:
        logger.error(f"✗  Unexpected error: {exc!r}")

    # Fallback
    mock = _load_mock()
    _cache.store(mock, "mock")
    return mock, "mock"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"], summary="Liveness probe")
async def health():
    """Returns service status and cache metadata."""
    return {
        "status": "ok",
        "service": "wildfire-hotspot-monitor-api",
        "version": "2.0.0",
        "cache": {
            "records": len(_cache.records),
            "source": _cache.source,
            "age_seconds": _cache.age_seconds(),
            "ttl_seconds": CACHE_TTL,
            "is_fresh": _cache.is_fresh(),
        },
    }


@app.get(
    "/api/hotspots",
    tags=["Hotspots"],
    summary="All active fire hotspots",
    response_description=(
        "JSON array of hotspot objects. Each has: "
        "latitude, longitude, brightness (Kelvin), "
        "brightness_normalized [0–1], confidence [0–100]. "
        "Metadata fields: source ('nasa'|'mock'), cached_at (Unix ts)."
    ),
)
async def get_hotspots():
    """
    **Fetch → Clean → Normalise → Cache → Serve**

    - Downloads MODIS C6.1 global 7-day CSV from NASA FIRMS.
    - Cleans and normalises via a Pandas pipeline.
    - Results are cached in memory for `CACHE_TTL` seconds (default 300 s).
    - On HTTP 403, timeout, or any error → graceful fallback to `mock_hotspots.json`.
    """
    records, source = await _fetch_hotspots()
    return JSONResponse(content={
        "source": source,
        "cached_at": _cache.fetched_at,
        "count": len(records),
        "data": records,
    })


@app.get(
    "/api/hotspots/stats",
    tags=["Hotspots"],
    summary="Aggregate statistics on the current hotspot dataset",
)
async def get_hotspot_stats():
    """
    Returns aggregate statistics computed from the current (cached) dataset:
    - `total` — total hotspot count
    - `high_confidence` — count with confidence ≥ 70
    - `avg_brightness` — mean raw brightness in Kelvin
    - `max_brightness` — peak brightness in Kelvin
    - `avg_brightness_normalized` — mean normalised brightness
    - `source` — 'nasa' or 'mock'
    """
    records, source = await _fetch_hotspots()

    if not records:
        return JSONResponse(content={
            "total": 0,
            "high_confidence": 0,
            "avg_brightness": None,
            "max_brightness": None,
            "avg_brightness_normalized": None,
            "source": source,
        })

    df = pd.DataFrame(records)

    stats = {
        "total": len(df),
        "high_confidence": int((df["confidence"] >= 70).sum()),
        "avg_brightness": round(float(df["brightness"].mean()), 2),
        "max_brightness": round(float(df["brightness"].max()), 2),
        "avg_brightness_normalized": round(float(df["brightness_normalized"].mean()), 4),
        "source": source,
        "cached_at": _cache.fetched_at,
    }
    return JSONResponse(content=stats)


@app.get(
    "/api/hotspots/region",
    tags=["Hotspots"],
    summary="Hotspots filtered by a geographic bounding box",
    response_description=(
        "Subset of hotspot records within the requested bounding box."
    ),
)
async def get_hotspots_by_region(
    min_lat: float = Query(..., ge=-90,  le=90,  description="Southern latitude bound"),
    max_lat: float = Query(..., ge=-90,  le=90,  description="Northern latitude bound"),
    min_lon: float = Query(..., ge=-180, le=180, description="Western longitude bound"),
    max_lon: float = Query(..., ge=-180, le=180, description="Eastern longitude bound"),
):
    """
    Filter hotspots by a bounding box.

    Example: `/api/hotspots/region?min_lat=-20&max_lat=10&min_lon=-75&max_lon=-45`
    returns hotspots in the Amazon basin.
    """
    if min_lat >= max_lat:
        raise HTTPException(
            status_code=422, detail="min_lat must be strictly less than max_lat."
        )
    if min_lon >= max_lon:
        raise HTTPException(
            status_code=422, detail="min_lon must be strictly less than max_lon."
        )

    records, source = await _fetch_hotspots()

    if not records:
        return JSONResponse(content={"source": source, "count": 0, "data": []})

    df = pd.DataFrame(records)
    mask = (
        (df["latitude"]  >= min_lat) & (df["latitude"]  <= max_lat) &
        (df["longitude"] >= min_lon) & (df["longitude"] <= max_lon)
    )
    filtered = df[mask].to_dict(orient="records")

    logger.info(
        f"  Region [{min_lat},{max_lat}] × [{min_lon},{max_lon}] → "
        f"{len(filtered)} / {len(records)} hotspots"
    )
    return JSONResponse(content={
        "source": source,
        "count": len(filtered),
        "bbox": {
            "min_lat": min_lat, "max_lat": max_lat,
            "min_lon": min_lon, "max_lon": max_lon,
        },
        "data": filtered,
    })


# ── Dev entry-point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=BACKEND_PORT, reload=True)
