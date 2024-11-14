# Build stage
FROM --platform=$BUILDPLATFORM node:lts-alpine AS frontend-build

# Install build dependencies
RUN apk update && \
    apk add --no-cache \
    build-base \
    chromium \
    curl \
    python3 \
    git

WORKDIR /highlight

# Copy configuration files
COPY .npmignore .prettierrc .prettierignore graphql.config.js tsconfig.json turbo.json .yarnrc.yml package.json yarn.lock ./
COPY .yarn/patches ./.yarn/patches
COPY .yarn/releases ./.yarn/releases

# Copy all package.json files for the monorepo
COPY docs-content/package.json ./docs-content/
COPY e2e/package.json ./e2e/
COPY frontend/package.json ./frontend/
COPY highlight.io/package.json ./highlight.io/
COPY opentelemetry-sdk-workers/packages/opentelemetry-sdk-workers/package.json ./opentelemetry-sdk-workers/packages/opentelemetry-sdk-workers/
COPY packages/*/package.json ./packages/
COPY render/package.json ./render/
COPY rrweb/package.json ./rrweb/
COPY scripts/package.json ./scripts/
COPY sdk/*/package.json ./sdk/
COPY sourcemap-uploader/package.json ./sourcemap-uploader/

# Install dependencies
RUN yarn install --immutable --frozen-lockfile

# Copy source files
COPY backend/private-graph ./backend/private-graph
COPY backend/public-graph ./backend/public-graph
COPY blog-content ./blog-content
COPY docs-content ./docs-content
COPY e2e ./e2e
COPY frontend ./frontend
COPY highlight.io ./highlight.io
COPY opentelemetry-sdk-workers ./opentelemetry-sdk-workers
COPY packages ./packages
COPY render ./render
COPY rrweb ./rrweb
COPY scripts ./scripts
COPY sdk ./sdk
COPY sourcemap-uploader ./sourcemap-uploader

# Build frontend
ARG NODE_OPTIONS="--max-old-space-size=16384 --openssl-legacy-provider"
RUN yarn build:frontend

# Production stage
FROM node:lts-alpine AS frontend-prod

WORKDIR /app

# Install serve
RUN yarn global add serve

# Copy built frontend
COPY --from=frontend-build /highlight/frontend/build ./build

# Create serve configuration
RUN echo '{"public":"build","headers":[{"source":"**/*.@(js|css)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]}],"rewrites":[{"source":"/**","destination":"/index.html"}]}' > serve.json

# Environment variables that will be populated by Coolify
ENV PORT=3000
ENV REACT_APP_AUTH_MODE=${SERVICE_AUTH_MODE:-password}
ENV REACT_APP_FRONTEND_URI=${SERVICE_FQDN_FRONTEND_3000:-/}
ENV REACT_APP_PRIVATE_GRAPH_URI=${SERVICE_URL_BACKEND_8082:-http://backend:8082}/private
ENV REACT_APP_PUBLIC_GRAPH_URI=${SERVICE_URL_BACKEND_8082:-http://backend:8082}/public
ENV REACT_APP_OTLP_ENDPOINT=${SERVICE_URL_COLLECTOR_4318:-http://collector:4318}
ENV REACT_APP_DISABLE_ANALYTICS=${DISABLE_ANALYTICS:-false}

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Expose port
EXPOSE 3000

# Start server
CMD ["serve", "-s", "build", "--listen", "3000", "--config", "serve.json"]