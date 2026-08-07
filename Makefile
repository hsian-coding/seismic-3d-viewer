.PHONY: setup dev frontend backend build check test clean

setup:
	./scripts/setup.sh

dev:
	./scripts/dev.sh all

frontend:
	./scripts/dev.sh frontend

backend:
	./scripts/dev.sh backend

build:
	npm run build

check:
	./scripts/check.sh

test:
	.venv/bin/python -m unittest discover backend/tests

clean:
	find backend -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf frontend/dist
