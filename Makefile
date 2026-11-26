.DEFAULT_GOAL := package

.PHONY: install dev package single preview clean

install: node_modules

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

dev: install
	npm run dev

package: install
	npm run build

single: install
	npm run build:single

preview: package
	npm run preview

clean:
	rm -rf dist
