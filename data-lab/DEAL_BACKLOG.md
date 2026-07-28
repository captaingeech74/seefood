# Permission And Deal Backlog

This file preserves high-value blocked paths without pretending they are usable
or measured. It follows `ACCESS_OPPORTUNITY_POLICY.md`. No entry authorizes
outreach, spending, account creation, or data access.

## Ready For Human Outreach

DoorDash is technically ready for a narrowly scoped documentary request, but
the DataLab is not authorized to send it. DL-013 passed schema and national
geography, then failed to find a standard marketplace-wide read grant or the
required downstream rights. Kyle must explicitly authorize contact.

The Gemini reports proposed several deals, but supplied no usable citations and
overstated multiple photo and coverage claims. DL-DR-001 and DL-DR-002 retained
only the evidence-supported opportunities below. Kyle and the main SeeFood
thread decide whether an entry ever becomes outreach-ready.

## DoorDash — Read-Only Menu And Management-Photo Data Path

**Readiness:** Documentary ask ready. No outreach without Kyle's explicit
approval, and no connector or pilot until the response passes.

**Technical value:** Potentially High and now partly measured. In the selected
DL-002 evidence packet, all 168 rendered DoorDash records were exact item
matches and 164 were useful food images. All 168 were classified as Management
because they came through a management-catalog source, but original
merchant/POS/controller authorship was not verified and rights were unreviewed.
The packet was selected around claims and rich controls, so it proves payload
quality rather than national location yield. Every rights status remained
unreviewed.

DL-013 confirmed official authenticated menu schemas with documented menu,
category, and item identifiers plus an item-level `original_image_url` field,
and a public store-sitemap index covering all 50 states, DC, and Puerto Rico.
It did not measure identifier stability or image population. Standard
Marketplace reads are limited to merchants onboarded or configured to the
active integration; DoorDash says the Marketplace program is approval-only and
currently at capacity. Standard merchant/developer terms do not grant SeeFood
the required national reuse rights.

The standard connector result does not falsify scraping. National sitemap
discovery, working RSC extraction, and the selected-record quality result make
public-store extraction a potentially High technical path. It remains a
separate experiment with unresolved retrieval reliability, coverage,
provenance, refresh, duplication, machine cost, and access posture.

**Controller:** DoorDash partnerships or platform/data licensing, plus
participating merchants where merchant authorization or image rights require
it. The exact current decision-maker and eligible program must be confirmed.

**Exact documentary ask:** A redacted schema and terms packet for a read-only
restaurant/menu catalog path containing stable location, menu, item, image,
availability, source-observation, and deletion identifiers. Request rights to
retain approved menu/photo records, match images to items, display them with
attribution, combine Management photos with separately rights-cleared Customer
photos, and propagate removal.

**Smallest pilot after the documentary gate:** At most 30 restaurants and 300
item images across multiple hidden national market-size/division strata plus a
Temecula validation slice. No order, customer, courier, payment, or personal
data. One initial read and one bounded repeat.

**Success:** A credible route to at least a 20-percentage-point national gain in
current-menu-plus-strong-Management-photo coverage; at least 95% item-match
precision with a Wilson lower bound of at least 90%; at least 95% retained
records on repeat; zero wrong-restaurant links; explicit display, retention,
combination, and deletion rights; and acceptable unique-location economics.

**Value exchange:** SeeFood could provide item-level visual discovery and route
qualified users to merchant-approved DoorDash destinations. No traffic,
revenue, ranking, attribution, or exclusivity promise is authorized.

**Stop conditions:** No allowed discovery/display use, no combination with
separately licensed Customer content, no stable item-image binding, no
nationally broad eligible footprint, or economics incompatible with the
incremental restaurant value.

**Pricing and delivery:** Unknown. Prefer a $0, read-only evaluation fixture or
sandbox with no minimum commitment. Only Kyle or the main thread may authorize
outreach, contract work, credentials, or spending.

**Fallback:** Toast, Flipdish, Google Business Profile, Square, or first-party
merchant capture. Public extraction is not a commercial fallback unless its
access and downstream rights are separately established.

## Tattle — Transaction-Triggered Customer Photo Partnership

**Readiness:** Highest-priority Customer opportunity, but still behind a
documentary schema-and-rights gate. Not ready for outreach from the DataLab.

**Technical value:** Potentially High. Tattle already documents the difficult
building blocks: post-transaction SMS/email surveys, ordered-item context,
item-level feedback, an optional guest meal-photo upload, API access, advanced
exports, 34+ named integrations, 250+ brands, and a claimed 15,000+ locations.
Public evidence does not show that the uploaded photo is attached to one exact
order line, exportable with that relationship, or reusable by SeeFood.

**Controllers:** Tattle plus the participating restaurant or brand, which
Tattle's public privacy materials describe as controller for survey feedback.
The Customer/photographer must receive the required notice and grant the
required rights. A broad Tattle platform license does not by itself prove the
restaurant may transfer the image to SeeFood.

**Exact documentary ask if Kyle authorizes human contact:** One redacted
schema/export example and applicable contract language proving:

1. stable location, transaction, exact order-line/item, and photo identifiers;
2. the photo capture and selected-item interaction for multi-item orders;
3. a supported export/API delivery path with deletion state;
4. controller authority and Customer consent for SeeFood retention, pairing,
   display, derived labels, sublicensing as needed, deletion propagation, and
   any agreed model use; and
5. exact active locations eligible for the relevant POS/order integrations.

**Smallest data pilot after the documentary gate:** Aggregate funnel counts for
at least 1,000 already-delivered, lawfully consented prompts plus a blinded
35-photo historical fixture from at least 10 locations, deliberately including
multi-item orders. The fixture excludes names, phone/email, payment data, free
text, device IDs, and exact timestamps. The DataLab does not send messages or
export a customer list.

**Pilot success:** At least 95% audited point precision for restaurant and
exact/strong item attachment, with the Wilson interval reported; zero missing
rights; zero duplicate Management/Customer pairs; a documented refresh and
deletion path; and enough unique comparison-ready restaurants to satisfy a
baseline-derived national scale model. Raw photos are not success.

**Immediate stop conditions:** No exact photo-to-line binding, no supported
photo export, no participating-controller authority, no Customer grant for
SeeFood's intended use, or no credible path from Tattle's claimed footprint to
the frozen national gate.

**Value exchange to test:** SeeFood could return item-level presentation and
comparison analytics to participating brands and route visual-discovery traffic
to brand-approved ordering destinations. No traffic, revenue, exclusivity, or
improvement promise is authorized.

**Economics:** Current public per-location pricing is not a SeeFood data-deal
quote. Do not adopt Gemini's invented `$15,000` integration estimate or
`$0.10-$0.25` photo estimate. Set a ceiling only after verified unique
comparison yield and the frozen baseline establish the value.

**Fallback:** Ovation, if it can first prove a real meal-photo question, exact
order-line export, and equivalent rights. A first-party SeeFood contribution
loop remains the strategic fallback.

## Toast Menus V3 — Technology Partnership

**Readiness:** Evidence gate, not ready for outreach.

**Technical value:** High Management-menu potential, inferred. Official Toast
documentation confirms menu entities, partner-specific channel filtering,
ordering-partner-only `menus.channel:read` access, and one request per second
per location. The reviewed documentation did not establish item-image fields,
SeeFood's eligibility as an ordering partner, display rights, or populated-photo
yield.

**Controller:** Toast Partner Ecosystem. The exact decision-maker and current
program requirements are not yet verified.

**Exact ask if the evidence gate passes:** Read-only Menus V3 sandbox access
and a five-location, five-consenting-merchant pilot. Requested fields are
location identity, published menu/item IDs, names, descriptions, prices,
modifier structure, channel visibility, availability, and item-linked image
references if the API supports them.

**Pilot success:** At least four of five merchants return current menu payloads;
item images are explicitly linked when present; identity and provenance pass
Guardian review; a repeat pull is stable; and at least one restaurant gains an
incremental strong Management match. A Management-only result still receives
no comparison-dish credit without Customer supply.

**Value exchange to test:** SeeFood could provide item-level visual discovery
and route qualified diners to merchant-approved Toast ordering destinations.
No revenue, attribution, exclusivity, or traffic promise is authorized.

**Rights and safety terms to settle:** Merchant consent, permitted fields,
allowed display and derivative matching, attribution, image rights, cache and
deletion windows, refresh cadence, location removal, security review, audit
rights, and whether data may be combined with non-Toast Customer photos.

**Delivery and refresh:** Menus V3 using partner tokens and the documented
one-request-per-second/location limit. Webhooks or change feeds are not assumed.

**Economics:** Unknown. Do not invent a per-item ceiling before the national
baseline and Temecula validation establish the value of one additional
verified comparison-ready restaurant. No paid commitment may be made by the
DataLab.

**Coverage upside:** Unknown until the baseline, photo-field proof, merchant
population, and authorized pilot. Gemini's nationwide upside language is not
accepted as an estimate.

**Evidence required before outreach:** Official item-image schema or a
controller-confirmed sample payload; program eligibility for a discovery
product; current partner terms; pilot availability; and a baseline-derived
maximum acquisition cost.

**Fallback:** Flipdish or Google Business Profile merchant-authorized pilots,
plus first-party Management capture. Public Toast payload extraction is not a
deal fallback unless separately authorized and tested.

## Permission Pilots, Not Commercial Deals

| Source | Why retained | Exact prerequisite | Current next action |
|---|---|---|---|
| Flipdish V3 | Official item `imageUrl`, UUIDs, modifiers, and availability | Merchant-authorized OAuth app; beta access as required | DL-003 after baseline |
| Google Business Profile FoodMenus | Official item-level `mediaKeys` | Google API approval plus merchant OAuth | DL-010 after baseline |
| GloriaFood Menu API | Official menu API and closing service window | Existing merchant permission before March 31, 2027 | DL-009 after baseline |

### Flipdish V3 — Merchant Permission Brief

**Controller and decision-makers:** Flipdish Developer Relations or platform
partnerships controls app/API eligibility; each participating restaurant
controls authorization to its own menu.

**Exact ask:** A read-only OAuth application and any required Menu Management
V3 beta approval for three consenting development merchants. Request restaurant
and menu IDs, item UUIDs, names, descriptions, prices, modifier trees,
availability by channel, `imageUrl`, and documented menu-publication events.
Request permission to retain a frozen research fixture, display approved images
in a test, and derive item matches. Geography is limited to the three merchants.

**Smallest pilot and success:** One current menu per merchant, at most 100 items
and 30 downloaded item images total, followed by one repeat pull. At least two
merchants must have populated item images, identity and provenance must pass
Guardian review, and at least one restaurant must gain an incremental strong
Management match. It earns no comparison credit without an independently
qualified Customer photo.

**Unique value:** Flipdish is the best-documented newly researched source with
stable item IDs, direct image URLs, nested modifiers, channel availability, and
a possible publication event in one merchant-authorized path.

**Value exchange:** SeeFood can offer attributed visual discovery, a menu/photo
quality report for each pilot merchant, and routing to merchant-approved
ordering destinations. No traffic volume or revenue promise is authorized.

**Terms to settle:** Merchant ownership and consent; image display and
derivative-match rights; attribution; personal-data exclusion; retention,
revocation, deletion, cache, and refresh rules; permitted geographies; and
whether beta webhook payloads may be stored for reproducibility.

**Delivery and security:** OAuth with least-privilege read access; encrypted
secret handling outside committed files; item UUIDs as provider identifiers;
one initial and one repeat menu pull; webhook testing only if explicitly
enabled. No orders or customer records. No pilot SLA is requested; record
response latency, failures, retries, and whether the repeat pull completes
within the merchant-authorized test window.

**Pricing and stop ceiling:** Request a $0, three-merchant research pilot with no
minimum commitment. Stop before account activation if paid fees, usage
commitments, or broader security work are required; only Kyle or the main thread
may set a later commercial ceiling after the baseline.

**Estimated upside:** Unverified and capped at three additional
Management-covered restaurants in this pilot. Comparison upside is unknown.

**Fallback:** Google Business Profile, Square, or first-party merchant capture.

### Google Business Profile FoodMenus — Merchant Permission Brief

**Controller and decision-makers:** Google Business Profile API access review
controls application eligibility; each verified location owner or manager
controls OAuth authorization.

**Exact ask:** Read-only access for three consenting locations to FoodMenus,
item attributes, item-level `mediaKeys`, and the minimum media metadata needed
to resolve those keys. Request research-fixture retention, display,
attribution, and derivative item-matching rights consistent with Google policy.
Do not request update privileges even if the OAuth scope can authorize them.

**Smallest pilot and success:** Three current menus, at most 100 menu items and
30 resolved images total, plus one repeat read. At least two locations must
populate `mediaKeys`; restaurant identity, Management provenance, and exact
item linkage must pass Guardian review; and at least one restaurant must gain
an incremental strong Management match.

**Unique value:** This is a merchant-maintained menu surface tied to a stable
business identity and documented item-level media references. It could span
providers without a connector for each restaurant website or POS.

**Value exchange:** SeeFood can return a menu completeness and photo-linkage
report and route users to merchant-approved destinations. No claim of improved
Google ranking or guaranteed traffic is authorized.

**Terms to settle:** Google API policy and app verification; merchant consent;
media retrieval and display; attribution; caching, retention, deletion, and
refresh limits; derivative matching; data commingling; location revocation;
privacy; and whether a read-only product can safely use a scope that also
permits writes.

**Delivery and security:** Google OAuth with offline access only if approved
and necessary; tokens outside the lab repository; provider location, menu item,
and `mediaKeys` retained only as allowed; one initial and one repeat pull. The
lab must not write or update a Business Profile. No pilot SLA is requested;
measure response latency, failures, quota responses, and repeat-read
availability.

**Pricing and stop ceiling:** Request a $0 three-location pilot under existing
free quota. Stop if approval requires paid services, a security expenditure, or
unbounded review work. Any later budget must be set by Kyle or the main thread
after measured value.

**Estimated upside:** Unverified and capped at three Management-covered
restaurants in the pilot. Merchant population of `mediaKeys` and comparison
upside are unknown.

**Fallback:** Flipdish, Square, or first-party menu/photo capture.

### GloriaFood Menu API — Merchant Permission Brief

**Controller and decision-makers:** An existing GloriaFood restaurant controls
permission to export its menu; Oracle controls the remaining service and API
availability.

**Exact ask:** Permission from one existing merchant for one read-only Menu API
request or merchant-generated export containing restaurant/menu IDs,
categories, items, prices, modifiers, and item-linked image references if
present. Explicitly request the right to preserve a frozen research fixture and
merchant-approved images after service shutdown. Exclude orders, customers,
credentials, and unrelated account data.

**Smallest pilot and success:** One menu, at most 500 items and 50 images, with a
second checksum or repeat export only if the platform permits it. The structure
must parse reproducibly, image linkage and Management provenance must pass
Guardian review, and the fixture must remain usable under the merchant's
permission after March 31, 2027.

**Unique value:** This is a closing-window preservation opportunity. A complete
merchant-authorized hierarchy may retain structured menu evidence that would
otherwise disappear when GloriaFood ends service.

**Value exchange:** SeeFood can return a normalized archival menu and data
quality report to the merchant and preserve continuity for a future
merchant-controlled migration. No promise to replace GloriaFood is authorized.

**Terms to settle:** Merchant ownership and authorization; Oracle platform
terms; image display and derivative use; post-shutdown retention; attribution;
deletion and revocation; security; and confirmation that only menu data is
included.

**Delivery and security:** Merchant-generated export is preferred if it avoids
credential sharing. Otherwise use the documented read-only menu path with
merchant-created, least-privilege credentials handled outside committed files.
One request or export; no crawl and no customer/order endpoints. No SLA is
requested for a discontinued product; record availability, response latency,
failure mode, and whether one verification pass succeeds before shutdown.

**Pricing and stop ceiling:** Request a $0 one-merchant preservation pilot.
Stop if it requires any new paid service, minimum commitment, credential
sharing outside a secure authorized handoff, or more than one menu plus one
verification pass.

**Estimated upside:** Unverified and capped at one Management-covered restaurant
and one preserved menu in the pilot. Comparison upside is unknown.

**Fallback:** A merchant-supplied CSV/PDF and first-party photo capture, clearly
recording the loss of structured modifier and image linkage.

## Commercial Candidate Requiring A Kyle Decision

| Source | Why retained | Why not ready |
|---|---|---|
| DoorDash | DL-002 measured 168/168 exact Management item matches and 164/168 useful images; DL-013 confirmed official item-image schemas and sitemap entries for all 50 states, DC, and Puerto Rico | Standard APIs expose only configured merchants, the partner program is currently at capacity, and national eligible-location/image yield plus retention/display/combination rights, refresh, and economics remain private |
| Tattle | Current docs establish transaction context, ordered-item feedback, optional meal-photo upload, API/export capability, and claimed 15,000+ location reach | Exact photo-to-order-line binding, photo export schema, controller/Customer rights, photo yield, Management overlap, and unique-location coverage are private and unmeasured |
| Ovation | Current docs establish 50+ SMS integrations and questions targeted to what a guest ordered | No public meal-photo upload, media export, stable order-line schema, exact footprint, or third-party reuse rights |
| Tripadvisor Terra | Current docs describe restaurant reviews with photos, review text, and reviewer details; legacy partner feeds show caption and review-ID fields that may aid matching | Published Master Terms appear incompatible with SeeFood matching and pairing absent explicit written exceptions. Treat as unusable unless an Order permits algorithmic dish matching, combination with Management content, selective display, retention, derived labels, and model use, plus acceptable national depth and economics. |

## Monitor, Not Outreach

| Source | Missing proof |
|---|---|
| Slice | Public partner portal confirms shop/menu integration but not item-image or fractional-modifier fields, display rights, or economics. |
| Lightspeed K-Series | Merchant OAuth and menu/item APIs are documented; item-image schema was not found. |
| Clover | Current documented inventory item schema does not expose image fields. |
| Yext | Item-linked Management menu photos are documented; review-photo fields are not. The Customer-photo thesis is unsupported. |
