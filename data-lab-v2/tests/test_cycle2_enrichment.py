import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from cycle2_enrichment import (  # noqa: E402
    address_parts,
    domain,
    enriched_match,
    phone,
    status_disposition,
    website_disposition,
)


def record(name, lat=35.0, lon=-106.0, website=None, telephone=None, address=None, source_id="id"):
    return {
        "source_record_id": source_id,
        "latitude": lat,
        "longitude": lon,
        "fields": {"name": name, "website": website, "phone": telephone, "address": address},
    }


class Cycle2EnrichmentTest(unittest.TestCase):
    def test_normalizers_make_source_formats_comparable(self):
        self.assertEqual(domain("https://www.Example.com/place"), "example.com")
        self.assertEqual(phone(["+1 (515) 555-0100"]), "5155550100")
        self.assertEqual(
            address_parts({"housenumber": "114", "street": "South Duff Avenue", "postcode": "50010"}),
            ("114", "s duff ave", "50010"),
        )
        self.assertEqual(
            address_parts({"freeform": "114 S Duff Ave", "postcode": "50010-1234"}),
            ("114", "s duff ave", "50010"),
        )

    def test_phone_reuse_with_incompatible_name_does_not_link(self):
        left = record("Garbanzo Mediterranean", telephone="515-766-4361")
        former_occupant = record("Barberitos", telephone="+15157664361", source_id="former")
        disposition, matched, _ = enriched_match(left, [former_occupant])
        self.assertEqual(disposition, "unresolved")
        self.assertIsNone(matched)

    def test_shared_domain_and_compatible_name_links(self):
        left = record("The Boulder Tap House", website="https://www.bouldertaphouse.com/")
        right = record("Boulder Tap House", website=["http://bouldertaphouse.com/ames-ia"], source_id="target")
        disposition, matched, evidence = enriched_match(left, [right])
        self.assertEqual(disposition, "match")
        self.assertEqual(matched["source_record_id"], "target")
        self.assertTrue(evidence["domain_equal"])

    def test_http_success_is_not_operating_evidence(self):
        row = {
            "reachable": True,
            "name": "Cafe One",
            "title": "Cafe One Restaurant",
            "body_text_sample": "Cafe One Restaurant menu and reservations",
            "operating_status": "open",
        }
        self.assertEqual(website_disposition(row), "accept")
        self.assertEqual(status_disposition(row), "no_change")

    def test_committed_metrics_capture_reviewed_quality_gates(self):
        metrics = json.loads((ROOT / "CYCLE2_METRICS.json").read_text())
        identity = metrics["identity_linkage"]
        self.assertEqual(identity["cycle0_unresolved_denominator"], 619)
        self.assertEqual(identity["reviewed_false_negatives_recovered"], 7)
        self.assertEqual(identity["reviewed_high_confidence_omissions_retained"], 4)
        self.assertEqual(identity["reviewed_false_links"], 0)
        websites = metrics["website_associations"]
        self.assertEqual(websites["selected_denominator"], 120)
        self.assertEqual(websites["reviewed_contradictions_false_accepted"], 0)
        self.assertEqual(
            websites["accept"] + websites["reject"] + websites["quarantine"], 120
        )
        self.assertEqual(metrics["operating_status"]["automatic_state_changes"], 0)

    def test_review_fixture_is_sanitized_and_separate(self):
        fixture = json.loads((ROOT / "cycle2_review_fixture.json").read_text())
        self.assertEqual(len(fixture["omission_candidates"]), 11)
        for key, row in fixture["omission_candidates"].items():
            self.assertEqual(len(key), 64)
            self.assertLessEqual(set(key), set("0123456789abcdef"))
            expected = row.get("expected_overture_hash")
            if expected:
                self.assertEqual(len(expected), 64)
                self.assertLessEqual(set(expected), set("0123456789abcdef"))


if __name__ == "__main__":
    unittest.main()
