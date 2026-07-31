import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from cycle0_analysis import match_records  # noqa: E402


def record(source, record_id, name, latitude, longitude):
    return {
        "source_name": source,
        "source_record_id": record_id,
        "latitude": latitude,
        "longitude": longitude,
        "fields": {"name": name},
    }


class Cycle0MatcherTest(unittest.TestCase):
    def test_exact_and_tight_fuzzy_matches(self):
        overture = [
            record("overture", "a", "Example Kitchen", 42.0, -93.6),
            record("overture", "b", "Great Plains Sauce and Dough", 42.001, -93.601),
        ]
        osm = [
            record("openstreetmap", "1", "Example Kitchen", 42.0001, -93.6001),
            record("openstreetmap", "2", "Great Plains Sauce & Dough", 42.00105, -93.60105),
        ]
        matches, unresolved = match_records(osm, overture)
        self.assertEqual(len(matches), 2)
        self.assertEqual(unresolved, [])

    def test_generic_nearby_names_do_not_match(self):
        overture = [record("overture", "a", "Main Street Cafe", 42.0, -93.6)]
        osm = [record("openstreetmap", "1", "Main Street Pizza", 42.00001, -93.60001)]
        matches, unresolved = match_records(osm, overture)
        self.assertEqual(matches, [])
        self.assertEqual(len(unresolved), 1)

    def test_committed_benchmark_is_sanitized_and_stratified(self):
        fixture = json.loads((ROOT / "fixtures/cycle0_benchmark.json").read_text())
        rows = fixture["rows"]
        self.assertEqual(len(rows), 60)
        self.assertEqual({row["selected_area"] for row in rows},
                         {"ames_ia", "manhattan_ny", "temecula_ca"})
        serialized = json.dumps(rows)
        self.assertNotIn("source_record_id", serialized)
        self.assertNotIn("restaurant_name", serialized)


if __name__ == "__main__":
    unittest.main()
