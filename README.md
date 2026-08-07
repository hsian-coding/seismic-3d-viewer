# TECTON — Seismic Analysis Workspace

A front-end/back-end separated seismic visualization workspace. React, TypeScript, Three.js, React Three Fiber, and Vite provide the analysis client; FastAPI, Polars, DuckDB, Parquet, and Apache Arrow provide the columnar data service.

## Quick start

```bash
npm run setup          # Install frontend and backend dependencies once
npm run dev            # Run backend and frontend together
```

Run either application independently:

```bash
npm run dev:backend    # http://127.0.0.1:8000
npm run dev:frontend   # http://127.0.0.1:4173
```

Equivalent Make targets are available: `make setup`, `make dev`, `make backend`, and `make frontend`.

## Project structure

```text
seismic-3d-viewer/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # Versioned FastAPI endpoints
│   │   ├── core/             # Settings and application lifecycle
│   │   ├── models/           # Domain models (columnar storage, no ORM required)
│   │   ├── repositories/     # DuckDB queries over Parquet
│   │   ├── schemas/          # Pydantic request/response contracts
│   │   ├── services/         # Arrow IPC serialization
│   │   └── cli/              # Polars ingestion commands
│   ├── data/                 # Generated local catalogs (gitignored)
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── public/models/        # Optional GLTF/OBJ assets
│   └── src/
│       ├── assets/           # Global style system
│       ├── components/       # Shared UI components
│       └── features/seismic-viewer/
│           ├── components/   # Existing Three.js renderer + R3F Canvas
│           ├── hooks/
│           ├── model/        # Data, types, palettes, profile math
│           ├── services/     # Arrow API and worker client
│           ├── store/        # Zustand viewer state
│           └── workers/      # Arrow decoding off the main thread
├── scripts/scaffold_project.sh
├── .github/                   # CI, Dependabot, issue and PR templates
├── docs/                      # Architecture and release preparation
└── BACKEND_PERFORMANCE_PLAN.md
```

The project deliberately does not add an ORM: seismic catalogs are immutable/append-oriented analytical data, so Parquet plus DuckDB is the appropriate persistence/query layer. A relational database can be added later for users, annotations, or saved workspaces.

## Frontend

```bash
npm install --cache .npm-cache
npm run dev:frontend
```

Open `http://localhost:4173`. Vite proxies `/api` to the local FastAPI service.

The current production viewer remains the optimized imperative Three.js implementation. `frontend/src/features/seismic-viewer/components/Canvas.tsx` is a working React Three Fiber foundation for migrating individual layers without forcing a high-risk full rewrite.

## Backend

Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
```

Normalize a catalog into partitioned Parquet:

```bash
python -m backend.app.cli.ingest earthquakes.csv taiwan-regional
```

Start FastAPI:

```bash
npm run dev:backend
```

The API documentation is at `http://127.0.0.1:8000/docs`. Principal endpoints:

- `GET /api/v1/catalogs`
- `GET /api/v1/catalogs/{catalog_id}/events`
- `POST /api/v1/catalogs/{catalog_id}/profiles`
- `GET /api/v1/catalogs/{catalog_id}/tiles/{zoom}/{x}/{y}`
- `GET /api/v1/catalogs/{catalog_id}/stats`
- `GET /api/v1/health`

Event and profile endpoints return `application/vnd.apache.arrow.stream`. The browser worker decodes numerical columns into transferable typed arrays.

## One-command empty skeleton

To create the same directory/file skeleton elsewhere:

```bash
./scripts/scaffold_project.sh my-project
```

The script is idempotent: existing files are preserved because it only creates directories and touches the expected files.

## Verification

```bash
npm run build
npm run check:integrations
npm run check:backend
npm run test:backend
```

See [BACKEND_PERFORMANCE_PLAN.md](BACKEND_PERFORMANCE_PLAN.md) for scaling phases, performance targets, and decision gates.

## Contributing and publishing

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Architecture](docs/architecture.md)
- [Complete development history](DEVELOPMENT_HISTORY.md)
- [Publishing checklist](docs/publishing-checklist.md)
- [Changelog](CHANGELOG.md)

No license has been selected automatically. Choose and add the intended license before presenting the repository as open source.
