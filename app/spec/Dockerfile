FROM node:alpine3.12

WORKDIR /work

RUN npm list --depth=0 -g
RUN npm install -g redoc-cli

COPY swagger.yaml .
RUN redoc-cli bundle swagger.yaml -o spec.html
