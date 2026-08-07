from fastapi import Request

from backend.app.repositories.catalogs import CatalogRepository


def get_catalog_repository(request: Request) -> CatalogRepository:
    return request.app.state.catalog_repository
