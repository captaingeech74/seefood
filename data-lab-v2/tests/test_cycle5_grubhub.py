import json
import tempfile
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parents[1]))

from cycle5_grubhub import dedupe_items, extract_items, sample_rows, strict_store_match


class Cycle5GrubhubTests(unittest.TestCase):
    def test_fixed_sample_is_balanced(self):
        rows = sample_rows(Path(__file__).parents[1])
        self.assertEqual(len(rows), 12)
        self.assertEqual(sum(row["chain"] for row in rows), 6)
        self.assertEqual(sum(row["dd_matched"] for row in rows), 6)
        self.assertEqual(sum(row["website_identity_gate"] == "accept" for row in rows), 6)
        self.assertEqual({r: sum(row["region"] == r for row in rows) for r in {x["region"] for x in rows}}, {r: 2 for r in {x["region"] for x in rows}})

    def test_strict_match_requires_location_and_address(self):
        row = {"name": "Mantra Indian Cuisine", "locality": "Temecula", "address": "27645 Jefferson Ave"}
        html = '<a href="/restaurant/mantra-indian-cuisine-27645-jefferson-ave-temecula/329004/">Mantra</a>'
        self.assertEqual(strict_store_match(html, row)["disposition"], "safe_match")
        alternative = '<a href="/restaurant/campinis-deli-italiano-28860-old-town-front-st-temecula/3354751/">Campini</a>'
        self.assertEqual(strict_store_match(alternative, row)["disposition"], "no_strict_location_match")

    def test_ambiguous_locations_are_quarantined(self):
        row = {"name": "BJs Restaurant and Brewhouse", "locality": "Wichita", "address": "100 Main St"}
        html = ''.join([
            '<a href="/restaurant/bjs-restaurant-brewhouse-100-main-st-wichita/111111/">BJ</a>',
            '<a href="/restaurant/bjs-restaurant-brewhouse-100-main-st-wichita/222222/">BJ</a>',
        ])
        self.assertEqual(strict_store_match(html, row)["disposition"], "quarantine_ambiguous")

    def test_current_payload_extraction_and_deduplication(self):
        item = {"item_id": "1", "item_name": "Soup", "item_price": {"delivery": {"value": 599}}, "media_image": {"base_url": "https://img/", "public_id": "abc"}}
        found = []
        extract_items({"object": {"data": [item, item]}, "service_fee": {"name": "Fee"}}, found)
        unique, inflation = dedupe_items(found)
        self.assertEqual(len(unique), 1)
        self.assertEqual(inflation, 1)
        self.assertIn("abc", unique[0]["image_url"])


if __name__ == "__main__": unittest.main()
