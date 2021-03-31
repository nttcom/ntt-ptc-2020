.PHONY: build run

build:
	docker run -it --rm --entrypoint="" -v ${PWD}:/app -w /app node:12.13 bash -c 'npm install && npm run build'

run:
	docker run -it --rm --entrypoint="" -v ${PWD}:/app -w /app -p 8080:8080 node:12.13 bash -c 'npm install && $$(npm bin)/webpack-dev-server --host 0.0.0.0'

place:
	cp dist/index.html ../portal/public/scores.html
	cp dist/bundle.js ../portal/public/bundle.js
