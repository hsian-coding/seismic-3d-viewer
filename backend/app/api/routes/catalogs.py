import hashlib
import math
from typing import Optional, Sequence

import anyio
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import StreamingResponse

from backend.app.api.dependencies import get_catalog_repository
from backend.app.repositories.catalogs import CatalogRepository
from backend.app.schemas.catalog import CatalogListResponse, CatalogStatsResponse, ProfileRequest
from backend.app.services.arrow_stream import ARROW_STREAM_MEDIA_TYPE


router = APIRouter(prefix="/catalogs", tags=["catalogs"])


def not_found(error: FileNotFoundError) -> HTTPException:
    return HTTPException(status_code=404, detail="Catalog '{}' was not found".format(error.args[0]))


def cache_headers(catalog_id: str, sql: str, parameters: Sequence[object]) -> dict:
    fingerprint = hashlib.sha256((catalog_id + sql + repr(tuple(parameters))).encode("utf-8")).hexdigest()[:24]
    return {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        "ETag": '"{}"'.format(fingerprint),
        "X-Catalog-Id": catalog_id,
    }


def tile_bounds(zoom: int, x: int, y: int):
    scale = 2 ** zoom
    longitude_left = x / scale * 360.0 - 180.0
    longitude_right = (x + 1) / scale * 360.0 - 180.0
    latitude_top = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / scale))))
    latitude_bottom = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / scale))))
    return longitude_left, longitude_right, latitude_bottom, latitude_top


@router.get("", response_model=CatalogListResponse)
async def list_catalogs(repository: CatalogRepository = Depends(get_catalog_repository)):
    catalogs = await anyio.to_thread.run_sync(repository.list_catalogs)
    return {"catalogs": catalogs}


@router.get("/{catalog_id}/events")
async def events(
    catalog_id: str,
    min_longitude: Optional[float] = Query(default=None, ge=-180, le=180),
    max_longitude: Optional[float] = Query(default=None, ge=-180, le=180),
    min_latitude: Optional[float] = Query(default=None, ge=-90, le=90),
    max_latitude: Optional[float] = Query(default=None, ge=-90, le=90),
    min_magnitude: Optional[float] = None,
    max_depth_km: Optional[float] = Query(default=None, ge=0),
    start_time_ms: Optional[int] = None,
    end_time_ms: Optional[int] = None,
    limit: int = Query(default=250_000, ge=1, le=1_000_000),
    repository: CatalogRepository = Depends(get_catalog_repository),
):
    try:
        sql, parameters = repository.event_sql(
            catalog_id, limit,
            min_longitude=min_longitude, max_longitude=max_longitude,
            min_latitude=min_latitude, max_latitude=max_latitude,
            min_magnitude=min_magnitude, max_depth_km=max_depth_km,
            start_time_ms=start_time_ms, end_time_ms=end_time_ms,
        )
    except FileNotFoundError as error:
        raise not_found(error)
    return StreamingResponse(
        repository.stream_query(sql, parameters),
        media_type=ARROW_STREAM_MEDIA_TYPE,
        headers=cache_headers(catalog_id, sql, parameters),
    )


@router.post("/{catalog_id}/profiles")
async def profile(
    catalog_id: str,
    request: ProfileRequest,
    repository: CatalogRepository = Depends(get_catalog_repository),
):
    try:
        sql, parameters = repository.profile_sql(catalog_id, request.model_dump())
    except FileNotFoundError as error:
        raise not_found(error)
    return StreamingResponse(
        repository.stream_query(sql, parameters),
        media_type=ARROW_STREAM_MEDIA_TYPE,
        headers=cache_headers(catalog_id, sql, parameters),
    )


@router.get("/{catalog_id}/tiles/{zoom}/{x}/{y}")
async def tile(
    catalog_id: str,
    zoom: int = Path(ge=0, le=18),
    x: int = Path(ge=0),
    y: int = Path(ge=0),
    limit: int = Query(default=250_000, ge=1, le=1_000_000),
    repository: CatalogRepository = Depends(get_catalog_repository),
):
    scale = 2 ** zoom
    if x >= scale or y >= scale:
        raise HTTPException(status_code=422, detail="Tile coordinates are outside this zoom level")
    bounds = tile_bounds(zoom, x, y)
    try:
        sql, parameters = repository.tile_sql(catalog_id, zoom, *bounds, limit)
    except FileNotFoundError as error:
        raise not_found(error)
    return StreamingResponse(
        repository.stream_query(sql, parameters),
        media_type=ARROW_STREAM_MEDIA_TYPE,
        headers={**cache_headers(catalog_id, sql, parameters), "X-LOD": "raw" if zoom >= 7 else "aggregate"},
    )


@router.get("/{catalog_id}/stats", response_model=CatalogStatsResponse)
async def stats(catalog_id: str, repository: CatalogRepository = Depends(get_catalog_repository)):
    try:
        return await anyio.to_thread.run_sync(repository.stats, catalog_id)
    except FileNotFoundError as error:
        raise not_found(error)
