# Running the Application Locally

## Important: Use a Local Web Server

This application uses Firebase and needs to load local images. **You must run it through a web server** - opening `index.html` directly (file:// protocol) will cause CORS errors.

## Quick Start Options

### Option 1: Python (Recommended - Simplest)

If you have Python installed:

**Python 3:**
```bash
python -m http.server 8000
```

**Python 2:**
```bash
python -m SimpleHTTPServer 8000
```

Then open: `http://localhost:8000`

### Option 2: Node.js (http-server)

```bash
# Install globally (one time)
npm install -g http-server

# Run in project directory
http-server -p 8000
```

Then open: `http://localhost:8000`

### Option 3: VS Code Live Server

1. Install "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"

### Option 4: PHP

```bash
php -S localhost:8000
```

Then open: `http://localhost:8000`

## Why?

- **Firebase**: Requires HTTPS or localhost (won't work with file://)
- **CORS**: Images and resources need proper HTTP protocol
- **Security**: Modern browsers block file:// access to external resources

## Testing

After starting a local server, navigate to `http://localhost:8000` in your browser.

