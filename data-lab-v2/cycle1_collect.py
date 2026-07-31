#!/usr/bin/env python3
"""Bounded additional-market collectors for Cycle 1.

Each provider call has a client timeout below 120 seconds and a 120-second hard
process cap. Raw outputs are written only under the ignored raw directory.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from cycle0_collect import run


RELEASE = "2026-07-22.0"
SAMPLES = {
    # Selected operating samples; not a national probability sample.
    "portland_me": (-70.28, 43.64, -70.23, 43.69),
    "boone_nc": (-81.70, 36.19, -81.64, 36.24),
    "jackson_ms": (-90.22, 32.28, -90.17, 32.33),
    "wichita_ks": (-97.36, 37.66, -97.31, 37.71),
    "albuquerque_nm": (-106.67, 35.06, -106.62, 35.11),
    "spokane_wa": (-117.45, 47.64, -117.40, 47.69),
}


def collect_overture(cli: str, raw_dir: Path) -> None:
    for area, box in SAMPLES.items():
        output = raw_dir / f"cycle1-overture-{area}.geojsonseq"
        if output.exists() and output.stat().st_size:
            continue
        run(
            [
                cli,
                "download",
                "--bbox",
                ",".join(str(value) for value in box),
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


def collect_osm(raw_dir: Path, overpass_url: str) -> None:
    curl = shutil.which("curl")
    if not curl:
        raise SystemExit("curl is required")
    for area, (west, south, east, north) in SAMPLES.items():
        output = raw_dir / f"cycle1-osm-{area}.json"
        if output.exists() and output.stat().st_size:
            continue
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
                overpass_url,
            ],
            output,
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
    parser.add_argument(
        "--overpass-url",
        default="https://overpass-api.de/api/interpreter",
    )
    args = parser.parse_args()
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    if args.source in ("all", "overture"):
        if not args.overture_cli:
            raise SystemExit("Install overturemaps or pass --overture-cli")
        collect_overture(args.overture_cli, args.raw_dir)
    if args.source in ("all", "osm"):
        collect_osm(args.raw_dir, args.overpass_url)


if __name__ == "__main__":
    main()
