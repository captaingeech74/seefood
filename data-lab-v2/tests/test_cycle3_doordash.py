import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from cycle3_doordash import classify_page, extract_urls, match_store, menu_items


def record(name="BJ's Restaurant & Brewhouse", locality="Temecula"):
    return {"fields": {"name": name, "address": {"locality": locality}}}


class Cycle3DoorDashTests(unittest.TestCase):
    def test_committed_metrics_keep_discovery_and_fetch_denominators_separate(self):
        root = Path(__file__).parents[1]
        metrics = json.loads((root / "CYCLE3_METRICS.json").read_text())
        self.assertEqual(metrics["discovery"]["eligible_overture_restaurants"], 1238)
        self.assertEqual(
            metrics["discovery"]["matched"] + metrics["discovery"]["ambiguous"] + metrics["discovery"]["rejected"],
            1238,
        )
        self.assertEqual(metrics["store_collection"]["actual_unique_targets_attempted_total"], 15)
        self.assertEqual(metrics["store_collection"]["all_attempt_failure_classes"], {"explicit_block": 15})
        self.assertEqual(metrics["yield"]["items"], 0)

    def test_review_fixture_is_hash_only_and_not_evaluator_input(self):
        fixture = json.loads((Path(__file__).parents[1] / "cycle3_review_fixture.json").read_text())
        self.assertEqual(len(fixture), len({row["target_hash"] for row in fixture}))
        for row in fixture:
            self.assertRegex(row["target_hash"], r"^[0-9a-f]{20}$")
            self.assertEqual(set(row), {"target_hash", "region", "evaluated_disposition", "review_label"})

    def test_xml_and_safe_unique_match(self):
        xml = """<urlset>
        <loc>https://www.doordash.com/store/bj's-restaurant-&amp;-brewhouse-catering-temecula-2/</loc>
        <loc>https://www.doordash.com/store/bj's-restaurant-&amp;-brewhouse-temecula-1/</loc>
        </urlset>"""
        urls = extract_urls(xml)
        result = match_store(record(), urls)
        self.assertEqual(result["disposition"], "matched")
        self.assertNotIn("catering", result["url"])

    def test_ambiguity_and_generic_rejection(self):
        urls = [
            "https://www.doordash.com/store/joes-cafe-boone-1/",
            "https://www.doordash.com/store/joes-cafe-boone-2/",
        ]
        self.assertEqual(match_store(record("Joe's Cafe", "Boone"), urls)["disposition"], "ambiguous")
        self.assertEqual(match_store(record("Cafe", "Boone"), urls)["disposition"], "rejected")

    def test_explicit_block_class_is_terminal(self):
        self.assertEqual(classify_page({"status": 403, "blocked": True}, "challenge"), "explicit_block")

    def test_current_flight_payload_extracts_items_and_links_photo(self):
        payload = {"__typename": "MenuPageItemList", "items": [{
            "__typename": "MenuPageItem", "name": "Avocado Egg Rolls",
            "description": "x", "imageUrl": "https://img.example/rolls.jpg",
        }]}
        encoded = json.dumps(json.dumps(payload, separators=(",", ":")))[1:-1]
        html = f'<script>self.__next_f.push([1,"{encoded}"])</script>'
        self.assertEqual(menu_items(html), [{"name": "Avocado Egg Rolls", "image_url": "https://img.example/rolls.jpg"}])


if __name__ == "__main__":
    unittest.main()
