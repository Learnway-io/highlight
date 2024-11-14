FROM --platform=$BUILDPLATFORM golang:alpine AS backend-build

RUN apk update && apk add --no-cache build-base

WORKDIR /highlight
COPY go.work .
COPY go.work.sum .

# Copy all go.mod and go.sum files
COPY backend/go.mod ./backend/go.mod
COPY backend/go.sum ./backend/go.sum
COPY docker/enterprise-public.pem ./enterprise-public.pem
COPY sdk/highlight-go/go.mod ./sdk/highlight-go/go.mod
COPY sdk/highlight-go/go.sum ./sdk/highlight-go/go.sum
COPY sdk/highlightinc-highlight-datasource/go.mod ./sdk/highlightinc-highlight-datasource/go.mod
COPY sdk/highlightinc-highlight-datasource/go.sum ./sdk/highlightinc-highlight-datasource/go.sum
COPY e2e/go/go.mod ./e2e/go/go.mod
COPY e2e/go/go.sum ./e2e/go/go.sum

RUN go work sync
RUN go mod download

# Copy source code
COPY backend ./backend
COPY sdk/highlight-go ./sdk/highlight-go
COPY sdk/highlightinc-highlight-datasource ./sdk/highlightinc-highlight-datasource
COPY e2e/go ./e2e/go

WORKDIR /highlight/backend
ARG TARGETARCH
ARG TARGETOS
RUN export PUBKEY=`cat /highlight/enterprise-public.pem | base64 -w0` GOOS=$TARGETOS GOARCH=$TARGETARCH && \
    go build -ldflags="-X github.com/highlight-run/highlight/backend/env.EnterpriseEnvPublicKey=$PUBKEY" -o /build/backend

# Production stage
FROM alpine:latest AS backend-prod
ARG REACT_APP_COMMIT_SHA
ENV REACT_APP_COMMIT_SHA=$REACT_APP_COMMIT_SHA
ARG RELEASE
ENV RELEASE=$RELEASE

# Add curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /build
COPY --from=backend-build /build/backend /build
COPY --from=backend-build /highlight/backend/clickhouse/migrations/ /build/clickhouse/migrations

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8082/health || exit 1

# Expose port
EXPOSE 8082

CMD ["/build/backend", "-runtime=graph"]