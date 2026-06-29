FROM python:3.13-slim-bookworm

WORKDIR /app/server

ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV PATH="/app/server/.venv/bin:${PATH}"

RUN python -m pip install --no-cache-dir uv

COPY server/ ./

RUN uv sync --frozen --python 3.13

EXPOSE 8787

CMD ["uv", "run", "--frozen", "--python", "3.13", "python", "-m", "server", "--host", "0.0.0.0", "--port", "8787"]
