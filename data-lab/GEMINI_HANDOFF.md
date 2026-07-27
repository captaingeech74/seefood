# Gemini Deep Research Handoff

## Status

**PROMPT 2 COMPLETED AND TRIAGED — 2026-07-27**

Prompt 1 and Prompt 2 are complete and triaged. No third Gemini prompt is
queued. The remaining decisive gaps require a controller-supplied schema and
rights packet or measured SeeFood evidence, not another public-web synthesis.

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

## Prompt 1 — Completed

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

## Prompt 2 — Completed

Kyle returned the complete response on 2026-07-27. Gemini identified Tattle and
Ovation as transaction-triggered feedback candidates. Primary-source review
verified Tattle's existing Customer meal-photo upload and national platform
footprint, but not exact photo-to-order-line binding, a usable photo export
schema, SeeFood-compatible rights, photo yield, or incremental comparison
coverage. Ovation verified the order-targeted survey concept but not a current
meal-photo upload.

Gemini's quantified table confused raw photo attempts with distinct
comparison-ready restaurants and assumed 100% precision. Both claims were
rejected. The complete triage and corrected model are recorded in
`experiments/DL-DR-002-customer-photo-game-changer-triage.md`.

Archived prompt:

Copy everything inside the block verbatim:

```text
You are conducting a final, decision-grade Deep Research investigation for
SeeFood DataLab as of July 23, 2026.

SeeFood displays restaurant dishes using a Management photo alongside a
Customer photo of the same current menu item. Transformative menu and
Management-photo coverage would already be a major win. Kyle's working
hypothesis is that this stronger product could attract users who later
contribute Customer photos, but that cold-start effect is not yet verified.
This investigation must search much harder for a game-changing Customer-photo
opportunity and identify any evidence bearing on that hypothesis.

The decision after this research is whether the potential justifies a large,
multi-stage DataLab program. Do not return a generic source survey. Look for
one source or a complementary portfolio of at most three sources that could
plausibly transform SeeFood's data coverage nationally, double its
comparison-ready coverage under a stated baseline scenario, or create a durable
transaction-linked Customer photo acquisition loop. Temecula is the development
and validation market, not the scope of the opportunity. A candidate cannot
qualify as a game changer based only on improving Temecula.

Research only. Do not create accounts, contact companies, use credentials,
access private systems, crawl sites, bypass controls, or recommend evasion.
Restricted, private, partner-only, or currently unavailable data is still in
scope as an opportunity: identify the controller and the exact permission,
exception, license, clean-room arrangement, merchant authorization, or bespoke
deal that could make a bounded pilot legitimate.

Use primary sources wherever possible. Every material claim must include an
exact working URL, page title, publisher, and publication/update date when
available. Mark secondary evidence and inference clearly. Do not label a
capability verified without a citation that directly shows the relevant field
or workflow. Every shortlisted Customer candidate must have a primary-source
citation that directly proves both the Customer-photo field/workflow and the
stated access path. Every shortlisted Management-only candidate must have
equivalent primary proof for current menu/item-linked Management photos and
access. Move uncited candidates to Open Questions; do not shortlist them.

Already known; do not repeat these as discoveries:

1. Yext documents item-linked Management menu photos, but its documented
   Reviews schemas do not show Customer photo fields.
2. Generic image search, scraped social posts, and unattributed public photos
   are not sufficient.
3. Google Places photos do not provide SeeFood with reliable exact-item linkage.
4. Flipdish, Square, Google Business Profile, Toast, and GloriaFood remain
   Management-side opportunities. Do not redo Prompt 1's source survey. Use
   their prior evidenced potential when evaluating a combined portfolio or the
   overall program, and clearly separate that prior evidence from new findings.
5. A source is not low value merely because access requires a partner deal or
   custom permission.

Resolve this high-priority Tripadvisor lead rather than relying on the earlier
summary: Tripadvisor's current Terra documentation says the platform covers
restaurants and delivers reviews and photos; its Location Reviews endpoint
describes reviews with titles, bodies, photos, and reviewer details. Legacy
partner PhotoList documentation exposes caption, author, photo ID, and review
ID fields, but those products are migrating to Terra. Determine exactly which
of those fields Terra exposes for restaurant reviews/photos, the available
review/photo depth by tier or custom feed, national restaurant coverage,
caption and review-to-photo linkage, whether that linkage is one-photo/one-dish
or an ambiguous multi-photo/multi-dish review, permitted
matching/display/retention use, pricing, and the smallest authorized sample. Do
not assume legacy fields, restaurant eligibility, or rights carry into a
current contract. Tripadvisor's published Master Terms restrict AI/ML and
algorithmic use, modification/derivatives, combining licensed content with
other content, selective display, and caching. Determine whether a negotiated
Order can and realistically would grant explicit written exceptions for dish
matching, pairing Customer photos with non-Tripadvisor Management menus/photos,
matched-photo selection, persistent retention, derived dish labels, and any
model inference or training. If not, treat the technical opportunity as
commercially unusable for SeeFood.

Start with:
- https://docs.terra.tripadvisor.com/docs/overview
- https://docs.terra.tripadvisor.com/reference/locationreviewsget
- https://developer-tripadvisor.com/partner/mega-feeds/photolist-mega-feed/index.html
- https://developer-tripadvisor.com/partner/index.html
- https://developer-tripadvisor.com/partner/master-partnerships-terms-and-conditions/index.html

Investigate five source classes deeply:

A. Existing transaction-linked Customer photos

Search delivery marketplaces, online-ordering systems, POS providers, digital
receipt products, restaurant feedback platforms, guest-experience systems,
loyalty/CRM vendors, reservation platforms, and restaurant review products.
Look specifically for customer-uploaded photo or media fields connected to an
order, order line, purchased item, menu item, SKU, review, or receipt.

B. Existing restaurant/dish UGC corpora

Search restaurant discovery apps, dish-review communities, food journals,
reservation/review networks, local guides, social food products, data vendors,
and discontinued products whose data may have been acquired. A useful source
must preserve restaurant identity and either direct dish identity or enough
evidence for a high-precision match.

C. UGC licensing and rights infrastructure

Search content licensors, UGC-rights-management platforms, social-content
permission vendors, restaurant marketing agencies, review syndicators, and
enterprise data aggregators that may control or broker reusable Customer food
photos. Identify whether a custom restaurant/dish feed could be negotiated even
if no public product advertises it.

D. Transaction-triggered contribution channels

Find platforms through which SeeFood could ask a verified purchaser to upload a
photo of the exact item just ordered: receipt links, post-order SMS/email,
loyalty apps, order-status pages, POS app marketplaces, delivery webhooks,
merchant CRM automations, or feedback flows. Determine whether the purchased
line-item identity can be passed into the upload request and whether the
customer can grant SeeFood durable display and matching rights.

E. Unconventional high-upside opportunities

Look for acquisitions, dormant datasets, academic or commercial food-photo
corpora, restaurant media archives, merchant cooperatives, franchise systems,
menu/photo production vendors, or other controllers that could unlock unusual
scale. Do not include a dataset merely because it contains food images; it
needs restaurant and dish value.

F. Creative evidence fusion

Investigate whether weak individual signals can combine into a high-precision,
nationally repeatable item match: photo captions; linked review title/body;
review IDs; author albums or upload sessions; timestamps; dish names mentioned
near a photo; OCR of receipts, packaging, menus, or visible text; order-line
context; multiple photos in one review; cross-source exact/perceptual duplicate
evidence; and multimodal comparison against a current Management menu/photo.
For each method, distinguish evidence usable for matching from content SeeFood
may display, identify rights/privacy constraints, evaluate it against the fixed
DataLab precision gates, and estimate how much national Customer-photo supply
it could convert into strong matches. Do not treat model confidence alone as
ground truth. A technically
possible match is worthless if the applicable source terms prohibit the
analysis, derived label, combination, retention, or display; identify the exact
written exception needed. Do not invent a weaker source-specific quality bar:
all projected strong matches must satisfy `BENCHMARK_SPEC.md`, including its
item-match and provenance precision, wrong-restaurant, and duplicate-image
requirements.

For every credible candidate, determine:

- whether photos already exist or would need to be newly collected;
- Management, Customer, or unknown authorship;
- restaurant/location identifier;
- menu-item, order-line, SKU, dish, review, and transaction identifiers;
- available photo URL/file, author/contributor, timestamp, review text, and
  consent/license fields;
- direct item linkage versus inferred matching;
- approximate restaurant footprint and geographic reach;
- evidence of photo population or contribution rate;
- API, export, webhook, clean room, licensed feed, merchant-mediated access, or
  custom-deal path;
- display, retention, attribution, deletion, derivative matching, and model-use
  rights;
- freshness and repeatability;
- likely pricing, minimum commitment, and controller;
- smallest authorized pilot; and
- low, base, and high coverage upside with every assumption shown.

Model the complete conversion funnel for capture channels: eligible restaurant
locations → locations with a Management-photo counterpart → reachable verified
purchasers → upload conversion → rights-valid Customer photos → strong
item-match precision → deduplicated comparison-ready restaurants. Report time
and cost per incremental comparison-ready restaurant.

Keep three judgments separate:

1. Technical potential: Could this materially transform menu/photo or
   comparison-ready coverage?
2. Current access posture: Open/Public, Merchant-authorized, Partner-only,
   Commercial license, Custom permission, Observable but unauthorized,
   Terms/rights unclear, Prohibited/unsafe, or Unknown.
3. Action: Test now, Pursue permission, Pursue a commercial deal, Monitor, or
   Do not pursue.

Apply a high bar. A "game changer" may be one source or a complementary
portfolio of at most three access paths. It should plausibly provide one of:

- at least a plausible 20 percentage-point absolute increase in US restaurants
  with a current menu and one strong Management photo;
- an existing, rights-usable Customer-photo corpus with meaningful restaurant
  and dish evidence at nationally meaningful scale;
- an integration or partnership capable of producing verified,
  line-item-linked contributions nationally; or
- a defensible route to doubling SeeFood's comparison-ready restaurant
  coverage under at least one explicit baseline scenario.

SeeFood's audited baseline is not yet available. Therefore, do not claim
"doubling" from an assumed denominator. Report standardized low/base/high
outcomes per 1,000 eligible restaurants and total US addressable restaurants.
Then show the expected Temecula result as a validation slice, not the value
case. Evaluate both individual sources and complementary portfolios. State what
future measured baseline would be required for each candidate or portfolio to
double coverage.

Return exactly these sections:

1. Brutally honest verdict in no more than six bullets:
   a. Customer side—Yes, No, or Unclear: does at least one plausible
      Customer-photo game changer exist?
   b. Overall program—Yes, No, or Unclear: can transformative national menu and
      Management-photo gains, Customer-photo gains, or their combined flywheel
      justify the full DataLab?
2. Game-changer shortlist: at most five individual candidates and at most three
   complementary portfolios, ranked by potential rather than ease of access.
3. Evidence matrix: one row per candidate with exact capability, existing
   corpus versus capture channel, direct item linkage, author and rights
   evidence, restaurant footprint, access posture, controller, pricing,
   low/base/high upside, confidence, and primary citations.
4. Existing-corpus findings: detailed evidence for classes A through C.
5. Transaction-triggered acquisition findings: detailed evidence for class D,
   including the exact order-line-to-upload data flow when documented.
6. Unconventional findings: detailed evidence for class E.
7. Creative matching findings: detailed evidence for class F, with a ranked
   signal-fusion plan and realistic precision/coverage limits.
8. Permission and deal briefs: for each shortlisted candidate, give the exact
   data/right ask, likely decision-maker, smallest pilot, mutual value exchange,
   delivery method, security/privacy/retention terms, pricing or minimums,
   success gate, negotiation stop condition, and fallback.
9. Quantified national upside: compare each candidate against the game-changer
   bar. Separate sourced facts from arithmetic assumptions. Do not turn
   provider marketing footprint into expected SeeFood coverage. Report
   Temecula only as the first validation slice.
10. Fast falsification plan: the smallest research, sample, or authorized pilot
   that could kill each thesis before substantial engineering.
11. Rejected paths: false positives, weak generic-photo sources,
    non-transformative Management-only sources, and ideas lacking
    restaurant/dish identity.
12. Open Questions: uncited but potentially important candidates, the exact
    missing proof, and the primary source or decision-maker most likely to
    resolve it.
13. Final recommendation for the full national DataLab: Proceed, Proceed only
    if one named permission is obtained, or Stop. State the single strongest
    reason.

Do not write code. Do not pad the result with ordinary menu providers. Do not
count raw photos as success. If no candidate clears the bar, say so plainly.
```
