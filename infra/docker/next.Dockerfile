# syntax=docker/dockerfile:1.7
# Shared image recipe for the Next.js apps. Build with: --build-arg APP=web  (or APP=admin)
# NEXT_PUBLIC_* values are inlined at build time, so build one image per environment.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP=web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_BRAND_NAME="WASIT X"
ARG NEXT_PUBLIC_DEFAULT_LOCALE=ar
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages packages
COPY apps/${APP} apps/${APP}
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@wasitx/${APP}..."
RUN pnpm --filter @wasitx/shared build && pnpm --filter "@wasitx/${APP}" build

FROM node:24-bookworm-slim AS runtime
ARG APP=web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
RUN useradd --system --uid 10001 wasitx
COPY --from=build --chown=wasitx /repo /repo
USER wasitx
WORKDIR /repo/apps/${APP}
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
