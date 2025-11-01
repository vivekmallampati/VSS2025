# Docker Import Guide

This guide explains how to run the Excel import script using Docker, eliminating the need to install Node.js locally.

## Prerequisites

1. Docker installed on your system ([Download Docker](https://www.docker.com/products/docker-desktop))
2. Firebase service account key file
3. Excel file (`TestData.xlsx`)

## Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Place your service account key** in the project root as `serviceAccountKey.json`

2. **Build and run:**
   ```bash
   docker-compose up --build
   ```

3. **To run again later (no rebuild needed):**
   ```bash
   docker-compose up
   ```

### Option 2: Using Docker directly

1. **Build the Docker image:**
   ```bash
   docker build -t vss2025-import .
   ```

2. **Run the container:**
   ```bash
   docker run --rm \
     -v $(pwd)/serviceAccountKey.json:/app/secrets/serviceAccountKey.json:ro \
     -v $(pwd)/TestData.xlsx:/app/TestData.xlsx:ro \
     vss2025-import
   ```

   **On Windows (PowerShell):**
   ```powershell
   docker run --rm `
     -v ${PWD}/serviceAccountKey.json:/app/secrets/serviceAccountKey.json:ro `
     -v ${PWD}/TestData.xlsx:/app/TestData.xlsx:ro `
     vss2025-import
   ```

   **On Windows (CMD):**
   ```cmd
   docker run --rm -v %cd%/serviceAccountKey.json:/app/secrets/serviceAccountKey.json:ro -v %cd%/TestData.xlsx:/app/TestData.xlsx:ro vss2025-import
   ```

## Custom Configuration

### Using a Different Excel File

**With Docker Compose:**
Edit `docker-compose.yml` and modify the volume mount:
```yaml
volumes:
  - ./YourExcelFile.xlsx:/app/TestData.xlsx:ro
```

**With Docker directly:**
```bash
docker run --rm \
  -v $(pwd)/serviceAccountKey.json:/app/secrets/serviceAccountKey.json:ro \
  -v $(pwd)/YourExcelFile.xlsx:/app/TestData.xlsx:ro \
  vss2025-import
```

Or use environment variable:
```bash
docker run --rm \
  -v $(pwd)/serviceAccountKey.json:/app/secrets/serviceAccountKey.json:ro \
  -v $(pwd)/YourExcelFile.xlsx:/app/YourExcelFile.xlsx:ro \
  -e EXCEL_FILE_PATH=/app/YourExcelFile.xlsx \
  vss2025-import
```

### Using a Different Service Account Key Location

**With Docker Compose:**
Edit `docker-compose.yml`:
```yaml
volumes:
  - /path/to/your/key.json:/app/secrets/serviceAccountKey.json:ro
```

**With Docker directly:**
```bash
docker run --rm \
  -v /path/to/your/key.json:/app/secrets/serviceAccountKey.json:ro \
  -v $(pwd)/TestData.xlsx:/app/TestData.xlsx:ro \
  vss2025-import
```

## Environment Variables

You can set these environment variables:

- `SERVICE_ACCOUNT_PATH`: Path to service account key (default: `./serviceAccountKey.json`)
- `EXCEL_FILE_PATH`: Path to Excel file (default: `TestData.xlsx`)
- `NODE_ENV`: Set to `production` for production mode

**Example:**
```bash
docker run --rm \
  -v $(pwd)/serviceAccountKey.json:/app/secrets/serviceAccountKey.json:ro \
  -v $(pwd)/TestData.xlsx:/app/TestData.xlsx:ro \
  -e EXCEL_FILE_PATH=/app/TestData.xlsx \
  -e NODE_ENV=production \
  vss2025-import
```

## Troubleshooting

### "Service account key not found"
- Verify the key file exists and is mounted correctly
- Check the volume mount path in `docker-compose.yml` or docker command
- Ensure the file path is correct (case-sensitive on Linux/Mac)

### "Excel file not found"
- Verify `TestData.xlsx` exists in the project root
- Check the volume mount in docker-compose or docker command
- Use `EXCEL_FILE_PATH` environment variable if using a different file

### "Permission denied" errors
- Check that the service account key has proper read permissions
- On Linux/Mac, ensure file permissions: `chmod 644 serviceAccountKey.json`

### Docker build fails
- Ensure you're in the project root directory
- Check that `package.json` exists
- Try: `docker-compose build --no-cache`

### Container exits immediately
- Check logs: `docker-compose logs` or `docker logs <container-id>`
- Ensure both files (key and Excel) are properly mounted

## Security Notes

⚠️ **Important Security Reminders:**

1. **Never commit `serviceAccountKey.json`** to version control
2. The `:ro` flag makes volumes read-only for security
3. Clean up containers after use: `docker-compose down`
4. Remove unused images: `docker image prune`

## Advanced Usage

### Running in background and viewing logs

```bash
# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Building without cache

```bash
docker-compose build --no-cache
```

### Interactive shell (for debugging)

```bash
docker run --rm -it \
  -v $(pwd)/serviceAccountKey.json:/app/secrets/serviceAccountKey.json:ro \
  -v $(pwd)/TestData.xlsx:/app/TestData.xlsx:ro \
  --entrypoint /bin/sh \
  vss2025-import
```

## Cleanup

To remove Docker resources:

```bash
# Remove containers
docker-compose down

# Remove image
docker rmi vss2025-import

# Clean up all unused resources
docker system prune
```

