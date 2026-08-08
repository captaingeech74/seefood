# Metro Rollout

## Sequence

1. Temecula: make every funnel stage measurable and manually inspect quality.
2. San Diego metro: prove the machinery works at a much larger city scale.
3. San Diego County: test suburban breadth and long-tail restaurants.
4. Los Angeles: test fragmented municipal geography and dense competition.
5. Remaining major California metros.
6. Top 50 US MSAs, sequenced using coverage cost, population, tourism,
   restaurant density, acquisition yield, and organic demand learned above.
7. All 387 US MSAs, using the same learned sequencing model for the long tail.

## Major Metro Definition

Use the 50 largest OMB Metropolitan Statistical Areas by population. An MSA
includes a substantial population core and adjacent communities with strong
economic and social integration. This avoids pretending that arbitrary city
limits describe how diners move.

Planning baselines:

- United States restaurants: 750,000
- Restaurants in top 50 MSAs: 450,000 estimated
- Population in top 50 MSAs: about 185 million, or 55% of the United States
- Population in all 387 MSAs: about 294 million, or 86% of the United States
- Above-fold photo target: 7

The 450,000 figure is deliberately a planning estimate. Replace it with a
versioned Census County Business Patterns NAICS 722 calculation across the
current top 50 MSAs once a Census API key is available. Refresh the population
coverage estimates from the same versioned geography source when that happens.

## Market Exit Criteria

Early-market publication is expansive: expose every confidently real restaurant
that is not known closed, then use readiness styling and map clustering instead
of hiding thin restaurants. Exact GPS detection includes contribution-needed
shells. See `docs/RESTAURANT_PUBLICATION_POLICY.md`.

The founder-facing headline is verified, live, strong, and neighborhood
availability. Keep the detailed rungs below as the diagnostic drill-down.

A market is not "done" because identities were imported. Report every rung:

1. Restaurants identified
2. Have photos
3. Have menu
4. Menu-matched photos
5. 20% coverage, with seven-photo minimum
6. 50% coverage, with seven-photo minimum
7. At least one management-vs-customer comparison dish
