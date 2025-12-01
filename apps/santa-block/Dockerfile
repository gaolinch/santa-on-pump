# Multi-stage build for Santa Block backend
# This Dockerfile should be run from the monorepo root with:
# docker build -f apps/santa-block/Dockerfile -t santa-block .

FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json yarn.lock ./
COPY turbo.json ./

# Copy all workspace package.json files for dependency resolution
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY apps/santa-block/package.json ./apps/santa-block/package.json
COPY apps/santa-block/tsconfig.json ./apps/santa-block/tsconfig.json

# Install all dependencies (including workspace dependencies)
RUN yarn install --frozen-lockfile

# Copy shared package source
COPY packages/shared ./packages/shared

# Copy santa-block source
COPY apps/santa-block/src ./apps/santa-block/src

# Build shared package first
WORKDIR /app/packages/shared
RUN yarn build

# Build santa-block
WORKDIR /app/apps/santa-block
RUN yarn build

# Production image
FROM node:22-alpine

WORKDIR /app

# Copy workspace root files
COPY package.json yarn.lock ./

# Copy workspace package.json files
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/santa-block/package.json ./apps/santa-block/package.json

# Install production dependencies only
RUN yarn install --frozen-lockfile --production

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/santa-block/dist ./apps/santa-block/dist

# Copy database schema
COPY --from=builder /app/apps/santa-block/src/database/schema.sql ./apps/santa-block/dist/database/

# Copy entrypoint script
COPY apps/santa-block/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Install postgresql-client for database health checks
RUN apk add --no-cache postgresql-client

# Create data directory
RUN mkdir -p /app/data

# Set working directory to santa-block
WORKDIR /app/apps/santa-block

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3001

# Health check - increased start period for migrations
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health/live', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]

# Run application
CMD ["node", "dist/index.js"]

