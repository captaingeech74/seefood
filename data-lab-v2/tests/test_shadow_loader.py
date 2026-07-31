import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
import sys

sys.path.insert(0, str(ROOT))

from shadow_loader import connect, load_jsonl  # noqa: E402


class ShadowLoaderTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / "shadow.sqlite"
        self.connection = connect(self.database, ROOT / "shadow_schema.sql")

    def tearDown(self):
        self.connection.close()
        self.temp.cleanup()

    def test_preserves_source_identity_and_observations(self):
        record = {
            "source_name": "fixture_a",
            "source_record_id": "source-id-1",
            "entity_id": "seefood-entity-1",
            "observed_at": "2026-07-31T00:00:00Z",
            "source_record_version": "7",
            "location": {"latitude": 42.0, "longitude": -93.6},
            "observations": {"name_key": "abc123", "has_website": True},
            "confidence": 0.98,
            "license_id": "test-license",
        }
        load_jsonl(
            self.connection,
            [record],
            source_name="fixture_a",
            source_release="fixture-1",
            selected_sample="unit-test",
        )
        source = self.connection.execute(
            "SELECT source_name, source_record_id, entity_id FROM source_records"
        ).fetchone()
        self.assertEqual(source, ("fixture_a", "source-id-1", "seefood-entity-1"))
        fields = dict(
            self.connection.execute(
                "SELECT field_name, field_value FROM observations ORDER BY field_name"
            )
        )
        self.assertEqual(json.loads(fields["name_key"]), "abc123")
        self.assertTrue(json.loads(fields["has_website"]))

    def test_upsert_keeps_first_seen_and_updates_last_seen(self):
        base = {
            "source_name": "fixture_a",
            "source_record_id": "source-id-1",
            "observations": {"name_key": "abc123"},
        }
        first = dict(base, observed_at="2026-07-01T00:00:00Z")
        second = dict(base, observed_at="2026-07-31T00:00:00Z")
        for row in (first, second):
            load_jsonl(
                self.connection,
                [row],
                source_name="fixture_a",
                source_release="fixture-1",
                selected_sample="unit-test",
            )
        seen = self.connection.execute(
            "SELECT first_seen_at, last_seen_at FROM source_records"
        ).fetchone()
        self.assertEqual(seen, (first["observed_at"], second["observed_at"]))
        self.assertEqual(
            self.connection.execute("SELECT COUNT(*) FROM observations").fetchone()[0],
            2,
        )

    def test_rejects_cross_source_load(self):
        with self.assertRaises(ValueError):
            load_jsonl(
                self.connection,
                [
                    {
                        "source_name": "fixture_b",
                        "source_record_id": "1",
                        "observed_at": "2026-07-31T00:00:00Z",
                    }
                ],
                source_name="fixture_a",
                source_release="fixture-1",
                selected_sample="unit-test",
            )


if __name__ == "__main__":
    unittest.main()
