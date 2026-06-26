# Stage 1: Build (React SPA + esbuild server bundle)
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

COPY package.json pnpm-lock.yaml ./
# Copy patches dir if it exists (pnpm patched deps)
COPY patches/ patches/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Runtime — lean image, production deps only
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

COPY package.json pnpm-lock.yaml ./
COPY patches/ patches/
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# OHIF viewer static site (pre-built via scripts/build-ohif.sh, committed to repo)
# This is NOT built inside Docker — it's 245MB and takes 20+ minutes to build
COPY ohif-dist ./ohif-dist
COPY scripts/ohif-config.js ./scripts/ohif-config.js

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
