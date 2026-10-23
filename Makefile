# The quality gate is `make check`; `make doc` refreshes docs/generated.
.PHONY: install check lint typecheck test doc dev deploy clean

install:
	npm install

check: lint typecheck test

lint:
	npx biome check .

typecheck:
	npx tsc -b

test:
	npx vitest run

doc: typecheck
	node scripts/doc.ts

dev:
	npm run dev

deploy:
	npm run deploy

clean:
	rm -rf packages/*/build
