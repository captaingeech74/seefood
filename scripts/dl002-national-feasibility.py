#!/usr/bin/env python3
"""Aggregate-only feasibility check for the DL-002 Overture national frame."""

import json
import sys
import time

import duckdb


RELEASE = "2026-06-17.0"
SOURCE = (
    "s3://overturemaps-us-west-2/release/"
    f"{RELEASE}/theme=places/type=place/*"
)

QUERY = f"""
select
  count(*) as total_us_places,
  count(*) filter (
    where list_contains(taxonomy.hierarchy, 'restaurant')
  ) as restaurant_hierarchy,
  count(*) filter (
    where operating_status = 'open'
      and list_contains(taxonomy.hierarchy, 'restaurant')
  ) as open_restaurant_hierarchy,
  count(*) filter (
    where operating_status = 'permanently_closed'
      and list_contains(taxonomy.hierarchy, 'restaurant')
  ) as closed_restaurant_hierarchy,
  count(*) filter (
    where categories.primary = 'food_truck'
       or list_contains(categories.alternate, 'food_truck')
       or list_contains(taxonomy.hierarchy, 'food_truck')
  ) as explicit_food_truck,
  count(*) filter (
    where categories.primary = 'ghost_kitchen'
       or list_contains(categories.alternate, 'ghost_kitchen')
       or list_contains(taxonomy.hierarchy, 'ghost_kitchen')
  ) as explicit_ghost_kitchen,
  count(*) filter (
    where brand is not null
      and list_contains(taxonomy.hierarchy, 'restaurant')
  ) as restaurant_with_brand,
  count(*) filter (
    where length(websites) > 0
      and list_contains(taxonomy.hierarchy, 'restaurant')
  ) as restaurant_with_website,
  count(*) filter (
    where length(socials) > 0
      and list_contains(taxonomy.hierarchy, 'restaurant')
  ) as restaurant_with_social
from read_parquet('{SOURCE}')
where list_contains(list_transform(addresses, address -> address.country), 'US')
""".strip()


def main() -> None:
    started = time.time()
    connection = duckdb.connect()
    connection.execute("INSTALL httpfs")
    connection.execute("LOAD httpfs")
    connection.execute("SET s3_region='us-west-2'")
    row = connection.execute(QUERY).fetchone()
    columns = [description[0] for description in connection.description]
    result = dict(zip(columns, row))
    result.update(
        {
            "overtureRelease": RELEASE,
            "sourceFamily": "overture",
            "queryRuntimeSeconds": round(time.time() - started, 2),
            "query": QUERY,
            "querySemantics": (
                "Aggregate-only scan of the official Overture Places release; "
                "no clear candidate IDs or rows are emitted."
            ),
        }
    )
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
