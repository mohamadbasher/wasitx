# syntax=docker/dockerfile:1.7
# API image: build the workspace, then ship only the API's production dependency closure.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @wasitx/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @wasitx/shared build && pnpm --filter @wasitx/api build
# dist/ already contains the compiled Prisma client (src/generated is part of the tsc build).
RUN pnpm deploy --filter @wasitx/api --prod --legacy /out && cp -r apps/api/dist apps/api/prisma apps/api/prisma.config.ts /out/

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 wasitx
COPY --from=build --chown=wasitx /out /app
USER wasitx
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations run as a separate release step (see docs/DEPLOYMENT.md), never on every container start.
CMD ["node", "dist/main.js"]
