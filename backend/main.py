"""Compatibility entry point: uvicorn backend.main:app --reload."""

from backend.app.main import app

__all__ = ["app"]
