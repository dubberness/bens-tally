FROM node:24-bookworm-slim AS build
# better-sqlite3 compiles from source when no prebuilt binary matches this Node version.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim

ARG BUILD_SHA=dev
LABEL org.opencontainers.image.title="Ben's Tally" \
      org.opencontainers.image.description="A self-hosted personal finance tracker: month-end snapshots, budget, investments and FIRE." \
      org.opencontainers.image.source="https://github.com/dubberness/bens-tally" \
      org.opencontainers.image.revision="${BUILD_SHA}"

# tini for signal handling, gosu to drop to PUID/PGID the way Unraid expects.
RUN apt-get update && \
    apt-get install -y --no-install-recommends tini gosu tzdata && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data

# BODY_SIZE_LIMIT covers the sheet and CSV imports.
ENV NODE_ENV=production \
    BUILD_SHA=${BUILD_SHA} \
    PUID=99 \
    PGID=100 \
    TZ=Australia/Hobart \
    DATA_DIR=/data \
    MIGRATIONS_DIR=/app/drizzle \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=20M

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "build"]
