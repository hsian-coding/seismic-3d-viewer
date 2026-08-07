from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.repositories.catalogs import CatalogRepository


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.catalog_repository = CatalogRepository(settings)
    yield


app = FastAPI(title=settings.app_name, version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["ETag", "X-Catalog-Id", "X-LOD", "X-Query-Ms", "X-Row-Count"],
)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {"service": settings.app_name, "docs": "/docs", "health": settings.api_prefix + "/health"}
