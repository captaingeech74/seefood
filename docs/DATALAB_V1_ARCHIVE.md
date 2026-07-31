# DataLab 1.0 Archive

DataLab 1.0 is closed as of July 31, 2026. Its final branch is
`codex/seefood-datalab-baseline` at commit
`dd56efd62b0675054cb1b8dc1cbbc74625a57279`. It is historical evidence, not an
operating manual for future acquisition work.

## What It Genuinely Taught Us

- SeeFood's historical comparison-ready flags overstated verified comparison
  coverage. A stored claim is not the same as a useful, current dish photo.
- Restaurant, menu-item, photo, and source identity must remain separate.
  Exact-content deduplication and provenance are essential production controls.
- DoorDash showed excellent dish-to-photo alignment in the strongest selected
  samples: 168 of 168 reviewed images matched the offered item, with 164 useful
  food images. National availability and yield were not measured.
- Public restaurant and ordering data can be technically valuable even when its
  production access terms still require a later agreement or business decision.
- The in-app contribution path has useful inactive infrastructure, but there is
  no evidence yet that it produces meaningful photo volume.
- Overture and Census geography were useful for national sampling. Local county
  permits were useful only as a spot check, not as a national acquisition plan.
- Ghost-kitchen labels, opening dates, exact cuisine quotas, venue-type quotas,
  and elaborate demographic balancing are optional context, not requirements.

## High-Value Recommendations Worth Keeping

1. Build one SeeFood-owned national restaurant identity graph before optimizing
   exotic sources or comparison-photo coverage; do not presume a single
   external roster is authoritative.
2. Preserve source IDs, websites, coordinates, address, phone, operating status,
   and observation dates so later enrichments can be reconciled safely.
3. Use supplemental sources for measurable additions, corrections, closures,
   current menus, and item photos—not merely for additional raw rows.
4. Continue exact-byte photo identity, source provenance, ambiguity-safe
   restaurant matching, and reversible production imports.
5. Test DoorDash nationally and test restaurant websites and their ordering
   providers as practical menu/photo channels.
6. Keep commercial opportunities on a separate negotiation list with the exact
   agreement needed.

## What Does Not Carry Forward

DataLab 2.0 does not inherit the old experiment queue, comparison-dish north
star, mandatory multi-reviewer structure, sealed-bundle choreography, hard
rights gate for technical tests, exhaustive proof packets, fixed geographic
quotas, or requirement to repair production instrumentation before trying a
source. The old `data-lab/` directory is frozen. Nothing in it authorizes or
constrains DataLab 2.0 unless a new document explicitly adopts it.
