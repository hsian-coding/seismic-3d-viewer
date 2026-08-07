from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CatalogLocation:
    catalog_id: str
    directory: Path
    parquet_glob: str
    manifest_path: Path
