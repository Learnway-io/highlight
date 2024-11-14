# Comprehensive Guide to Creating Docker Compose Files for Coolify

## Table of Contents
1. Basic Structure and Version
2. Environment Variables and Magic Variables
3. Service Configuration
4. Storage Management
5. Health Checks
6. Networking
7. Best Practices
8. Common Patterns and Examples

## 1. Basic Structure and Version

Always start with a proper version declaration:
```yaml
version: '3.8'

services:
  # services go here
volumes:
  # volume definitions here
```

## 2. Environment Variables and Magic Variables

### 2.1 Basic Environment Variables
```yaml
services:
  myapp:
    environment:
      - STATIC_VALUE=hello                    # Hardcoded, won't show in UI
      - DYNAMIC_VALUE=${UI_VARIABLE}          # Shows in UI, uninitialized
      - DEFAULT_VALUE=${UI_VARIABLE:-hello}   # Shows in UI with default value
```

### 2.2 Coolify Magic Variables
Magic variable pattern: `SERVICE_<TYPE>_<IDENTIFIER>`

Types available:
- **FQDN**: Generates a Fully Qualified Domain Name
- **URL**: Generates URL based on defined FQDN
- **USER**: Generates random 16-character string
- **PASSWORD**: Generates password without symbols
- **PASSWORD_64**: Generates 64-character password
- **BASE64**: Generates random 32-character string (also BASE64_64, BASE64_128)
- **REALBASE64**: Base64 encoded random string (also REALBASE64_64, REALBASE64_128)

Example:
```yaml
services:
  webapp:
    environment:
      # Basic FQDN
      - SERVICE_FQDN_WEBAPP=/api
      # FQDN with port
      - SERVICE_FQDN_WEBAPP_3000
      # Password generation
      - DB_PASSWORD=${SERVICE_PASSWORD_DB}
      - API_KEY=${SERVICE_PASSWORD_64_API}
```

## 3. Service Configuration

### 3.1 Basic Service Setup
```yaml
services:
  webapp:
    image: myapp:latest
    restart: unless-stopped
    environment:
      - SERVICE_FQDN_WEBAPP_3000: ''
```

### 3.2 Health Check Exclusion
```yaml
services:
  migration-service:
    image: migration:latest
    exclude_from_hc: true    # Excludes from health checks
```

## 4. Storage Management

### 4.1 Empty Directory Creation
```yaml
services:
  webapp:
    volumes:
      - type: bind
        source: ./data
        target: /app/data
        is_directory: true    # Coolify will create this directory
```

### 4.2 File with Content
```yaml
services:
  webapp:
    volumes:
      - type: bind
        source: ./config/init.sql
        target: /docker-entrypoint-initdb.d/init.sql
        content: |
          CREATE DATABASE app;
          CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
```

### 4.3 Named Volumes
```yaml
volumes:
  app_data:
    driver: local

services:
  webapp:
    volumes:
      - app_data:/app/data
```

## 5. Health Checks

```yaml
services:
  webapp:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## 6. Networking

### 6.1 Default Networking
- Each stack gets its own network named after resource UUID
- Services within stack can communicate by service name

### 6.2 Predefined Networks
When enabling "Connect to Predefined Network":
- Services can connect to other stacks
- Use `service-name-<uuid>` for cross-stack communication
- Internal DNS behavior changes

## 7. Best Practices

### 7.1 Security
- Use magic variables for sensitive data
- Never hardcode credentials
- Use appropriate variable types for different security needs

### 7.2 Configuration
- Keep service names simple and descriptive
- Use specific image versions
- Define health checks for critical services
- Document environment variables

### 7.3 Storage
- Use named volumes with explicit drivers
- Use bind mounts only when necessary
- Properly manage file permissions

## 8. Common Patterns and Examples

### 8.1 Web Application with Database
```yaml
version: '3.8'

services:
  webapp:
    image: webapp:1.0
    environment:
      - SERVICE_FQDN_WEBAPP_3000
      - DB_USER=${SERVICE_USER_DB}
      - DB_PASS=${SERVICE_PASSWORD_DB}
      - DB_URL=postgresql://${SERVICE_USER_DB}:${SERVICE_PASSWORD_DB}@db:5432/app

  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=${SERVICE_USER_DB}
      - POSTGRES_PASSWORD=${SERVICE_PASSWORD_DB}
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  db_data:
    driver: local
```

### 8.2 API with Redis Cache
```yaml
version: '3.8'

services:
  api:
    image: api:1.0
    environment:
      - SERVICE_FQDN_API_8080
      - REDIS_URL=redis://cache:6379
      - API_KEY=${SERVICE_PASSWORD_64_API}

  cache:
    image: redis:7
    volumes:
      - cache_data:/data

volumes:
  cache_data:
    driver: local
```

## Key Points to Remember

1. Environment Variables:
   - Use `${VAR}` for UI-visible variables
   - Use `${VAR:-default}` for variables with defaults
   - Use magic variables for automated values

2. Storage:
   - Use `is_directory: true` for empty directories
   - Use `content: |` for files with content
   - Always specify volume drivers

3. Health Checks:
   - Use `exclude_from_hc: true` for temporary services
   - Set up meaningful health checks for critical services

4. Networking:
   - Use service names for internal communication
   - Consider implications of "Connect to Predefined Network"
   - Use proper service-name-uuid format for cross-stack communication

5. Security:
   - Use appropriate magic variables for secrets
   - Never hardcode sensitive information
   - Use specific service users where possible

Remember: The goal is to create maintainable, secure, and efficient configurations that work seamlessly with Coolify's infrastructure while following Docker best practices.