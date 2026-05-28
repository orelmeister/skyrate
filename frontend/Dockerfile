# syntax=docker/dockerfile:1.6
# Frontend: Next.js 14 (App Router) on Node 20
# Multi-stage with deps cached separately from build, so:
#   - changing only app code   -> skip "deps" stage, just rebuild
#   - changing package-lock.json -> reinstall deps
ARG NODE_VERSION=20-alpine

# --- Stage 1: install deps (cached by package-lock.json) ---
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Use ci for deterministic installs and BuildKit-friendly caching.
RUN npm ci --include=dev

# --- Stage 2: build (re-runs whenever code changes) ---
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js bakes NEXT_PUBLIC_* into the bundle at build time.
# DO App Platform passes BUILD_TIME envs as docker build --build-arg automatically.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_VAPID_KEY
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_PERF_V2_ENABLED
ARG COMPLIANCE_USE_AGENTS
ARG COMPLIANCE_USE_PRO
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_VAPID_KEY=${NEXT_PUBLIC_VAPID_KEY} \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID} \
    NEXT_PUBLIC_PERF_V2_ENABLED=${NEXT_PUBLIC_PERF_V2_ENABLED} \
    COMPLIANCE_USE_AGENTS=${COMPLIANCE_USE_AGENTS} \
    COMPLIANCE_USE_PRO=${COMPLIANCE_USE_PRO} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# --- Stage 3: runner (lean image, only what `next start` needs) ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Copy the built app + minimal runtime files.
# We're not using `output: 'standalone'` (commented out in next.config.js)
# so we need full node_modules + .next at runtime.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

# DO App Platform overrides this with `run_command` from the spec.
CMD ["npm", "start"]
