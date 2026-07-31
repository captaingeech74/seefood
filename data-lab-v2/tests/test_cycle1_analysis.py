import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from cycle1_analysis import build_metrics, duplicate_candidates  # noqa: E402
from cycle1_collect import SAMPLES  # noqa: E402
from cycle1_webcheck import digest  # noqa: E402


def record(name, latitude, longitude):
    return {"latitude": latitude, "longitude": longitude, "fields": {"name": name}}


class Cycle1AnalysisTest(unittest.TestCase):
    def test_duplicate_excess_clusters_exact_normalized_nearby_names(self):
        rows = [
            record("Café One", 35.0, -106.0),
            record("Cafe One", 35.00005, -106.0),
            record("Cafe One", 35.0001, -106.0),
            record("Cafe One", 36.0, -106.0),
            record("Cafe Two", 35.0, -106.0),
        ]
        self.assertEqual(
            duplicate_candidates(rows),
            {"candidate_clusters": 1, "candidate_excess_records": 2},
        )

    def test_duplicate_candidates_ignore_missing_names(self):
        rows = [record(None, 35.0, -106.0), record("", 35.00001, -106.0)]
        self.assertEqual(
            duplicate_candidates(rows),
            {"candidate_clusters": 0, "candidate_excess_records": 0},
        )

    def test_committed_metrics_keep_dimensions_and_denominators_separate(self):
        metrics = json.loads((ROOT / "CYCLE1_METRICS.json").read_text())
        self.assertEqual(metrics["sample"]["overture_restaurants"], 1238)
        self.assertEqual(metrics["sample"]["all_overture_places"], 22611)
        self.assertEqual(metrics["identity_accuracy_selected"]["selected_records"], 120)
        self.assertEqual(metrics["identity_accuracy_selected"]["corroborated"], 44)
        self.assertEqual(metrics["identity_accuracy_selected"]["contradicted"], 10)
        self.assertEqual(metrics["website_reachability_selected"]["http_reachable"], 69)
        self.assertEqual(metrics["website_accuracy_selected"]["reachable_denominator"], 69)
        self.assertEqual(metrics["operating_status_selected"]["provider_open"], 82)
        self.assertEqual(metrics["duplicate_candidates"]["candidate_clusters"], 17)
        self.assertEqual(metrics["duplicate_candidates"]["candidate_excess_records"], 17)
        self.assertEqual(metrics["osm_omission_candidates"]["high_confidence_omissions"], 4)
        self.assertEqual(metrics["osm_omission_candidates"]["matcher_false_negatives"], 7)

    def test_build_metrics_uses_cached_inputs_and_separate_partitions(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = Path(directory)
            cache_dir = raw / "cycle1-web"
            cache_dir.mkdir()
            selected = []
            statuses = ["open", "open", None, "permanently_closed", "open", None]
            for index, (market, status) in enumerate(zip(SAMPLES, statuses)):
                source_id = f"record-{index}"
                feature = {
                    "geometry": {"coordinates": [-100 + index, 35 + index]},
                    "properties": {
                        "id": source_id,
                        "taxonomy": {"hierarchy": ["restaurant"]},
                        "names": {"primary": f"Restaurant {index}"},
                        "addresses": [{"freeform": f"{index} Main St"}],
                        "websites": [f"https://example{index}.test"],
                        "phones": [f"555000{index}"],
                        "operating_status": status,
                    },
                }
                (raw / f"cycle1-overture-{market}.geojsonseq").write_text(
                    json.dumps(feature) + "\n"
                )
                key = digest(f"overture_identity|{market}|{source_id}")
                selected.append(key)
                (cache_dir / f"{key}.json").write_text(json.dumps({
                    "cache_key": key,
                    "kind": "overture_identity",
                    "reachable": index < 5,
                    "operating_status": status,
                    "elapsed_seconds": index / 10,
                }))
            omission_keys = ["a" * 64, "b" * 64]
            for key in omission_keys:
                (cache_dir / f"{key}.json").write_text(json.dumps({
                    "cache_key": key,
                    "kind": "omission_candidate",
                    "reachable": True,
                    "operating_status": None,
                    "elapsed_seconds": 0.1,
                }))
            fixture = raw / "review.json"
            fixture.write_text(json.dumps({
                "identity_contradicted": [selected[0]],
                "identity_inconclusive_reachable": [selected[1]],
                "third_party_identity_corroboration": [selected[2]],
                "open_status_contradicted": [selected[0]],
                "closed_status_corroborated": [selected[3]],
                "omission_high_confidence": [omission_keys[0]],
                "omission_matcher_false_negative": [omission_keys[1]],
            }))
            metrics = build_metrics(raw, fixture)
            self.assertEqual(metrics["sample"]["all_overture_places"], 6)
            self.assertEqual(metrics["identity_accuracy_selected"]["decisive_denominator"], 4)
            self.assertEqual(metrics["website_reachability_selected"]["http_reachable"], 5)
            self.assertEqual(metrics["website_accuracy_selected"]["identity_inconclusive"], 1)
            self.assertEqual(metrics["operating_status_selected"]["provider_open"], 3)
            self.assertEqual(metrics["osm_omission_candidates"]["denominator"], 2)

    def test_review_fixture_contains_only_sanitized_hashes(self):
        fixture = json.loads((ROOT / "cycle1_review_fixture.json").read_text())
        for values in fixture.values():
            self.assertTrue(values)
            self.assertTrue(all(len(value) == 64 for value in values))
            self.assertTrue(all(set(value) <= set("0123456789abcdef") for value in values))


if __name__ == "__main__":
    unittest.main()
