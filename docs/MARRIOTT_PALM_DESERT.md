# Marriott resort dining — Palm Desert

Completed October 24, 2026. Requested scope: all three resort complexes, not a
claim of complete Palm Springs or Palm Desert city coverage.

## Published result

- **16 live dining listings:** 9 at JW Marriott Desert Springs, 5 at Shadow
  Ridge, and 2 shared by Desert Springs Villas I/II.
- **305 active menu entries**, across 8 venues.
- **33 food photos**, across 5 venues; **27 directly menu-linked** and 6 useful
  restaurant food photos without a confident exact dish label.
- Twelve existing candidate identities activated; four missing outlets added.
  No previous live menus or photos removed. No paid APIs or services used.
- Giuseppe's supplies 78 menu entries and 28 photos (26 menu-linked), the
  strongest visual experience in this addition.

## Evidence and practical limitations

Rosters verified against Marriott's official dining pages:

- [JW Marriott Desert Springs](https://www.marriott.com/en-us/hotels/ctdca-jw-marriott-desert-springs-resort-and-spa/dining/)
- [Shadow Ridge](https://www.marriott.com/en-us/hotels/ctdst-marriotts-shadow-ridge-ii-the-enclaves/dining/)
- [Desert Springs Villas](https://www.marriott.com/en-us/hotels/ctdds-marriotts-desert-springs-villas-i/dining/)

JW menus came from PDFs linked in the resort's public 247activities guest
directory. The shared Chuckwalla/Snake Bites PDF explicitly names both outlets.
Giuseppe's menu and named food images came from its Palm Desert location page.
Reviewed PDF lists omit drinks, category headings, modifiers, and uncertain
prices. Menu offerings can change; these are published menus, not a guarantee
of today's availability.

Marriott food photography is allocated to the named outlet, never shared across
every restaurant at the hotel. Blank image placeholders, interiors, redundant
image variants, and uncertain dish labels were withheld. Two clearly food
images with questionable dish labels remain useful unmatched restaurant photos.

Eleven outlets still have no verified usable food photography; eight have no
imported menu. Those identities are nonetheless searchable and available for
contributions. Fisherman's current official location URL was corrected, but
direct crawling was blocked; unrelated branch menus were not substituted.
Marketplace listings are convenience-food outlets, not full-service restaurants.
T&T is labeled private-events-only; Spa Bistro is labeled spa-access-required.
Four new outlet pins use approximate resort-area positions, so the existing
universal nearby-choice fallback may be needed rather than exact auto-selection.

## Reproduction, safety, and rollback

Importer: `scripts/import-marriott-palm-desert.ts`; reviewed food menu names:
`scripts/config/marriott-palm-desert-reviewed.json`.

Run with the patched SeeFood Node runtime. Supported modes: `--collect`,
`--prepare-content`, `--publish-identities`, `--publish-content`, and `--verify`.
Preparation must be visually reviewed before publication: it is not an
unattended approval mechanism. Collection and preparation alone do not write
production. Publication uses existing partial/additive source reconciliation.
Repeated publication was checked for stable active row counts.

Ignored local evidence: `logs/marriott-palm-desert/` contains collection,
prepared payload, image contact sheet, PDFs, entity preimages (`before.json`),
and measured database results (`verification.json`). Prepared payload SHA-256:
`eb079528a363213daeb3aa6ec9abb84733e7f58fddac74e1ee03806fcafc15d1`.

Pre-change Git rollback tag pushed:
`rollback/pre-marriott-palm-desert-20261024` at `38d891a`.
Git rollback does **not** reverse database imports. For a data rollback, use the
16 scoped entity IDs printed by the importer and the saved preimages. Hide their
new restaurant rows, deactivate only this import's menu/photo source rows, and
restore preexisting entity fields from `before.json`; retain provenance and
snapshots. Inspect subsequent contributions before any reversal; do not cascade
delete restaurant records or customer uploads. New market memberships and two
new parent resort identities are also scoped to this import.

Verification: 199 tests pass; TypeScript and production build pass. Live browser
checks confirm Giuseppe's gallery and menu, JW food photography, and thin
listings; live search confirms all 16 within the resort-area bounds.
