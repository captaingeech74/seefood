#!/usr/bin/env python3
"""Bounded Cycle 0 collectors.

Raw outputs belong in data-lab-v2/raw/ and are intentionally ignored. Every
network subprocess has both provider/client timeouts and a 120 second hard cap.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path


RELEASE = "2026-06-17.0"
HARD_TIMEOUT_SECONDS = 120
SAMPLES = {
    # Deliberately selected operating samples, not a national probability sample.
    "temecula_ca": (-117.15, 33.47, -117.10, 33.52),
    "ames_ia": (-93.65, 42.00, -93.60, 42.05),
    "manhattan_ny": (-74.00, 40.72, -73.97, 40.76),
}


def run(command: list[str], output: Path | None = None) -> None:
    stream = output.open("wb") if output else None
    try:
        subprocess.run(
            command,
            check=True,
            stdout=stream,
            timeout=HARD_TIMEOUT_SECONDS,
        )
    finally:
        if stream:
            stream.close()


def collect_overture(cli: str, raw_dir: Path) -> None:
    for area, box in SAMPLES.items():
        bbox = ",".join(str(value) for value in box)
        output = raw_dir / f"overture-{area}.geojsonseq"
        run(
            [
                cli,
                "download",
                "--bbox",
                bbox,
                "-f",
                "geojsonseq",
                "-t",
                "place",
                "-r",
                RELEASE,
                "--connect_timeout",
                "15",
                "--request_timeout",
                "90",
                "-o",
                str(output),
            ]
        )


def collect_osm(raw_dir: Path) -> None:
    curl = shutil.which("curl")
    if not curl:
        raise SystemExit("curl is required")
    for area, (west, south, east, north) in SAMPLES.items():
        bbox = f"{south},{west},{north},{east}"
        query = (
            f'[out:json][timeout:60];nwr["amenity"="restaurant"]'
            f"({bbox});out center tags;"
        )
        run(
            [
                curl,
                "--fail",
                "--silent",
                "--show-error",
                "--connect-timeout",
                "15",
                "--max-time",
                "90",
                "--data-urlencode",
                f"data={query}",
                "https://overpass-api.de/api/interpreter",
            ],
            raw_dir / f"osm-{area}.json",
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--overture-cli",
        default=shutil.which("overturemaps"),
        help="Path to the provider-supported overturemaps CLI",
    )
    parser.add_argument("--raw-dir", type=Path, default=Path(__file__).parent / "raw")
    parser.add_argument("--source", choices=("all", "overture", "osm"), default="all")
    args = parser.parse_args()
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    if args.source in ("all", "overture"):
        if not args.overture_cli:
            raise SystemExit("Install overturemaps or pass --overture-cli")
        collect_overture(args.overture_cli, args.raw_dir)
    if args.source in ("all", "osm"):
        collect_osm(args.raw_dir)


if __name__ == "__main__":
    main()
