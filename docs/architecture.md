# Architecture

## System boundary

```text
Browser
  React workspace
  Three.js / React Three Fiber
  Arrow Web Worker
        │ Arrow IPC / JSON
        ▼
FastAPI
  API validation and CORS
  DuckDB query repository
  Arrow record-batch streaming
        │
        ▼
Partitioned Parquet catalogs
  produced by Polars ingestion
```

## Frontend

`frontend/src/features/seismic-viewer` owns domain UI, rendering, profile mathematics, data access, and viewer state. The existing imperative Three.js renderer remains the production path; the React Three Fiber canvas supports incremental layer migration.

## Backend

- `api`: HTTP contracts and response behavior.
- `schemas`: Pydantic validation.
- `repositories`: parameterized DuckDB queries and Parquet pushdown.
- `services`: Arrow IPC serialization and other cross-query services.
- `cli`: Polars ingestion and catalog materialization.

No ORM is used for seismic events because they are analytical columnar records. A relational store should be introduced separately if mutable entities such as users, annotations, or saved workspaces are added.

## Performance principles

- Filter and project columns at the Parquet scan.
- Return Arrow rather than event-shaped JSON.
- Decode numerical data away from the browser main thread.
- Use map-level aggregation before returning raw points.
- Add Rust only for a measured hot path that remains after vectorization.
