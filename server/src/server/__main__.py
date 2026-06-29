from __future__ import annotations

import argparse

from .app import run_server


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the playground event server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8787, type=int)
    args = parser.parse_args()

    run_server(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
