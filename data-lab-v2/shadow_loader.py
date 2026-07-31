#!/usr/bin/env python3
"""Load source-neutral, sanitized JSONL observations into the shadow SQLite DB."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fingerprint(record: dict) -> str:
    payload = json.dumps(record, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def load_jsonl(
    connection: sqlite3.Connection,
    records: Iterable[dict],
    *,
    source_name: str,
    source_release: str,
    selected_sample: str,
) -> str:
    rows = list(records)
    run_id = str(uuid.uuid4())
    started_at = utc_now()
    with connection:
        connection.execute(
            "INSERT INTO load_runs VALUES (?, ?, ?, ?, ?, ?)",
            (run_id, started_at, source_name, source_release, selected_sample, len(rows)),
        )
        for row in rows:
            if row.get("source_name") != source_name:
                raise ValueError("source_name does not match load source")
            record_id = str(row["source_record_id"])
            observed_at = row["observed_at"]
            entity_id = row.get("entity_id")
            if entity_id:
                connection.execute(
                    "INSERT OR IGNORE INTO entities(entity_id, created_at) VALUES (?, ?)",
                    (entity_id, started_at),
                )
            connection.execute(
                """
                INSERT INTO source_records(
                    source_name, source_record_id, entity_id, first_seen_at,
                    last_seen_at, source_release, source_record_version, raw_fingerprint
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_name, source_record_id) DO UPDATE SET
                    entity_id=COALESCE(excluded.entity_id, source_records.entity_id),
                    last_seen_at=excluded.last_seen_at,
                    source_release=excluded.source_release,
                    source_record_version=excluded.source_record_version,
                    raw_fingerprint=excluded.raw_fingerprint
                """,
                (
                    source_name,
                    record_id,
                    entity_id,
                    observed_at,
                    observed_at,
                    source_release,
                    row.get("source_record_version"),
                    fingerprint(row),
                ),
            )
            location = row.get("location")
            if location:
                connection.execute(
                    "INSERT OR REPLACE INTO record_locations VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        source_name,
                        record_id,
                        observed_at,
                        location["latitude"],
                        location["longitude"],
                        location.get("precision_meters"),
                    ),
                )
            for field_name, value in sorted(row.get("observations", {}).items()):
                values = value if isinstance(value, list) else [value]
                for item in values:
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO observations(
                            source_name, source_record_id, observed_at, field_name,
                            field_value, confidence, license_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            source_name,
                            record_id,
                            observed_at,
                            field_name,
                            json.dumps(item, sort_keys=True),
                            row.get("confidence"),
                            row.get("license_id"),
                        ),
                    )
    return run_id


def connect(database: Path, schema: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database)
    connection.executescript(schema.read_text())
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--release", required=True)
    parser.add_argument("--sample", required=True)
    args = parser.parse_args()
    schema = Path(__file__).with_name("shadow_schema.sql")
    args.database.parent.mkdir(parents=True, exist_ok=True)
    with connect(args.database, schema) as connection, args.input.open() as stream:
        records = (json.loads(line) for line in stream if line.strip())
        run_id = load_jsonl(
            connection,
            records,
            source_name=args.source,
            source_release=args.release,
            selected_sample=args.sample,
        )
    print(run_id)


if __name__ == "__main__":
    main()
