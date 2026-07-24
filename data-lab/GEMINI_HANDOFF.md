# Gemini Deep Research Handoff

## Status

**RESULT RECEIVED AND TRIAGED — 2026-07-23**

The static inventory is complete. This prompt targets gaps not answered by the
existing DoorDash, Grubhub, Google, Menufy, schema.org, and infrastructure
research. It deliberately includes sources that may require partner approval,
custom permission, licensing, or a bespoke data deal.

Kyle returned the full Gemini result on 2026-07-23. The response omitted every
requested citation URL, so none of its `Verified` labels were accepted at face
value. `experiments/DL-DR-001-gemini-evidence-triage.md` records the bounded
primary-source check, corrections, and resulting queue changes.

## Kyle's Manual Bridge

When this file contains a prompt marked `READY FOR KYLE`:

1. Copy the prompt verbatim into Gemini Deep Research.
2. Let Gemini finish the full investigation.
3. Paste the complete result into the SeeFood DataLab Codex task.
4. No analysis or technical interpretation is required from Kyle.

The Lead must then separate claims from evidence and create bounded validation
experiments or permission/deal briefs. No implementation recommendation is
accepted without direct authorized testing; an untestable opportunity may be
retained only as clearly labeled inferred potential.

## Prompt

Copy everything inside the block verbatim:

```text
You are the discovery scout for SeeFood DataLab. Research the current state as
of July 23, 2026. SeeFood's north star is not raw restaurant records, menu rows,
or images. It is the number of restaurant locations with at least one strongly
matched dish that has both a Management-supplied photo and a Customer-supplied
photo, with defensible restaurant identity, item identity, author provenance,
rights/provenance evidence, and a plausible refresh path.

This is research only. Do not create accounts, contact vendors, use credentials,
run crawlers, bypass access controls, recommend evasion, or access private data.
Use primary sources wherever possible: official API documentation, provider
documentation, pricing/partner pages, terms, public schemas, government data
documentation, and first-party technical materials. For every material claim,
give the exact URL, page title, publisher, and access/publication date when
available. Clearly label inference. If only secondary evidence exists, say so.

Do not filter out a source merely because SeeFood cannot use it today. A
technically excellent source may require partner status, merchant authorization,
a paid license, a custom exception, or a bespoke data agreement. Discover and
rank those opportunities. For each access path, keep these three judgments
separate:

1. Technical value: likely incremental strongly matched Management/Customer
   comparison coverage, identity and item linkage, provenance, freshness,
   uniqueness, scale, and economics.
2. Current access posture: Open/Public, Merchant-authorized, Partner-only,
   Commercial license required, Custom permission required, Terms/rights
   unclear, Observable but currently unauthorized, Prohibited/unsafe, or
   Unknown.
3. Recommended action: Test now, Pursue permission, Pursue a commercial deal,
   Monitor, or Do not pursue.

Lack of current authorization is not evidence of low technical value. It means
the validation is permission-gated. You may identify from public evidence that
an undocumented, private, internal, or restricted capability appears to exist;
describe at a high level what data it appears to carry, who controls it, and
what permission would enable a bounded pilot. Do not provide bypass steps,
credential-acquisition tactics, access-control evasion, or instructions to
collect it without permission. Do not count inaccessible supply as current
SeeFood coverage. Label projected coverage as inferred and measured authorized
coverage as verified.

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
GloriaFood, what current surfaces or delivery paths appear to expose restaurant
identity, menu items, and item-linked image URLs? Distinguish public
HTML/structured data, documented public APIs, merchant-authorized APIs,
partner-only APIs, commercial feeds, exports, and unsupported internal
endpoints. Rate their technical value even when present access is restricted.
Record the controller, current access posture, authentication or approval,
rate limits, pricing, terms/robots constraints, stable identifiers, image
provenance, freshness, and whether the capability plausibly generalizes across
restaurants. For a blocked high-value path, define the smallest permission
SeeFood would need for a real pilot.

B. For Google Business Profile, Square, Toast, Clover, and Meta/Instagram,
identify official merchant-authorized APIs or export flows that could let a
verified restaurant deliberately import menu/catalog items and photos it
controls. Include exact scopes, app-review or partner requirements, sandbox
availability, pricing, rate limits, image-to-item linkage, token/refresh burden,
and whether a small independent developer can obtain access today. Also assess
official TikTok or other social-provider routes only if they support deliberate
merchant selection and preserved post/account provenance. Also identify any
high-value partner or custom-deal route that is not generally available to a
small developer today.

C. Identify technically strong ways to obtain Customer-supplied restaurant food
photos with defensible author provenance and evidence strong enough to match a
current menu item. Include official/licensed APIs, open datasets,
restaurant-authorized sources, first-party contribution mechanisms,
partner-only feeds, commercial licensors, custom-permission opportunities, and
other technically visible sources. Do not suppress a candidate because its
present terms, license, or eligibility do not support SeeFood's use; classify
it as permission-gated, identify the data controller, and specify the exception
or deal required. Separate strong item-linked sources from generic image search
or scraped social feeds, which are weak unless evidence shows a defensible
identity, author, rights, and refresh path. Be explicit if no credible automatic
Customer-photo path is usable today.

D. Identify one independently maintained, reproducible location/status source
that could test incremental completeness of a Temecula restaurant census after
Google, OpenStreetMap, and Overture are reconciled. It must expose individual
locations and operating status or closure evidence, not just aggregate NAICS
counts. Record geographic coverage, update frequency, license, access method,
cost, and expected blind spots. Prefer a source usable today for the benchmark,
but separately report a superior permission-gated city, county, commercial, or
industry frame if one exists.

E. Find published evidence, benchmarks, or practical methods for auditing:
restaurant-identity linkage, menu-item-to-photo matching, photo-author
provenance, and duplicate images. Focus on how to construct a small human-audited
gold set and report precision with uncertainty. Do not propose a new paid ML
service unless the evidence shows a unique capability that cannot be tested
locally.

F. Search specifically for restricted-but-high-value opportunities across
delivery marketplaces, review/photo networks, social platforms, POS and online
ordering providers, reservation/loyalty systems, menu syndicators, restaurant
data vendors, merchant agencies, and other likely data controllers. The goal is
not to use them without permission. The goal is to find sources whose item,
photo, author, and restaurant linkage would be unusually valuable and turn each
one into a concrete human-to-human access proposal. Include reseller,
data-license, merchant-mediated, clean-room, attribution/traffic exchange,
revenue-share, and bounded pilot structures when supported by evidence.

Return exactly these sections:

1. Executive verdict: five plain-language bullets naming what appears most
   promising, what appears dead, and what remains unknown.
2. Opportunity matrix: one row per distinct source/access path with source
   family, exact capability, Management/Customer/Unknown provenance, item
   linkage, technical-value rating, whether value is verified or inferred,
   current access posture, recommended access action, controller/approval
   needed, recurring cost, quota/rate limit, geographic reach, freshness,
   rights/terms evidence, confidence, and primary-source citations.
3. Provider-family findings: detailed answers for question A, including a
   confidence rating and the smallest authorized real-world probe or
   permission-gated validation plan for each provider.
4. Merchant-authorized findings: detailed answers for question B.
5. Customer-photo findings: detailed answers for question C, clearly separating
   paths usable now from technically strong permission/deal candidates.
6. Temecula census source: detailed answer for question D.
7. Evaluation evidence: detailed answer for question E.
8. Restricted opportunity findings: detailed answer for question F. Rank
   sources by technical value, not ease of access, and state why each is unique.
9. Safe-now experiments: at most six bounded hypotheses that can be tested with
   current authorized access. Include development sample size, expected
   incremental comparison coverage, exact success/failure evidence, expected
   requests/runtime/dollars, refresh path, and stop condition.
10. Permission-gated validation plans: at most six bounded hypotheses that
    should run only after permission or a contract. Do not give bypass
    instructions. State the exact permission prerequisite and evidence the pilot
    would produce.
11. Deal briefs: for the five highest-value permission-gated opportunities,
    identify the controller and likely decision-maker; exact data, fields,
    geography, refresh, and rights requested; smallest pilot; mutual value
    exchange; provenance/privacy/retention/attribution terms; likely pricing or
    minimums; inferred coverage upside; negotiation stop ceiling; and fallback.
12. Rejected/redundant ideas: list repeated, disproven, technically low-value,
    economically implausible, or prohibited/unsafe ideas. Do not reject a
    technically strong source merely because present access is unavailable.
13. Open questions: facts you could not verify and the human or primary source
    most likely to answer each one.

Do not write code. Do not estimate coverage from provider marketing language.
Do not count raw records or raw images as success. A recommendation without a
primary-source citation and a bounded verification plan must be labeled
unproven. A source that needs permission must be labeled permission-gated, not
quietly discarded.
```
