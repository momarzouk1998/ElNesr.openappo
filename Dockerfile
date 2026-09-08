# ========================================
# Multi-stage Dockerfile for EL NESR
# Pattern from mazaya-system (2GB server optimized)
# ========================================

# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm ci --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1280"
# Dummy DATABASE_URL so prisma generate + next build succeed without a real DB
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV JWT_SECRET="dummy-secret-for-build"
ENV NEXT_PUBLIC_SITE_URL="https://elnesr.openappo.com"
ENV NEXT_PUBLIC_APP_NAME="شركة النسر للأدوات الكهربائية"
RUN npx prisma generate && npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=512"

RUN apk add --no-cache openssl libc6-compat

RUN addgroup --system --gid 1001 nodejs ; adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Push schema (idempotent) then start
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --accept-data-loss 2>&1 | tail -5; HOSTNAME=0.0.0.0 node server.js"]
