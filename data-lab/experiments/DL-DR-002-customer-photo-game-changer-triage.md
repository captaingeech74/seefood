# Experiment: DL-DR-002 Customer-Photo Game-Changer Triage

## Decision Target

Does Gemini Round Two establish enough national Customer-photo potential to
justify continuing the bounded DataLab program, and what must be proved before
SeeFood builds or buys a transaction-triggered photo channel?

## Hypothesis

One existing feedback platform or a portfolio of at most three paths has
national reach, transaction context, ordered-item context, Customer photo
capture, and a plausible permission path. If verified, it could materially
increase restaurants with at least one strong Management/Customer comparison.

## Safety

Research only. No production access, API account, vendor contact, customer
outreach, crawl, paid service, quota consumption, deployment, or infrastructure
change occurred.

## Inputs

- Kyle supplied Gemini's complete Round Two response on 2026-07-27.
- The response contained no usable citation URLs despite the prompt's
  requirement.
- The Lead and independent Source Scout checked current first-party product,
  partner, pricing, privacy, and case-study pages.
- The Benchmark Guardian independently rebuilt the quantitative model.
- The Adversarial Verifier independently checked Ovation and attacked the
  access, privacy, and precision assumptions.

## Verified Findings

### Tattle

Tattle is a real and unusually relevant collection surface:

- its current FAQ says integrations trigger email or SMS feedback requests
  about 90 minutes after a transaction and reports roughly 10% survey
  participation;
- its current product pages document item-level feedback powered by ordering
  and loyalty integrations, with order details pre-populated;
- its first-party Photo Wall description says a guest can optionally upload an
  image of their meal at the end of a survey;
- a current Mellow Mushroom case study confirms that guests attach photos to
  survey submissions and that restaurant teams export Tattle data to BI
  platforms through APIs;
- its current integration page names 34+ integrations and offers custom
  integrations;
- its About page claims 15,000+ locations, while current product pages claim
  250+ brands; and
- its pricing page advertises advanced exports and API access.

These facts establish a credible national custom-collection partner, not a
comparison-ready corpus. Public evidence binds a meal photo to a survey, visit,
and transaction context. It does not prove an immutable photo-to-order-line
field, multiple-item disambiguation, a photo export payload, photo-upload rate,
usable-food-photo rate, exact-item precision, or SeeFood's reuse rights.

The published 92%--97% completion figures concern people who started the
survey. They are not purchaser-to-photo conversion rates. Current first-party
pages disagree on the exact integration and completion counts, so the minimum
directly evidenced claims are used.

Primary evidence:

- [Tattle FAQ](https://get.tattleapp.com/resources/faq/)
- [Tattle integrations](https://get.tattleapp.com/integrations/)
- [Tattle feedback collection](https://get.tattleapp.com/features/feedback-collection/)
- [Tattle item-level feedback](https://get.tattleapp.com/features/item-level-feedback/)
- [Tattle Photo Wall description](https://get.tattleapp.com/blog/20-ways-gms-can-save-time-and-eliminate-operational-guesswork-using-tattle/)
- [Mellow Mushroom case study](https://get.tattleapp.com/success-stories/mellow-mushroom/)
- [Tattle footprint](https://get.tattleapp.com/about/)
- [Tattle pricing, export, and API features](https://get.tattleapp.com/pricing/)
- [Tattle privacy policy](https://get.tattleapp.com/privacy-policy/)
- [Olo's Tattle partner listing](https://partners.olo.com/partners/tattle/)

### Ovation

Ovation is a credible second lead:

- its current platform says it has 50+ SMS-based integrations;
- its Spring 2026 release documents automatic questions tied to what a guest
  actually ordered; and
- current case studies document high survey volume at multi-unit brands,
  including more than 500 surveys per month per location at one 100+ location
  brand.

No current public evidence was found for a Customer meal-photo upload,
photo/order-line export schema, public webhook/API for this use, exact national
location footprint, or third-party reuse rights. The 30-minute trigger is
documented for particular integrations, not universally.

Primary evidence:

- [Ovation feedback](https://ovationup.com/platform/feedback/)
- [Ovation Spring 2025 release](https://ovationup.com/spring-2025-release/)
- [Ovation Spring 2026 order-targeting release](https://ovationup.com/spring-2026-release/)
- [Ovation integrations](https://ovationup.com/integrations/)
- [Ovation privacy policy](https://ovationup.com/privacy-policy/)
- [Ovation customer agreement](https://ovationup.com/customer-agreement-terms/)
- [Toast's Ovation partner listing](https://pos.toasttab.com/partners/directory/ovation)

### Existing Corpora

Round Two added no evidence that makes Tripadvisor, Yelp, or Foursquare a
decision-grade source of durable, exact-item Customer photos. Tripadvisor's
current public terms remain incompatible with SeeFood's default intended
matching, retention, selective pairing, and model use unless a negotiated
written Order changes them.

## Quantitative Correction

Gemini's low/base/high arithmetic correctly calculates raw upload attempts
under its assumptions:

| Scenario | Raw upload attempts in six months | Absolute comparison-ready restaurant cap |
|---|---:|---:|
| Low | 1,200 | 500 |
| Base | 14,175 | 700 |
| High | 111,562.5 before integer handling | 850 |

The report then incorrectly relabeled photos as comparison-ready restaurants.
For 1,000 starting locations, a restaurant count can never exceed 1,000, and
under Gemini's Management-counterpart assumptions cannot exceed 500, 700, or
850.

The correct accepted-photo funnel is:

`locations × Management-ready rate × orders × months × lawful reach × photo
upload rate × qualifying-line rate × rights-valid rate × useful-photo rate ×
strong-item precision × nonduplicate yield`

Comparison dishes and comparison-ready restaurants are distinct counts over
the accepted records. They cannot be inferred from total photos without the
per-location and per-dish distribution.

Gemini's 100% precision claim is rejected. A POS order line does not establish
that an uploaded image depicts the selected line, particularly for multi-item
orders. It also does not prove a current Management-photo counterpart, useful
content, Customer provenance, reusable rights, or nonduplication.

## National Game-Changer Screen

The transaction-triggered Customer channel presupposes Management coverage and
therefore cannot itself satisfy the Management-side `+20 percentage points`
gate.

It can satisfy the alternative `2× comparison-ready coverage` gate only when:

`enabled footprint × accepted unique-location yield × (1 - overlap) >= frozen
existing comparison-ready baseline`

Tattle's claimed 15,000+ locations makes national significance plausible, but
the enabled photo footprint, Management overlap, accepted yield, and existing
baseline are unknown. Therefore Round Two is arithmetically capable of a game
changer but does not establish one.

## Fast Falsifier

Do not export a merchant customer list or send a DataLab SMS campaign.

First require a merchant/controller-authorized, sanitized schema-and-rights
packet. Stop immediately unless it contains:

1. stable restaurant/location, transaction, exact order-line/item, and photo
   identifiers;
2. a current menu item and strong Management-photo counterpart;
3. explicit Customer consent and controller authority for SeeFood retention,
   pairing, display, derived labels, deletion propagation, and any agreed model
   use; and
4. a documented photo export or delivery method.

If those pass, the smallest data probe uses already-authorized historical
records: aggregate funnel counts for at least 1,000 already-delivered prompts
and a blinded 35-photo bundle from at least 10 locations, deliberately including
multi-item orders. Remove names, phone/email, payment data, free text, device
IDs, and exact timestamps. The Guardian audits all 35 and reports Wilson
intervals, duplicates, exact/strong item matches, and unique dishes and
restaurants. Fewer than 35 auditable records leaves the thesis unproven.

## Independent Verification

- The Source Scout verified Tattle's transaction, item-feedback, meal-photo,
  API/export, and national-footprint claims and rejected exact-item linkage and
  rights as unproved.
- The Adversarial Verifier verified Ovation's order-targeted surveys and
  rejected a generalized 30-minute trigger, meal-photo support, export schema,
  and third-party rights as unproved.
- The Benchmark Guardian independently reproduced the raw-photo arithmetic,
  found the photo-versus-restaurant unit error, rejected 100% precision, and
  specified the corrected funnel and safe falsifier.

No implementer evaluated its own output.

## Decision

**Revise and proceed with bounded validation.**

The DataLab has enough plausible national upside to continue. It does not yet
justify building a feedback-platform integration, purchasing a service, or
claiming any coverage gain. Tattle becomes the leading Customer-photo
partnership candidate behind a hard schema, rights, yield, and benchmark gate.
Ovation remains the fallback.

No third Gemini query is warranted now. The decisive unknowns are proprietary
schema, controller authority, commercial willingness, real photo yield, and
SeeFood's baseline; another public research synthesis cannot resolve them.

## Access Action

- Tattle: pursue permission/commercial validation only after the baseline and
  an explicit main-thread decision to contact the controller.
- Ovation: monitor as fallback and request equivalent proof only if Tattle
  fails.
- Tripadvisor: do not use under published default terms; a bespoke Order may
  still be explored by humans if strategically justified.

## Plain-English Meaning

Gemini found a serious lead, but overstated it. Tattle already asks verified
restaurant customers for feedback, knows what they ordered, and can collect a
meal photo. That is the hard foundation SeeFood needs. What is still missing is
proof that each photo can be tied to one dish, legally exported, and converted
into enough unique restaurants to change national coverage.

Verified comparison coverage improved by zero.

## Cost

$0. No machine quota beyond ordinary local tools, no provider calls, no
accounts, no outreach, and no production impact.

## Next Action

Run DL-001 to calibrate the current comparison baseline. Preserve the Tattle
schema-and-rights packet as the highest-priority later commercial falsifier.
