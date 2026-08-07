# Seismic Data Backend Performance Plan

> Implementation status: Phases 1–3 now have working project modules. The repository includes Polars ingestion, partitioned Parquet output, DuckDB event/profile/tile queries, Arrow IPC streaming, FastAPI/CORS routes, a browser Arrow client, and transferable typed-array worker decoding. Phase 4 remains an operational scaling phase that requires production traffic and profiling data.

## Target architecture

```text
React + Three.js
  ├─ JSON: catalog metadata, statistics, available ranges
  └─ Arrow IPC stream: event batches, map tiles, profile results
            ↓
       FastAPI service
  ├─ DuckDB: interactive filtering and Parquet predicate pushdown
  ├─ Polars LazyFrame: ingestion, validation, derived columns, batch jobs
  └─ response cache: repeated viewport/profile queries
            ↓
  Partitioned Parquet in local/object storage
```

Use Polars for ingestion and vectorized transformation, and DuckDB for request-time SQL over Parquet. Keep the first version as one FastAPI service; split ingestion into a separate worker only when uploads or continuous feeds begin competing with interactive queries.

## Data contract

Define one stable Arrow schema:

| Column | Type | Notes |
| --- | --- | --- |
| `event_id` | string/dictionary | Stable selection key |
| `longitude`, `latitude` | float32 or float64 | Preserve source accuracy |
| `depth_km`, `magnitude`, `quality` | float32 | Compact GPU-ready values |
| `timestamp_ms` | timestamp[ms, UTC] | Time filtering |
| `place` | dictionary string | Avoid repeated text payloads |
| `x_km`, `y_km` | float32 | Optional precomputed local projection |

Store Parquet with Zstandard compression, partition initially by `year/month`, and sort files by time plus a spatial key. Aim for roughly 100,000–250,000 rows per row group, then tune using measured query latency and file sizes. Avoid very small files.

## API shape

- `GET /v1/catalogs` — lightweight JSON catalog metadata.
- `GET /v1/events` — filters by bounding box, time, magnitude, depth, requested columns, and maximum level of detail; returns `application/vnd.apache.arrow.stream`.
- `POST /v1/profiles` — accepts A/A′ endpoints and corridor width; performs vectorized along-track/perpendicular-distance projection and returns an Arrow stream.
- `GET /v1/tiles/{z}/{x}/{y}` — returns raw events at high zoom and aggregated count/magnitude/depth summaries at low zoom.
- `GET /v1/stats` — cached JSON histogram and summary metrics.

Every data response should include `ETag`, catalog version, row count, query duration, and whether the result is raw or aggregated. Reject unbounded requests or require an explicit row limit.

## Query path

1. Validate query parameters in FastAPI.
2. Build parameterized DuckDB SQL selecting only required columns.
3. Let DuckDB push bounding-box, time, magnitude, and depth predicates into Parquet scans.
4. Apply profile projection with vectorized expressions; never loop over events in Python.
5. Emit Arrow record batches rather than constructing dictionaries and JSON.
6. Decode Arrow in a Web Worker, transfer typed-array buffers to the main thread, and update existing Three.js instanced buffers.

Polars `scan_parquet` and lazy streaming collection should handle ingestion, catalog normalization, derived coordinates, and offline aggregation without loading the complete dataset into memory. DuckDB should own interactive scans and ad hoc grouping unless benchmarks show a specific query is faster in Polars.

## Delivery phases

### Phase 0 — benchmark and budgets

- Capture baseline load time, filter latency, profile latency, payload size, browser memory, and frames per second at 100k, 1M, and 10M events.
- Initial service-level targets: p95 metadata under 100 ms, p95 filtered/profile query under 500 ms when cached data is warm, first Arrow batch under 250 ms, and sustained UI interaction above 45 FPS.

### Phase 1 — Parquet ingestion

- Add a Polars ingestion command that validates source CSV, normalizes units/time zones, calculates spatial keys/local coordinates, sorts, and writes partitioned Parquet.
- Persist a catalog manifest with schema version, bounds, time range, row count, and file checksums.
- Add correctness tests comparing Parquet rows and derived values with the original catalog.

### Phase 2 — FastAPI query service

- Implement catalog, events, profile, and stats endpoints.
- Use one DuckDB connection per worker/process and parameterized queries.
- Run CPU-bound query/serialization work outside the async event loop; stream Arrow batches with cancellation and request timeouts.
- Add structured timing for validation, scan, projection, serialization, bytes, and returned rows.

### Phase 3 — browser integration

- Add an API data-source abstraction while retaining the synthetic/local source for offline development.
- Decode Arrow with Apache Arrow JavaScript inside a Web Worker.
- Use request cancellation, viewport debounce, ETags, an LRU query cache, typed arrays, and transferable buffers.
- Add level-of-detail switching so camera movement requests aggregates and idle/final views request detailed points.

### Phase 4 — scale and operations

- Put Parquet in object storage and add a shared cache only after profiling demonstrates the need.
- Precompute common time histograms and low-zoom spatial tiles.
- Load-test concurrent viewport and profile requests; set worker count from CPU/memory measurements rather than a fixed guess.
- If projection or serialization remains CPU-bound after vectorization, move only that measured hot path to Rust through a Python extension or a dedicated service.

## Decision gates

- Prefer Polars when the workload is a repeatable dataframe pipeline or streaming batch transformation.
- Prefer DuckDB when the workload is selective SQL over many Parquet files, column projection, grouping, or ad hoc filters.
- Keep JSON for small control messages; use Arrow IPC for event-shaped numerical results.
- Consider Rust only after profiling shows Python orchestration, DuckDB, Polars, and Arrow cannot meet the latency or concurrency target.

## Primary references

- [FastAPI custom and streaming responses](https://fastapi.tiangolo.com/advanced/custom-response/)
- [Polars streaming execution](https://docs.pola.rs/user-guide/concepts/streaming/)
- [DuckDB Parquet scans and predicate/projection pushdown](https://duckdb.org/docs/stable/data/parquet/overview)
- [Apache Arrow IPC specification](https://arrow.apache.org/docs/format/Columnar.html#serialization-and-interprocess-communication-ipc)
