# The Quadrava runtime as a container image (ADR-20): the built application served by nginx, configured when the
# container starts (environment variables or a mounted runtime-config.json). The consumer never builds Angular.
#
#   docker build -f docker/runtime/Dockerfile -t quadrava-runtime .        (from the root of the repository)
#   docker run -p 8080:8080 quadrava-runtime                                (the demo, with the examples)
#
# The variables are described in docker/runtime/README.md.

FROM node:24-slim AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY examples/ /src/examples/
COPY frontend/ ./
RUN npm run demo:prepare && npx ng build runtime

FROM nginx:1.28-alpine
ARG VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="Quadrava runtime" \
      org.opencontainers.image.description="The Quadrava runtime: screens defined in JSON, from the examples or a registry, behind a BFF" \
      org.opencontainers.image.licenses="MPL-2.0" \
      org.opencontainers.image.source="https://github.com/sramaccini/quadrava" \
      org.opencontainers.image.version="${VERSION}"
COPY --from=build /src/frontend/dist/runtime/browser/ /usr/share/nginx/html/
# The configuration of the build is the demo one: kept aside, the start-up script writes the served one from it.
RUN mv /usr/share/nginx/html/runtime-config.json /usr/share/nginx/runtime-config.default.json \
 && mkdir -p /etc/nginx/quadrava \
 && rm /etc/nginx/conf.d/default.conf
COPY LICENSE NOTICE /usr/share/doc/quadrava/
COPY docker/runtime/nginx.conf /etc/nginx/conf.d/quadrava.conf
COPY docker/runtime/40-quadrava-config.sh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/40-quadrava-config.sh
ENV QUADRAVA_VERSION=${VERSION}
EXPOSE 8080
