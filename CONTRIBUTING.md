# Contributing

Thank you for improving TECTON. Keep changes focused, testable, and explicit about scientific assumptions.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Run `npm run setup` once.
3. Start both applications with `npm run dev`, or run one side with `npm run dev:frontend` or `npm run dev:backend`.
4. Run `npm run check` before opening a pull request.
5. Include screenshots for UI changes and representative query timings for performance changes.

## Project conventions

- Frontend code is organized by feature under `frontend/src/features`.
- Keep reusable UI outside feature folders only when it has multiple consumers.
- FastAPI routes validate and translate HTTP requests; DuckDB SQL belongs in repositories; Arrow serialization belongs in services.
- Do not use Python row loops for catalog-scale transformations.
- Add schema-version notes when changing Arrow or Parquet columns.
- Synthetic test data is welcome. Do not commit proprietary or sensitive seismic catalogs.

## Pull requests

Explain the problem, the chosen tradeoff, and how the change was validated. Breaking API changes require a migration note and a versioned endpoint or schema transition.
