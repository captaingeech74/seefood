# Gemini Deep Research Handoff

## Status

**READY FOR KYLE — 2026-07-23**

The static inventory is complete. This prompt targets gaps not answered by the
existing DoorDash, Grubhub, Google, Menufy, schema.org, and infrastructure
research.

## Kyle's Manual Bridge

When this file contains a prompt marked `READY FOR KYLE`:

1. Copy the prompt verbatim into Gemini Deep Research.
2. Let Gemini finish the full investigation.
3. Paste the complete result into the SeeFood DataLab Codex task.
4. No analysis or technical interpretation is required from Kyle.

The Lead must then separate claims from evidence and create bounded validation
experiments. No Gemini recommendation is accepted without direct testing.

## Prompt

Copy everything inside the block verbatim:

```text
You are the discovery scout for SeeFood DataLab. Research the current state as
of July 23, 2026. SeeFood's north star is not raw restaurant records, menu rows,
or images. It is the number of restaurant locations with at least one strongly
matched dish that has both a Management-supplied photo and a Customer-supplied
photo, with defensible restaurant identity, item identity, author provenance,
rights/provenance evidence, repeatable access, and a refresh path.

This is research only. Do not create accounts, contact vendors, use credentials,
run crawlers, bypass access controls, recommend evasion, or assume paid access.
Use primary sources wherever possible: official API documentation, provider
documentation, pricing/partner pages, terms, public schemas, government data
documentation, and first-party technical materials. For every material claim,
give the exact URL, page title, publisher, and access/publication date when
available. Clearly label inference. If only secondary evidence exists, say so.

Do not repeat these already-settled SeeFood findings unless you find direct
evidence that something materially changed:

1. Google Places API has no menuItems field.
2. Google Places photo supply is capped in SeeFood's current path and does not
   provide enough item-linked photos by itself.
3. Yelp is not a durable free V1 source.
4. DoorDash store discovery is already solved through its public state store
   sitemaps; individual store pages still require separate fetching; SeeFood
   already has parsers for old __NEXT_DATA__ and current Next.js RSC payloads.
5. Google Custom Search JSON API is closed to new customers.
6. Grubhub has no restaurant-level sitemap, its pages are client-rendered, and
   270 SeeFood runs produced zero items/photos; do not recommend another test
   without evidence of a material platform change.
7. Menufy/HungerRush direct API and rendered-card paths, restaurant-site
   schema.org parsing, generic page-image extraction, menu-link following, menu
   OCR, Common Crawl replay, and basic ordering-provider detection already
   exist.
8. SeeFood already detects or has generic scaffolding for Toast, Square, Clover,
   ChowNow, Olo, Popmenu, BentoBox, Owner.com, SpotHopper, Slice, Flipdish,
   Lightspeed, and GloriaFood. The gap is current, source-specific proof on real
   restaurants, not another list of their names.
9. Current infrastructure is Supabase Postgres plus Cloudflare R2. Do not
   research replacement infrastructure.

Investigate these unanswered questions:

A. For each of BentoBox, Owner.com, SpotHopper, Slice, Flipdish, Lightspeed, and
GloriaFood, is there a current repeatable, lawful access path that exposes
restaurant identity, menu items, and item-linked image URLs? Distinguish public
HTML/structured data, documented public APIs, merchant-authorized APIs, partner-
only APIs, and unsupported internal endpoints. Record authentication, partner
approval, rate limits, pricing, terms/robots constraints, stable identifiers,
image provenance, freshness, and whether the same method plausibly generalizes
across restaurants.

B. For Google Business Profile, Square, Toast, Clover, and Meta/Instagram,
identify official merchant-authorized APIs or export flows that could let a
verified restaurant deliberately import menu/catalog items and photos it
controls. Include exact scopes, app-review or partner requirements, sandbox
availability, pricing, rate limits, image-to-item linkage, token/refresh burden,
and whether a small independent developer can obtain access today. Also assess
official TikTok or other social-provider routes only if they support deliberate
merchant selection and preserved post/account provenance.

C. Identify lawful, scalable ways to obtain Customer-supplied restaurant food
photos with defensible author provenance and evidence strong enough to match a
current menu item. Separate: official/licensed APIs, open datasets with usable
licenses, restaurant-authorized sources, and first-party contribution
mechanisms. Exclude generic image search, scraped social feeds, and any source
whose terms or license do not support SeeFood's intended use. Be explicit if no
credible automatic Customer-photo source exists.

D. Identify one independently maintained, reproducible location/status source
that could test incremental completeness of a Temecula restaurant census after
Google, OpenStreetMap, and Overture are reconciled. It must expose individual
locations and operating status or closure evidence, not just aggregate NAICS
counts. Record geographic coverage, update frequency, license, access method,
cost, and expected blind spots. Prefer government or clearly licensed sources.

E. Find published evidence, benchmarks, or practical methods for auditing:
restaurant-identity linkage, menu-item-to-photo matching, photo-author
provenance, and duplicate images. Focus on how to construct a small human-audited
gold set and report precision with uncertainty. Do not propose a new paid ML
service unless the evidence shows a unique capability that cannot be tested
locally.

Return exactly these sections:

1. Executive verdict: five plain-language bullets naming what appears most
   promising, what appears dead, and what remains unknown.
2. Evidence table: one row per source/access path with source family, exact
   capability, Management/Customer/Unknown provenance, item linkage, access
   class, official approval needed, recurring cost, quota/rate limit, geographic
   reach, freshness, rights/terms evidence, and primary-source citations.
3. Provider-family findings: detailed answers for question A, including a
   confidence rating and the smallest safe real-world probe for each provider.
4. Merchant-authorized findings: detailed answers for question B.
5. Customer-photo findings: detailed answers for question C, including a clear
   statement if first-party uploads are the only defensible path.
6. Temecula census source: detailed answer for question D.
7. Evaluation evidence: detailed answer for question E.
8. Ranked experiment candidates: at most eight. Each must be one bounded
   hypothesis with development sample size, expected incremental strongly
   matched Management/Customer comparison coverage, exact success/failure
   evidence, expected requests/runtime/dollars, refresh path, and a stop
   condition. Put $0 and no-new-credential probes first.
9. Rejected/redundant ideas: explicitly list anything that repeats SeeFood's
   settled findings or lacks lawful/repeatable access.
10. Open questions: facts you could not verify.

Do not write code. Do not estimate coverage from provider marketing language.
Do not count raw records or raw images as success. A recommendation without a
primary-source citation and a bounded verification plan must be labeled
unproven.
```
