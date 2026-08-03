# National Acquisition Backbone

## Outcome

SeeFood can now roll out one market at a time from the current monthly Overture
Places release. Overture is the broad discovery backbone, not an authority that
silently overwrites SeeFood. Existing provider IDs refresh idempotently; new
identities begin in review; ambiguous matches are quarantined.

Every import records a release, input hash, official boundary hash when
applicable, field-level source observations, identity proposals, counts, and
reversible changes. Reverse one batch with:

```bash
npm run acquisition:rollback -- --batch <uuid>
```

## Metro operation

```bash
npm run acquisition:overture -- --market temecula-ca --dry-run
npm run acquisition:overture -- --market temecula-ca --mode review
npm run acquisition:websites -- --market temecula-ca --limit 50 --concurrency 8
npm run crawl -- --market temecula-ca --source doordash --limit 25
npm run crawl -- --market temecula-ca --source grubhub --limit 25
```

Configured keys are `temecula-ca`, `san-diego-metro-ca`, and
`san-diego-county-ca`. Add an `acquisition_markets` row plus the delivery
crawler profile to steer a new metro. Cities should use an official polygon;
metro/county scopes may use recorded bounds.

## Website acquisition

The worker is HTTP-first and escalates to local Chromium when a public site
needs JavaScript. It follows at most one strongest menu/order link, captures
bounded public JSON, understands structured metadata, ordering payloads, and
conservative visible menu cards, and runs concurrently across domains while
serializing each domain.

It is assertive but finite: access blocks are recorded, transient failures
retry, and no CAPTCHA, login, or explicit access control is defeated. Generic
site photography is not named dish evidence. Named menu items and attached
images stage against the durable entity ID until a product restaurant row is
available. Directory domains and obvious fast-food chains run after likely
official sit-down sites and ordering platforms.

## Delivery demonstrations

DoorDash uses the public state sitemap plus strict name/city matching. Grubhub
uses public rendered search with the restaurant's actual location and captures
first-party menu responses. Both byte-verify photos before corpus persistence.
A miss stays a miss; no nearby cuisine substitute is accepted. These paths
support bounded demonstrations and opportunistic acquisition, while a future
sanctioned feed remains the durable scale option.

## Current rollout — August 3, 2026

- Overture release `2026-07-22.0`.
- Temecula official Census boundary: 443 candidates and 365 website
  observations. Batch `a4770d08-1320-4f63-85ea-2ae8ce6db8d3`.
- San Diego Metro: 8,777 candidates, 7,185 website observations, and 14
  ambiguous proposals quarantined. Batch
  `677d34fb-05e8-4113-a678-42bbdd8646cc`.
- Initial Temecula website proof: 536 structured item observations and 78
  attached photo URLs across seven entities after the first sit-down-priority
  pass. Two Google-attached restaurant
  groups were immediately promotion-safe, adding 57 current menu items and
  eight byte-verified photos to the customer corpus. Unattached Overture-only
  observations remain staged rather than being forced onto a possibly wrong
  product restaurant.

Candidate counts measure discovery, not published restaurants. Identity and
website review remain required before customer-visible promotion.
