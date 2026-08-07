import json
import re
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

import duckdb

from backend.app.core.config import Settings
from backend.app.models.catalog import CatalogLocation
from backend.app.services.arrow_stream import record_batches_to_ipc


CATALOG_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")
EVENT_COLUMNS = "event_id, longitude, latitude, depth_km, magnitude, timestamp_ms, place, quality"


class CatalogRepository:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.settings.data_dir.mkdir(parents=True, exist_ok=True)

    def location(self, catalog_id: str, require_exists: bool = True) -> CatalogLocation:
        if not CATALOG_ID.fullmatch(catalog_id):
            raise ValueError("Invalid catalog id")
        directory = self.settings.data_dir / catalog_id
        if require_exists and not directory.is_dir():
            raise FileNotFoundError(catalog_id)
        return CatalogLocation(
            catalog_id=catalog_id,
            directory=directory,
            parquet_glob=str(directory / "**" / "*.parquet"),
            manifest_path=directory / "manifest.json",
        )

    def list_catalogs(self) -> List[Dict[str, Any]]:
        catalogs: List[Dict[str, Any]] = []
        for manifest_path in sorted(self.settings.data_dir.glob("*/manifest.json")):
            with manifest_path.open("r", encoding="utf-8") as manifest_file:
                catalogs.append(json.load(manifest_file))
        return catalogs

    @staticmethod
    def _parquet_source(location: CatalogLocation) -> str:
        escaped = location.parquet_glob.replace("'", "''")
        return "read_parquet('{}', hive_partitioning = true)".format(escaped)

    @staticmethod
    def _filters(
        min_longitude: Optional[float] = None,
        max_longitude: Optional[float] = None,
        min_latitude: Optional[float] = None,
        max_latitude: Optional[float] = None,
        min_magnitude: Optional[float] = None,
        max_depth_km: Optional[float] = None,
        start_time_ms: Optional[int] = None,
        end_time_ms: Optional[int] = None,
    ) -> Tuple[str, List[Any]]:
        clauses: List[str] = []
        parameters: List[Any] = []
        for column, operator, value in (
            ("longitude", ">=", min_longitude),
            ("longitude", "<=", max_longitude),
            ("latitude", ">=", min_latitude),
            ("latitude", "<=", max_latitude),
            ("magnitude", ">=", min_magnitude),
            ("depth_km", "<=", max_depth_km),
            ("timestamp_ms", ">=", start_time_ms),
            ("timestamp_ms", "<=", end_time_ms),
        ):
            if value is not None:
                clauses.append("{} {} ?".format(column, operator))
                parameters.append(value)
        return (" AND ".join(clauses) if clauses else "TRUE", parameters)

    def event_sql(self, catalog_id: str, limit: int, **filters: Any) -> Tuple[str, Sequence[Any]]:
        location = self.location(catalog_id)
        where_sql, parameters = self._filters(**filters)
        safe_limit = min(max(1, limit), self.settings.max_event_limit)
        sql = "SELECT {} FROM {} WHERE {} ORDER BY timestamp_ms LIMIT {}".format(
            EVENT_COLUMNS, self._parquet_source(location), where_sql, safe_limit
        )
        return sql, parameters

    def profile_sql(self, catalog_id: str, profile: Dict[str, Any]) -> Tuple[str, Sequence[Any]]:
        location = self.location(catalog_id)
        filter_values = {key: profile.get(key) for key in (
            "min_magnitude", "max_depth_km", "start_time_ms", "end_time_ms"
        )}
        where_sql, filter_parameters = self._filters(**filter_values)
        safe_limit = min(max(1, int(profile["limit"])), self.settings.max_event_limit)
        sql = """
            WITH params AS (
              SELECT ?::DOUBLE AS start_lon, ?::DOUBLE AS start_lat,
                     ?::DOUBLE AS end_lon, ?::DOUBLE AS end_lat, ?::DOUBLE AS width_km
            ), scaled AS (
              SELECT *,
                111.32 * cos(radians((start_lat + end_lat) / 2.0)) AS lon_scale
              FROM {source}, params
              WHERE {where_sql}
            ), vectors AS (
              SELECT *,
                (end_lon - start_lon) * lon_scale AS segment_east,
                (end_lat - start_lat) * 111.32 AS segment_north,
                (longitude - start_lon) * lon_scale AS event_east,
                (latitude - start_lat) * 111.32 AS event_north
              FROM scaled
            ), projected AS (
              SELECT *,
                sqrt(segment_east * segment_east + segment_north * segment_north) AS profile_length_km,
                (event_east * segment_east + event_north * segment_north)
                  / nullif(segment_east * segment_east + segment_north * segment_north, 0) AS fraction,
                abs(event_east * segment_north - event_north * segment_east)
                  / nullif(sqrt(segment_east * segment_east + segment_north * segment_north), 0) AS offset_km
              FROM vectors
            )
            SELECT {columns}, fraction * profile_length_km AS along_km, offset_km
            FROM projected
            WHERE fraction BETWEEN 0 AND 1 AND offset_km <= width_km / 2.0
            ORDER BY along_km, depth_km
            LIMIT {limit}
        """.format(source=self._parquet_source(location), where_sql=where_sql, columns=EVENT_COLUMNS, limit=safe_limit)
        parameters = [
            profile["start_longitude"], profile["start_latitude"],
            profile["end_longitude"], profile["end_latitude"], profile["width_km"],
            *filter_parameters,
        ]
        return sql, parameters

    def tile_sql(
        self,
        catalog_id: str,
        zoom: int,
        min_longitude: float,
        max_longitude: float,
        min_latitude: float,
        max_latitude: float,
        limit: int,
    ) -> Tuple[str, Sequence[Any]]:
        location = self.location(catalog_id)
        source = self._parquet_source(location)
        safe_limit = min(max(1, limit), self.settings.max_event_limit)
        parameters: List[Any] = [min_longitude, max_longitude, min_latitude, max_latitude]
        if zoom >= 7:
            sql = (
                "SELECT {columns} FROM {source} "
                "WHERE longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ? "
                "ORDER BY timestamp_ms DESC LIMIT {limit}"
            ).format(columns=EVENT_COLUMNS, source=source, limit=safe_limit)
            return sql, parameters

        grid_size = min(128, max(16, 2 ** (zoom + 1)))
        sql = """
            WITH visible AS (
              SELECT *,
                least({grid_size} - 1, greatest(0, floor((longitude - ?) / nullif(? - ?, 0) * {grid_size})))::INTEGER AS cell_x,
                least({grid_size} - 1, greatest(0, floor((latitude - ?) / nullif(? - ?, 0) * {grid_size})))::INTEGER AS cell_y
              FROM {source}
              WHERE longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?
            )
            SELECT cell_x, cell_y, count(*)::BIGINT AS event_count,
                   avg(longitude)::DOUBLE AS longitude, avg(latitude)::DOUBLE AS latitude,
                   avg(depth_km)::FLOAT AS mean_depth_km,
                   avg(magnitude)::FLOAT AS mean_magnitude,
                   max(magnitude)::FLOAT AS max_magnitude,
                   max(timestamp_ms)::BIGINT AS latest_timestamp_ms
            FROM visible GROUP BY cell_x, cell_y ORDER BY event_count DESC
        """.format(grid_size=grid_size, source=source)
        parameters = [
            min_longitude, max_longitude, min_longitude,
            min_latitude, max_latitude, min_latitude,
            min_longitude, max_longitude, min_latitude, max_latitude,
        ]
        return sql, parameters

    def stream_query(self, sql: str, parameters: Sequence[Any]) -> Iterator[bytes]:
        connection = duckdb.connect(database=":memory:", read_only=False)
        try:
            reader = connection.execute(sql, parameters).fetch_record_batch(self.settings.arrow_batch_size)
            yield from record_batches_to_ipc(reader, reader.schema)
        finally:
            connection.close()

    def stats(self, catalog_id: str) -> Dict[str, Any]:
        location = self.location(catalog_id)
        sql = """
            SELECT count(*)::BIGINT AS event_count,
                   min(magnitude)::DOUBLE AS min_magnitude,
                   max(magnitude)::DOUBLE AS max_magnitude,
                   avg(magnitude)::DOUBLE AS mean_magnitude,
                   avg(depth_km)::DOUBLE AS mean_depth_km
            FROM {}
        """.format(self._parquet_source(location))
        connection = duckdb.connect(database=":memory:", read_only=False)
        try:
            row = connection.execute(sql).fetchone()
        finally:
            connection.close()
        return {
            "catalog_id": catalog_id,
            "event_count": row[0],
            "min_magnitude": row[1],
            "max_magnitude": row[2],
            "mean_magnitude": row[3],
            "mean_depth_km": row[4],
            "metadata": {},
        }
