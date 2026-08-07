import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional

import duckdb
import polars as pl

from backend.app.core.config import get_settings


CATALOG_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")


def first_present(columns: Iterable[str], *candidates: str) -> Optional[str]:
    available = {column.lower(): column for column in columns}
    return next((available[name] for name in candidates if name in available), None)


def sql_string(value: Path) -> str:
    return "'{}'".format(str(value.resolve()).replace("'", "''"))


def ingest_csv(source: Path, catalog_id: str, replace: bool = False) -> Dict[str, object]:
    settings = get_settings()
    if not CATALOG_ID.fullmatch(catalog_id):
        raise ValueError("catalog_id must contain only letters, numbers, '_' or '-'")
    if not source.is_file():
        raise FileNotFoundError(source)

    target = settings.data_dir / catalog_id
    if target.exists() and not replace:
        raise FileExistsError("Catalog already exists; pass --replace to rebuild it")
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)

    scan = pl.scan_csv(source, infer_schema_length=10_000, ignore_errors=False)
    schema = scan.collect_schema()
    columns = schema.names()
    longitude = first_present(columns, "longitude", "lon")
    latitude = first_present(columns, "latitude", "lat")
    depth = first_present(columns, "depth_km", "depthkm", "depth")
    magnitude = first_present(columns, "magnitude", "mag")
    timestamp = first_present(columns, "timestamp_ms", "timestamp", "time", "date")
    event_id = first_present(columns, "event_id", "id")
    place = first_present(columns, "place", "location")
    quality = first_present(columns, "quality")
    missing = [name for name, value in {
        "longitude": longitude, "latitude": latitude, "depth": depth,
        "magnitude": magnitude, "timestamp": timestamp,
    }.items() if value is None]
    if missing:
        raise ValueError("Missing required columns: {}".format(", ".join(missing)))

    timestamp_dtype = schema[timestamp]
    if timestamp_dtype.is_numeric():
        timestamp_expression = pl.col(timestamp).cast(pl.Int64, strict=False)
    else:
        timestamp_expression = (
            pl.col(timestamp).cast(pl.String).str.to_datetime(strict=False, time_zone="UTC").dt.epoch("ms")
        )

    normalized = scan.select(
        (
            pl.col(event_id).cast(pl.String)
            if event_id else pl.int_range(1, pl.len() + 1).cast(pl.String)
        ).alias("event_id"),
        pl.col(longitude).cast(pl.Float64, strict=False).alias("longitude"),
        pl.col(latitude).cast(pl.Float64, strict=False).alias("latitude"),
        pl.col(depth).cast(pl.Float32, strict=False).alias("depth_km"),
        pl.col(magnitude).cast(pl.Float32, strict=False).alias("magnitude"),
        timestamp_expression.alias("timestamp_ms"),
        (pl.col(place).cast(pl.String) if place else pl.lit("")).alias("place"),
        (pl.col(quality).cast(pl.Float32, strict=False) if quality else pl.lit(1.0, dtype=pl.Float32)).alias("quality"),
    ).drop_nulls(["longitude", "latitude", "depth_km", "magnitude", "timestamp_ms"]).with_columns(
        pl.from_epoch("timestamp_ms", time_unit="ms").dt.year().alias("year"),
        pl.from_epoch("timestamp_ms", time_unit="ms").dt.month().alias("month"),
    ).sort(["timestamp_ms", "longitude", "latitude"])

    temporary = settings.data_dir / ".{}.normalized.parquet".format(catalog_id)
    try:
        normalized.sink_parquet(temporary, compression="zstd")
        connection = duckdb.connect(database=":memory:")
        try:
            connection.execute(
                "COPY (SELECT * FROM read_parquet({source})) TO {target} "
                "(FORMAT PARQUET, PARTITION_BY (year, month), COMPRESSION ZSTD, "
                "ROW_GROUP_SIZE 100000, OVERWRITE_OR_IGNORE TRUE)".format(
                    source=sql_string(temporary), target=sql_string(target)
                )
            )
            parquet_glob = str(target / "**" / "*.parquet").replace("'", "''")
            row = connection.execute(
                "SELECT count(*), min(timestamp_ms), max(timestamp_ms), "
                "min(longitude), max(longitude), min(latitude), max(latitude) "
                "FROM read_parquet('{}', hive_partitioning = true)".format(parquet_glob)
            ).fetchone()
        finally:
            connection.close()
    finally:
        temporary.unlink(missing_ok=True)

    manifest = {
        "catalog_id": catalog_id,
        "row_count": row[0],
        "min_timestamp_ms": row[1],
        "max_timestamp_ms": row[2],
        "min_longitude": row[3],
        "max_longitude": row[4],
        "min_latitude": row[5],
        "max_latitude": row[6],
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_file": source.name,
    }
    with (target / "manifest.json").open("w", encoding="utf-8") as manifest_file:
        json.dump(manifest, manifest_file, indent=2)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize a seismic CSV into partitioned Parquet")
    parser.add_argument("source", type=Path)
    parser.add_argument("catalog_id")
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    manifest = ingest_csv(args.source, args.catalog_id, replace=args.replace)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
