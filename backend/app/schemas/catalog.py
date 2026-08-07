from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


class CatalogSummary(BaseModel):
    catalog_id: str
    row_count: int
    min_timestamp_ms: Optional[int] = None
    max_timestamp_ms: Optional[int] = None
    min_longitude: Optional[float] = None
    max_longitude: Optional[float] = None
    min_latitude: Optional[float] = None
    max_latitude: Optional[float] = None
    schema_version: int = 1


class CatalogListResponse(BaseModel):
    catalogs: List[CatalogSummary]


class ProfileRequest(BaseModel):
    start_longitude: float = Field(ge=-180, le=180)
    start_latitude: float = Field(ge=-90, le=90)
    end_longitude: float = Field(ge=-180, le=180)
    end_latitude: float = Field(ge=-90, le=90)
    width_km: float = Field(gt=0, le=500)
    min_magnitude: Optional[float] = None
    max_depth_km: Optional[float] = Field(default=None, ge=0)
    start_time_ms: Optional[int] = None
    end_time_ms: Optional[int] = None
    limit: int = Field(default=250_000, ge=1, le=1_000_000)

    @model_validator(mode="after")
    def validate_trace(self):
        if self.start_longitude == self.end_longitude and self.start_latitude == self.end_latitude:
            raise ValueError("Profile endpoints must be different")
        if self.start_time_ms is not None and self.end_time_ms is not None and self.start_time_ms > self.end_time_ms:
            raise ValueError("start_time_ms must not be after end_time_ms")
        return self


class CatalogStatsResponse(BaseModel):
    catalog_id: str
    event_count: int
    min_magnitude: Optional[float] = None
    max_magnitude: Optional[float] = None
    mean_magnitude: Optional[float] = None
    mean_depth_km: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
