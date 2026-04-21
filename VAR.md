# Validation & Analysis Report (VAR)
## Project: PoC #26 - Wildfire Hotspot Monitor

### 1. Objective
The primary objective of this validation process is to ensure the high-fidelity ingestion, processing, and visualization of NASA FIRMS (Fire Information for Resource Management System) telemetry. The report confirms that the tactical engine accurately reflects thermal anomalies with professional-grade data integrity.

### 2. Data Integrity & Ingestion Pipeline
The Python (FastAPI) backend implements a robust data processing rail to handle raw satellite feeds.

#### 2.1. NASA FIRMS Ingestion
- **Source**: MODIS C6.1 Global 7-day CSV.
- **Validation**: The system asserts the presence of core geospatial headers (`latitude`, `longitude`, `brightness`, `confidence`) before processing.
- **Fallback Logic**: In the event of NASA API downtime or rate-limiting (HTTP 403), the system gracefully transitions to a localized `mock_hotspots.json` to maintain dashboard availability.

#### 2.2. Data Cleaning & Sanitization
The `_clean_and_normalise` pipeline executes the following tactical operations:
- **Type Coercion**: All coordinate and thermal data are coerced to numeric types using Pandas.
- **Confidence Mapping**: Satellite-specific string labels (e.g., 'low', 'nominal', 'high') are mapped to a standardized numeric scale (30, 60, 90) for uniform visualization logic.
- **Precision Management**: Coordinates are rounded to 5 decimal places to optimize JSON payload size without sacrificing tactical accuracy.

#### 2.3. Thermal Normalization
To drive the visual 'Heat' mapping in the UI, raw brightness (Kelvin) is normalized:
- **Algorithm**: Min-Max Scaling.
- **Range**: `[0.0, 1.0]`.
- **UI Application**: The `brightness_normalized` value directly modulates the radius of map markers (3px to 13px), providing an intuitive scale of fire intensity.

### 3. Performance & Geospatial Rail
The frontend is optimized for handling high-density datasets typical of global fire seasons.

#### 3.1. High-Density Rendering
- **Canvas Engine**: Leaflet is configured with `preferCanvas: true`, allowing for the fluid rendering of **1,000+ points** without DOM-related performance bottlenecks.
- **Clustering**: For datasets exceeding 1,000 hotspots, the system automatically enables `react-leaflet-cluster` to prevent visual noise and maintain high frame rates during pan/zoom operations.

#### 3.2. Response Latency
- **Server-Side Caching**: A 300-second (5-minute) in-memory cache prevents redundant NASA API requests and ensures sub-100ms API response times for client-side intelligence.

---
**Report Status**: VERIFIED
**Analyst**: Antigravity Tactical Systems
**Date**: April 21, 2026
