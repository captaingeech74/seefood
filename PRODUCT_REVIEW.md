# SeeFood — Product & Engineering Review (v2)
**Prepared for the senior product and engineering team · July 6, 2026 · Revision 2**
*v2 incorporates founder decisions: no prices in early versions; map explore retained and elevated as a first-class surface; Reveal feed primary with an improved grid as a toggle; data tooling re-verified from scratch. This document + `PRD.md` are the authoritative product direction. `AGENT_PROMPT.md` is the execution briefing. `LAUNCH_PLAYBOOK.md` is the founder's action list.*

---

## TL;DR

The thesis is right. The product isn't there yet. Today, SeeFood is a Google-photos reskin with verbose AI captions — 7 photos, zero menu matches, on the flagship test restaurant. Every differentiating data source is coded but **dead in production** (three unresolved account/key blockers). The four moves that matter:

1. **Turn the aggregator on** (2 account fixes + 1 free API key — days, not weeks).
2. **Stop throwing the data away.** The 24h cache means SeeFood re-learns the world every day. Persist everything, forever. The corpus IS the company.
3. **Build the two-tier data engine**: an unlimited, $0 open-source crawler on the founder's Mac (residential IP — beats the blocks that kill cloud scrapers) feeding the corpus, with Scrapfly's free tier serving live cache-misses. Then **pre-crawl Temecula, CA to saturation** so the experience there is instant and flawless.
4. **Redesign around one magic moment**: open the app → the menu *materializes as food* in under a second. Full-screen dish-first Reveal feed (grid one tap away), short menu-style names, and a best-in-class map for exploring restaurants you're *not* standing in.

---

## 1. What I See (verified live, July 6)

**Working:**
- GPS → restaurant detection works and is fast when cached (~370ms warm / 7–9s cold, confirmed).
- Google Places photos flow through Gemini 2.5 Flash and get labeled.
- Fail-open architecture: no source failure ever blanks the page.
- Solid design token system, dark theme, decent lightbox with swipe/keyboard nav.

**Live production reality (Richie's Real American Diner, the project's own flagship test case):**
- 7 photos total. 0 menu-matched. 0 popular dishes.
- Labels include *"Assorted Bottled and Canned Soft Drinks"* and *"Coffee with Cream"* — a soda fridge presented as a signature dish.
- Two dish names are **truncated mid-sentence** (*"…Toasted Bagel, Jam, and"*) — the maxOutputTokens fix in HANDOFF.md is not doing its job in production.
- Every photo URL ends with a stray `\n` character (works only because browsers tolerate it).
- The server's `GOOGLE_MAPS_API_KEY` is **exposed in every photo URL sent to the browser**.

**Source status (confirmed via `/api/debug-sources`, July 6):**

| Source | Status |
|---|---|
| Google photos + Gemini naming | ✅ Only live source |
| Places API (New) menuItems | ❌ 401 — wrong key/project (known, unfixed) |
| Yelp | ❌ Trial expired — **and Yelp's free tier no longer exists at all** (see §5) |
| DoorDash | ❌ Cloudflare 403 — `SCRAPFLY_KEY` never added |
| Grubhub | ⚠️ Deployed, never verified working |
| Menufy | ⚠️ Endpoint shapes are unconfirmed guesses; 2-hop link bug known |
| Restaurant website schema.org | ✅ Works, but found nothing on the test restaurant |

**Net:** the strategic bet — out-aggregating everyone — is 100% unproven in production because the aggregator has never actually run with more than one source live.

---

## 2. What's Good (keep and build on)

- **The core question is a real, universal, daily pain.** "What should I order here?" is asked billions of times a year and answered today by squinting at Yelp photos. The instant, zero-input framing is the right product intuition.
- **The aggregator thesis is correct.** No single source covers menus + photos everywhere. Whoever assembles the best composite wins. This is a *data business wearing a consumer app costume*.
- **Engineering instincts are mostly right for a prototype:** fail-open everywhere, parallel fetch, server-side keys, one shared type contract, pre-labeled sources outranking AI guesses, caching. Right bones.
- **Design tokens and dark theme** are tasteful and consistent. Food photography on near-black is the correct canvas.
- **Attribution as a first-class concept** (Management vs User badges) is quietly one of the smartest things in the codebase — it's the seed of the long-term paid restaurant-claiming model (§8).
- **Scrapfly was a defensible pick** — re-verified against the 2026 field, it leads paid scraping APIs on success rate (~94% vs ZenRows ~51%, Firecrawl ~60% on independent benchmarks). The junior team chose well *within its category*. The miss was one level up: not realizing an entire free category exists (§5.1).

---

## 3. What's Bad (candidly)

**Product:**
- **There is no magic moment.** Cold load = 7–9 seconds of skeleton, then a small grid of unlabeled-feeling photos. The concept promises "walk in and *see the food*"; the product delivers "wait, then browse a worse Google Maps photo tab."
- **The AI names read like AI.** *"House Salad with Mixed Greens, Sliced Cucumber, Red Onion, Tomato, Croutons, and Creamy Dressing"* is a caption, not a dish. Menus say "House Salad." Verbose labels scream "a robot guessed this" and destroy trust — worse than no label. One-line prompt fix, outsized product impact.
- **Drinks, soda fridges, and interiors are presented as dishes.** The filter asks "is this food?" when it should ask "is this something you'd order and be excited about?"
- **No menu structure.** A flat photo grid can't answer "what should I order" as well as *signature dishes / mains / sides / desserts, with photos*. The menu is the mental model; photos bring it to life.
- **The map switcher underdelivers for its true job.** Founder direction (correct): the map stays, because SeeFood is also for browsing restaurants you're NOT standing in — "the general best source of restaurant food pics, instantly." That's a bigger ambition than a switcher, and the current MapPicker is far below "best-in-class map UX" (generic pins, no food imagery on the map surface, clunky flow). See §4.2.

**Engineering/data:**
- **The app has amnesia.** `unstable_cache` with 24h TTL means every expensive crawl evaporates daily. For an aggregator, this is strategic malpractice: the accumulated corpus is the moat, and today it's deleted on a timer.
- **"Forever hunting the optimal sources" has no instrument panel.** No benchmark set, no per-source hit-rate tracking, no before/after measurement. You cannot hunt what you cannot see.
- **Zero tests, and the parsers are the crown jewels.** Production-only testing is fine for UX; it is not fine for six scraping parsers that silently rot as sites change. Fixture-based contract tests are non-negotiable for the parsing layer.
- **Security hygiene:** server key in client-visible URLs; should be proxied or referrer-restricted immediately.
- **20 parallel Gemini calls per restaurant** where 1 batched call (all photos + menu in one prompt) would be cheaper, faster, more consistent, and enable cross-photo dedup ("these 3 photos are the same burger").

---

## 4. The X Factor — what makes this captivating

The magic is **the reveal**. SeeFood is the menu you can *see*: anywhere on earth, pick a restaurant — the one you're standing in, or one across town — and the menu materializes as beautiful food, instantly.

### 4.1 The Reveal (primary view) + an improved Grid (one tap away)
- **Full-bleed, one-dish-per-screen vertical feed** — the native visual grammar of 2026 (TikTok/Reels muscle memory). Photo edge-to-edge; overlaid: short dish name and a small provenance badge ("On the menu" / "Spotted by diners"). **No prices** — founder decision: hard to get right and keep right, and the physical menu is usually in hand. (Capture price data in the corpus when a source hands it to us free; never display in v1.)
- Swipe up = next dish. Tap = detail (description, all photos of that dish, source). Signature/most-photographed dishes first — ordered like a great waiter would tell you.
- **A persistent view toggle in the main UI** (not buried in settings): Reveal ⇄ Grid. Both are first-class; both get iterated. Grid improvements: masonry layout with a hero tile for the top dish, tighter frosted name pills, confidence-tiered sections, and the same provenance badges.
- **First photo on screen in under 1 second, always.** Stream results: render photo 1 the moment the first source resolves; the rest pour in behind it. Never show 9 seconds of skeleton again. Speed is not a metric here — it's the *feature*.

### 4.2 Map Explore — a first-class surface, not a switcher
Founder-set requirement: users will open SeeFood when *not* at a restaurant, to browse. The map is the browsing surface, and it must be the best food map ever made:
- **Opens instantly centered on your block**, pins already loaded for the surrounding streets — no search step, no "search this area" tap for the first screenful.
- **Food on the map surface itself:** pins are not dots — they're **dish-photo thumbnails** (the restaurant's top dish, from the corpus). Zoomed out, clusters show the area's best dish photo. The map *is* a menu of the neighborhood. This is the awe moment for the explore case, and only SeeFood's corpus can draw this map.
- Tap a pin → bottom sheet with a horizontally swipeable strip of that restaurant's top 5 dishes → "See all dishes" → the Reveal. Browsing food across restaurants without ever leaving the map.
- **Prefetch** dish data for restaurants as their pins enter the viewport (corpus reads are cheap once persistence exists) so every pin tap feels instant.
- Keep: greedy gestures, dark map style, search box, recenter FAB. Fix: pin/cluster jank, the ugly transition into results, and the slow feel of area searches.
- The "wrong restaurant detected" fix rides the same surface: header shows "You're at ___ ▾"; tapping opens the map already zoomed to your block with neighboring candidates one tap away — fast *because* the map opens pre-positioned and pre-pinned.

### 4.3 Confidence pyramid — only show what you're sure of
- Tier 1 (hero): menu-matched and pre-labeled dishes.
- Tier 2: confident AI-identified dishes with *short* names.
- Tier 3 (collapsed under "More photos"): everything else. Unlabeled and low-confidence content never sits beside hero content — it dilutes the magic.

### 4.4 Distribution is built into the object
- **Every dish is shareable**: an auto-composed card (photo + dish + restaurant + "seen on SeeFood") shared to iMessage/Instagram. "What should I order?" is already a group-chat message — make SeeFood the answer format.
- Shareable URL per restaurant (`seefood.app/r/richies-diner-temecula`) — also the SEO surface and the future paid claimed-page for restaurants.
- Secure a real domain. A vercel.app URL cannot be word-of-mouth.

### 4.5 Launch strategy: saturate one zone — Temecula, CA
Pre-crawl every restaurant in Temecula (a few hundred places — trivially within the local crawler's unlimited capacity, §5.1) so that inside the zone, SeeFood is instant and complete for every door a user walks through, and the explore map is fully illustrated. Magic in one town > mediocre in fifty states. It's also home turf: verifiable in person, restaurant by restaurant. Expand zone by zone from there.

---

## 5. Data Strategy

Market reality (re-verified July 2026): **Yelp's free tier is permanently dead** (paid-only, ~$8/1k; the "new trial account" plan in HANDOFF.md is trial-farming — drop it). Foursquare photos are premium-only. Google's 2025 pricing gives per-SKU free monthly allowances. The free-data map has shifted decisively toward **scraping + restaurant-owned surfaces + Google's free SKUs**.

### 5.1 The tooling verdict (the "is Scrapfly best?" question, answered with data)

Three categories exist in 2026. The junior team only saw category B.

| Category | Tools | Cost | Success vs hard targets (DoorDash-class) | Verdict |
|---|---|---|---|---|
| **A. Open-source stealth stack, self-hosted** | **Scrapling** (adaptive stealth fetching, beats Cloudflare Turnstile), **Camoufox** (hardened anti-fingerprint Firefox, ~9k★), **curl_cffi/curl-impersonate** (browser-exact TLS fingerprints for cheap fast fetches) | **$0, unlimited volume** | High — **IF run from a residential IP.** From datacenter IPs (Vercel, any cloud), DoorDash-class ASN blocks still win regardless of stealth. | **The 1000x answer — as a local pre-crawler on the founder's Mac (home residential IP), approved.** Maintenance burden is real (anti-bot updates break things); acceptable at our scale. |
| **B. Anti-bot API services** | **Scrapfly** (~94% benchmark success), ZenRows (~51%), ScraperAPI, Bright Data | Free tiers → $30+/mo | High (managed residential proxies) | **Scrapfly confirmed best-in-class in its category** — keep it, free tier (1k/mo), for *live serverless cache-misses only*, not bulk crawling. |
| **C. LLM-oriented crawl APIs** | Firecrawl (~60% success), Crawl4AI (open-source) | Free tier / $0 | Low vs hard anti-bot targets | Wrong category for us. Crawl4AI worth a shadow-test inside the local crawler for plain restaurant websites only. |

**The resulting two-tier engine:**
- **Tier 1 — Corpus builder (local, unlimited, $0):** a crawler CLI in the repo, run on the founder's Mac on a schedule. Scrapling/Camoufox for hard targets (DoorDash, Grubhub, Menufy), curl_cffi for easy ones (restaurant sites, ordering platforms). Writes normalized `MenuItemData` + photos into the persistent corpus DB. This is where Temecula gets saturated and where all bulk/refresh crawling lives.
- **Tier 2 — Live gap-filler (serverless):** the existing Vercel pipeline, corpus-first: cache-miss → free direct sources (Places New, website parse, menu-photo OCR) + Scrapfly free tier for one or two hard-target attempts → persist whatever it learns. Every user request permanently enriches the corpus.

### 5.2 The $0 plan (primary)

| # | Action | What it unlocks |
|---|---|---|
| 1 | Enable **Places API (New) on `seefood-map`** + revert key routing in `google.ts` | menuItems field, free SKU allowance. 15 min of console work. |
| 2 | Add **`SCRAPFLY_KEY`** (free tier: 1,000 calls/mo) | Live-path DoorDash/Grubhub/Menufy for cache misses. |
| 3 | **Build the local corpus crawler** (Tier 1 above) | Unlimited free crawl volume; the Temecula saturation engine; the moat. |
| 4 | **Go deep on restaurant ordering platforms** — parse Toast, Square Online, Clover, ChowNow, Olo, PopMenu hosted pages (structured JSON, weak bot protection, cover the independents DoorDash misses) | The highest-upside untapped free *source* (vs tool). "DoorDash-grade" name+photo data on restaurants' own sites. |
| 5 | **Mine menu photos** — Google photo sets almost always include photos *of the physical menu*, currently discarded as "non-food." Route to Gemini OCR → structured menu, free | Turns discarded images into the menu itself. |
| 6 | **Persist everything crawled, forever** (Supabase free tier; see §6.1) | Every crawl becomes permanent inventory instead of a 24h rental. |
| 7 | Drop Yelp entirely from the near-term plan | Nothing free remains there. |

### 5.3 The low-cost plan (only where upside is proven and explicit)

Gate: **run the $0 stack against a fixed 25-restaurant benchmark first** (§6.2). Pay only where the scoreboard shows a measured gap.

| Spend | What it buys | Clearly articulated upside | Trigger |
|---|---|---|---|
| Scrapfly $30/mo | ~25× live-path volume | Only matters once real user traffic causes >1k cache-misses/mo on hard targets — a good problem; by then the corpus covers the launch zone anyway | Free tier consistently exhausted by real usage |
| Residential proxy plan (~$5–15/mo, pay-as-you-go GB) | Lets the local crawler stack also run from cloud (24/7, no Mac dependency) | Removes the "Mac must be awake" constraint; same data | If local crawling cadence becomes a bottleneck |
| Google Custom Search ~$5/1k | Reliable DoorDash store-finder (code exists) | Fixes store *discovery*, the flakiest DoorDash step | If DoorDash store-match <80% on benchmark |

### 5.4 Source-hunting as a permanent capability
- **Pluggable source interface** — every source implements `fetch(restaurant) → MenuItemData[]` + self-reported metadata (latency, hit, item count). New source = new file, zero pipeline surgery.
- **Nightly benchmark run** over the fixed 25-restaurant set → per-source scoreboard: hit rate, items/restaurant, photos/restaurant, latency. New candidate sources ride in shadow mode until they earn a slot.
- Future candidates to shadow-test: Uber Eats, ezCater, Instagram location pages, TikTok place tags, OpenMenu, Crawl4AI-for-websites.

---

## 6. Engineering Recommendations

### 6.1 Architecture: from "fetch-and-forget" to "corpus"
- **Add persistence now**: Supabase free tier (Postgres) for all *metadata* — 500MB holds tens of thousands of restaurants of menu text. Image *bytes* go to **Cloudflare R2** (10GB free, zero egress fees — Supabase Storage's 1GB cap + 5GB/mo egress hard-stop make it wrong for photo serving). The 24h cache becomes a read-through layer over a permanent store with per-source freshness policies (menus weekly, photos monthly). Own copies of scraped images — source CDN links rot.
- **Stream the response.** Corpus hit → full render in <1s. Corpus miss → serve first source's photos immediately, stream the rest, persist everything learned. Kills both the 9-second skeleton and the 60s serverless ceiling.
- **One batched Gemini call per restaurant** (all candidate photos + merged menu in one multimodal prompt): cheaper, more consistent naming, enables same-dish grouping across photos.

### 6.2 The scoreboard (build before adding more sources)
Fixed benchmark set of ~25 real restaurants (mix: chains, independents, Menufy-style, Toast-style, no-website dives — Richie's included; weight toward Temecula). One command / nightly job → per-source coverage table. **Every future claim of "improved" must cite before/after from this scoreboard.**

### 6.3 Quality fixes (small, high-impact, this week)
- **Short dish names:** constrain Gemini to ≤4-word menu-style names (separate long description field). Fixes the "AI caption" smell everywhere at once.
- **Fix the truncation** (live names ending in "…and") — verify the maxOutputTokens fix actually deployed; add output-validity checks (reject names ending in conjunctions/commas).
- **"Would you order it?" filter:** beverages-in-fridges, interiors, storefronts out of hero content. Menu photos → OCR pipeline, not the trash.
- **Fix the `\n`** appended to every photo URL.
- **Stop leaking `GOOGLE_MAPS_API_KEY`:** proxy photo bytes through `/api/photo?ref=…` (also enables caching/resizing and stabilizes URLs for persistence).
- **Menufy 2-hop link follower** (recursive, depth cap 3) and **extend `/api/debug-sources` to all six sources**.

### 6.4 Testing posture
Keep production-first *verification* for UX (it works for this team). Add **fixture-based contract tests for every parser** (recorded HTML/JSON per source → expected `MenuItemData[]`). Scrapers rot silently; fixtures + the nightly scoreboard surface breakage within a day instead of a month.

### 6.5 Built for the stated long game
Founder's long-term direction: user contributions + a simple reputation system (Google-reviews-style points/levels with social proof) + restaurants paying to claim pages and upload "From Management" photos (tagged, filterable). Bake in now (cheap) vs retrofit (expensive):
- Persistence layer (§6.1) is the prerequisite for all of it.
- Keep `source` + `attribution` first-class on every photo/item; "From Management" becomes a paid tier of the existing badge system.
- Stable restaurant slugs/URLs (the future claimed page = today's shareable page).
- No accounts yet — but build nothing that assumes statelessness forever.

---

## 7. Priorities — what to do, in order

**Phase 0 — Turn it on (days):** Places API (New) fix · `SCRAPFLY_KEY` · verify DoorDash/Grubhub/Menufy live · Menufy 2-hop fix · §6.3 quality fixes · 25-restaurant benchmark + scoreboard.

**Phase 1 — Corpus + speed (1–2 weeks):** Supabase persistence · corpus-first streaming load · batched Gemini + short names + dish-worthiness filter · ordering-platform parsers (Toast/Square/Clover/ChowNow) · menu-photo OCR · **local corpus crawler CLI**.

**Phase 2 — The Reveal + the Map (2–3 weeks):** Reveal feed + improved grid + persistent toggle · Map Explore v2 (photo-thumbnail pins, instant open on your block, dish-strip bottom sheet, viewport prefetch) · confidence tiers · share cards · stable URLs · real domain.

**Phase 3 — Prove it (ongoing):** Temecula pre-crawled to saturation · walk the town, measure, iterate · expand zone by zone · revisit paid options only where the scoreboard shows a gap.

**Metrics that matter:** time-to-first-photo (<1s target) · % restaurants "magic-capable" (≥5 named dishes — the north star) · per-source hit rates · menu-match rate · shares per session · D7 return.

---

## 8. Risks to keep honest about

- **Scraping ToS exposure** (DoorDash/Grubhub/Menufy): accepted for build/test per founder decision. Revisit before scale, press, or fundraise — endgame is restaurant-claimed pages and licensed data, with scraping as scaffolding.
- **Open-source stealth maintenance treadmill:** Scrapling/Camoufox break when anti-bot vendors update; we own the patching. Mitigation: Scrapfly free tier as fallback, fixtures + scoreboard as tripwire.
- **Google could ship this** (Lens already gestures at it). Defense: speed, the composite corpus, the illustrated food map, and eventually the claimed-page relationship — none favored by Google's incentives.
- **Gemini free-tier limits** pinch as volume grows; batching + persistence (never re-analyze the same photo) delay that substantially.

---

## Appendix — Sources (market research, July 2026)

- Scraping API benchmarks & landscape: [Scrape.do 2026 review](https://scrape.do/blog/best-web-scraping-api/), [Olostep comparison](https://www.olostep.com/blog/best-web-scraping-apis), [Firecrawl's own 2026 roundup](https://www.firecrawl.dev/blog/best-web-scraping-api)
- Open-source stealth stack: [Camoufox/Scrapling/curl-impersonate technical comparison](https://github.com/pim97/anti-detect-browser-tools-tech-comparison), [Scrapling + Byparr stack](https://godberrystudios.com/posts/byparr-scrapling-flaresolverr-cloudflare-bypass-2026/), [Scrapling bypassing Cloudflare Turnstile](https://techstrong.ai/features/openclaw-users-are-using-scrapling-to-bypass-cloudflare-and-other-anti-bot-systems/)
- Yelp Fusion paid-only: [TechCrunch](https://techcrunch.com/2024/08/02/yelps-lack-of-transparency-around-api-charges-angers-developers/), [App Developer Magazine](https://appdevelopermagazine.com/yelp-fusion-api-outrageous-new-pricing/)
- Foursquare photos premium-only: [Foursquare pricing](https://foursquare.com/pricing/), [Camino analysis](https://app.getcamino.ai/learn/foursquare-places-api-pricing)
- Google Places per-SKU free allowances: [Google usage & billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
