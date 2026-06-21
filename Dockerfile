# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json   ./apps/server/
COPY apps/web/package.json      ./apps/web/
COPY apps/cli/package.json      ./apps/cli/
COPY packages/core/package.json        ./packages/core/
COPY packages/app-hosting/package.json ./packages/app-hosting/
COPY packages/app-store/package.json   ./packages/app-store/
COPY packages/app-files/package.json   ./packages/app-files/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable && corepack prepare --activate \
 && pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm --filter @quick/web build

FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/app.db
ENV PORT=3000

RUN groupadd -r quick && useradd -r -g quick quick \
 && mkdir -p /data && chown -R quick:quick /data /app

COPY --from=build --chown=quick:quick /app/node_modules    ./node_modules
COPY --from=build --chown=quick:quick /app/packages        ./packages
COPY --from=build --chown=quick:quick /app/apps/server     ./apps/server
COPY --from=build --chown=quick:quick /app/apps/web/dist   ./apps/web/dist
COPY --from=build --chown=quick:quick /app/drizzle         ./drizzle
COPY --from=build --chown=quick:quick /app/scripts         ./scripts
COPY --from=build --chown=quick:quick /app/package.json    ./
COPY --chown=quick:quick LICENSE NOTICE ./

USER quick
EXPOSE 3000
VOLUME ["/data"]
CMD ["sh", "-c", "bun ./scripts/migrate.ts && exec bun ./apps/server/src/index.ts"]

FROM deps AS dev
WORKDIR /app
COPY --from=oven/bun:1-slim /usr/local/bin/bun /usr/local/bin/bun
ENV NODE_ENV=development
ENV DATABASE_PATH=/data/app.db
ENV PORT=3000
EXPOSE 3000 5173
VOLUME ["/data"]
CMD ["sh", "-c", "bun ./scripts/migrate.ts && bun run dev"]
