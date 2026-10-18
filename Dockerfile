# Production image of the app, built by GitHub Actions and run on the server (see deploy/).
# Locally only Postgres runs in Docker: see compose.yaml.

ARG NODE_IMAGE=node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66

FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN npm install --global --no-fund --no-audit pnpm@12.10.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
# next build loads the database module, which needs settings to exist; pages read data
# only at request time, so nothing connects. These stay in this stage, not in the image.
RUN POSTGRES_USER=build POSTGRES_PASSWORD=build POSTGRES_DB=build pnpm build
# Migrations and test data run inside the image, which has no dev dependencies
RUN pnpm exec esbuild src/db/migrate.ts src/db/seed.ts \
    --bundle --platform=node --target=node24 --format=cjs \
    --outdir=db-scripts --out-extension:.js=.cjs

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/db-scripts ./db-scripts
# Last, so a new commit only changes this layer
ARG APP_COMMIT=unknown
ENV APP_COMMIT=${APP_COMMIT}
USER node
EXPOSE 3000
CMD ["node", "server.js"]
