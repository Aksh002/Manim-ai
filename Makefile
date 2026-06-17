SHELL := /bin/bash

.PHONY: up down build logs test-api lint-api test-web lint-web

up:
	docker compose build renderer-image
	docker compose up --build

down:
	docker compose down --remove-orphans

build:
	docker compose build renderer-image
	docker compose build

logs:
	docker compose logs -f --tail=200

test-api:
	docker compose run --rm api pytest -q

lint-api:
	docker compose run --rm api ruff check app

test-web:
	docker compose run --rm web npm run test

lint-web:
	docker compose run --rm web npm run lint
