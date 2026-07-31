import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
from cycle4_webmenus import analyze_html, choose_link, dedupe_items


class Cycle4WebMenuTests(unittest.TestCase):
    def test_extracts_realistic_schema_and_client_visible_json_separately(self):
        html = '''
        <script type="application/ld+json">{"@type":"Menu","hasMenuSection":{"hasMenuItem":[
          {"@type":"MenuItem","name":"Green Chile Burger","image":{"url":"https://img.test/burger.jpg"}},
          {"@type":"MenuItem","name":"Green Chile Burger"}]}}</script>
        <script type="application/json">{"menus":[{"groups":[{"items":[
          {"name":"Posole","price":12.5,"imageUrl":"https://img.test/posole.jpg"}]}]}]}</script>
        <a href="https://order.toasttab.com/online/example">Order online</a>'''
        result = analyze_html(html)
        self.assertEqual(result["schema_items"], 1)
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["duplicate_items"], 1)
        self.assertEqual(result["platforms"], ["toast"])

    def test_link_choice_prefers_recurring_ordering_platform(self):
        links = [("/menu", "Menu"), ("https://order.toasttab.com/online/example", "Order")]
        self.assertEqual(choose_link("https://restaurant.test/", links), "https://order.toasttab.com/online/example")

    def test_link_choice_rejects_food_gallery_and_platform_sales_links(self):
        links = [("/fresh-seafood", "Fresh seafood"), ("https://spothopperapp.com/contact-us", "Contact")]
        self.assertIsNone(choose_link("https://restaurant.test/", links))

    def test_deduplication_keeps_photo_bearing_copy(self):
        items, inflation = dedupe_items([
            {"name": "Fish & Chips", "image_url": None},
            {"name": "Fish & Chips!", "image_url": "https://img.test/fish.jpg"},
        ])
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["image_url"])
        self.assertEqual(inflation, 1)

    def test_committed_metrics_preserve_separate_denominators(self):
        metrics = json.loads((ROOT / "CYCLE4_METRICS.json").read_text())
        self.assertEqual(metrics["sample"]["restaurants"], 24)
        self.assertEqual(metrics["collection"]["requests"], 38)
        self.assertLessEqual(metrics["collection"]["requests"], 60)
        self.assertTrue(metrics["collection"]["one_attempt_per_url"])
        self.assertEqual(metrics["yield"]["overall"]["items"], 37)
        self.assertEqual(metrics["yield"]["unique_linked_photo_urls"], 0)
        self.assertEqual(metrics["yield"]["by_doordash_identity"]["matched"]["restaurants"], 12)
        self.assertEqual(metrics["yield"]["by_doordash_identity"]["unmatched"]["restaurants"], 12)

    def test_review_fixture_is_hash_only(self):
        fixture = json.loads((ROOT / "cycle4_review_fixture.json").read_text())
        serialized = json.dumps(fixture)
        self.assertNotIn("http", serialized)
        self.assertNotIn("restaurant_name", serialized)
        self.assertEqual(len(fixture["rows"]), 8)
        self.assertTrue(all(len(row["target_hash"]) == 20 for row in fixture["rows"]))


if __name__ == "__main__":
    unittest.main()
