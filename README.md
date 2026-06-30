# Decorator Agent

## Run With Docker Compose

Start the server and UI together:

```bash
docker compose up --build
```

Open the UI:

```text
http://127.0.0.1:5173
```

Useful checks:

```bash
curl -sk http://127.0.0.1:8787/health
curl -sk http://127.0.0.1:8787/api/state
curl -sk http://127.0.0.1:8787/openapi.json
```

FastAPI docs are available at `http://127.0.0.1:8787/docs`.

Stop the app:

```bash
docker compose down
```

Reset the local SQLite state and dependency volumes:

```bash
docker compose down -v
```

If Docker cannot resolve image registries or package indexes, configure Docker Desktop's proxy/DNS settings first. The build needs access to Docker Hub, PyPI, and npm.

## Run Locally Without Docker

Server:

```bash
cd server
/Users/anquach/miniforge3/bin/conda run -n server uv run --python 3.13 python -m server --host 127.0.0.1 --port 8787
```

UI:

```bash
cd ui
VITE_AGENT_SERVER_URL=http://127.0.0.1:8787 npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

## Test

Backend:

```bash
cd server
uv run --python 3.13 pytest
```

UI:

```bash
cd ui
npm test
```

## Smoke Test

Run the full local smoke stack with one command:

```bash
cd ui
npm run smoke
```

By default this starts the Python server on `127.0.0.1:8799`, starts Vite on
`127.0.0.1:5179`, runs the browser smoke test, then stops both processes.

To smoke test an already running UI instead:

```bash
cd ui
SMOKE_URL=http://127.0.0.1:5173 npm run smoke
```
