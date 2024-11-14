FROM otel/opentelemetry-collector-contrib:latest

# We only need the collector config
COPY collector.yml /etc/otel-collector-config.yaml

# Health check for Coolify
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4318/health || exit 1

CMD ["--config=/etc/otel-collector-config.yaml"]