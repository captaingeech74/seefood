# SeeFood — Product Requirements Document (v2)
**July 6, 2026 · Status: Approved by founder · Owner: Kyle (founder) · Executor: senior agentic developer (Claude Code)**

Authoritative companions: `PRODUCT_REVIEW.md` (rationale & research), `AGENT_PROMPT.md` (execution briefing), `LAUNCH_PLAYBOOK.md` (founder actions). Where this PRD conflicts with `HANDOFF.md` or `DECISIONS.md`, **this PRD wins**.

---

## 1. Vision

> **SeeFood is the menu you can see.** Open it at any restaurant — or point at one on the map — and the menu materializes as beautiful photos of real dishes, instantly. It answers "What should I order here?" and, when browsing, "Where should I eat?" It wins by being the world's best *aggregator* of restaurant dish imagery and menu data: many sources, merged, deduplicated, beautifully presented, permanently accumulated.

**Long-term (not this build, but architect for it):** user-contributed photos with a simple reputation system (points/levels with social proof, Google-reviews style), and restaurants paying to claim their page and upload "From Management" photos (tagged as such, filterable).

## 2. Goals & non-goals

**Goals (this build cycle):**
1. Aggregation actually running: ≥4 live sources merged in production.
2. Permanent data corpus; every crawl and user request enriches it forever.
3. Time-to-first-photo <1s for corpus-covered restaurants; <4s first photo on cold misses (streamed).
4. The Reveal feed + improved Grid, toggleable, both first-class.
5. Map Explore v2: the best food map available anywhere — browseable when not at a restaurant.
6. Temecula, CA pre-crawled to saturation (every restaurant "magic-capable" where data exists anywhere).
7. Instrumented source scoreboard driving all data decisions.

**Non-goals (this cycle):**
- ❌ Prices in the UI (founder decision: hard to keep right; user usually holds the menu. *Capture* free price data into the corpus; never display.)
- ❌ Accounts, login, user uploads, reputation (architect-for, don't build).
- ❌ Native iOS/Android apps (stay PWA).
- ❌ Paid data contracts (strict $0 default; low-cost items only via the explicit gates in PRODUCT_REVIEW §5.3).
- ❌ Reviews/ratings content beyond dish-name extraction.

## 3. Users & core moments

- **The Seated Diner** (primary): at/entering a restaurant, menu in hand, wants to *see* the food. Moment: open → their restaurant → dishes on screen <1s. Zero taps.
- **The Explorer** (co-primary, founder-elevated): at home or on the go, deciding where to eat. Moment: open map → their block → surrounding restaurants as *dish-photo pins* → browse food across restaurants without leaving the map.
- **The Group-Chat Decider** (growth vector): sends a dish card or restaurant link that answers "what should I order / where should we go."

## 4. UX Specification

### 4.1 App entry
- GPS acquired → most-likely restaurant auto-selected (existing behavior) → straight into the Reveal.
- Header: "You're at **{Restaurant}** ▾" — tap opens Map Explore pre-centered on the user's block, neighbor candidates pinned, one tap to switch. (This is both the "wrong pick" fix and the explore entry.)
- GPS denied/unavailable → Map Explore directly (centered on last known / search).

### 4.2 The Reveal (default view)
- Full-bleed vertical feed, one dish per screen; swipe up/down between dishes; edge-to-edge photo.
- Overlay (bottom, over soft scrim): dish name (≤4 words, menu-style), provenance badge — "On the menu" (menu-matched) / "Spotted here" (AI-identified) / "From management" (owner attribution) — and dish counter (3/17).
- Tap → Dish Detail: description (if sourced), all photos of the same dish (grouped), source attribution, share button.
- Order: confidence pyramid — Tier 1 menu-matched/pre-labeled first (within tier: most-photographed/signature first), Tier 2 confident AI-identified, Tier 3 collapsed behind "More photos" at feed end.
- No prices anywhere.
- Share: auto-composed dish card (photo + dish name + restaurant + SeeFood mark) via native share sheet.

### 4.3 Grid view (toggle)
- Persistent Reveal ⇄ Grid toggle in the main UI (header area, always visible — not in settings).
- Improved grid: masonry with hero tile for the #1 dish; frosted name pills; Tier 3 in a collapsed "More photos" section; same badges; tap → same Lightbox/Dish Detail.
- View preference remembered (localStorage).

### 4.4 Map Explore v2 (first-class surface)
- Opens **instantly on the user's block**, pins pre-loaded for the visible area (no first-tap search).
- **Pins are dish-photo thumbnails** (top dish from corpus), not dots. Clusters show the area's best dish photo. Restaurants without corpus photos: minimal dot pin that upgrades once crawled (and viewport visits enqueue them for crawling — the map teaches the crawler where to go).
- Tap pin → glass bottom sheet: restaurant name/rating/open state + horizontally swipeable strip of top ~5 dish photos + "See all dishes" → Reveal for that restaurant (without losing map position on back).
- Viewport prefetch of corpus data for visible pins; search box; recenter FAB; dark map style; greedy gestures (all kept).
- Performance bar: pin tap → sheet with photos feels instant (<300ms from corpus).

### 4.5 States & polish
- Loading: never full-screen skeleton after entry; stream dishes in as resolved with graceful entrance animation. Cold miss: show best available source immediately, backfill.
- Empty (no photos found anywhere): honest, warm empty state + "Explore nearby instead" → map.
- Keep: dark theme, existing token system, safe-area handling, lightbox gestures. Evolve, don't rebrand.

## 5. Data & System Architecture

### 5.1 The corpus (new, foundational)
- Supabase (free tier): **Postgres only** — menu/photo *metadata* (text; all of Temecula ≈ single-digit MB; 500MB holds tens of thousands of restaurants). Do NOT use Supabase Storage for image bytes (1GB cap + 5GB/mo egress hard-stop). Note: free projects pause after 7 days of no API traffic — the nightly benchmark job doubles as the keep-alive.
- Tables (indicative): `restaurants` (place_id PK, slug, name, geo, website, status, last_crawled_at per source), `menu_items` (restaurant_id, name, description, price_captured_not_displayed, source, confidence), `photos` (restaurant_id, menu_item_id?, storage_url, origin_url, source, attribution, tier, gemini_label, created_at), `source_runs` (restaurant_id, source, ts, ok, item_count, photo_count, latency_ms, error).
- Image bytes: **Cloudflare R2** (free: 10GB storage, zero egress fees — built for public image serving). Phase 1 may defer copying (store origin URLs, serve via `/api/photo` proxy); copy into R2 as the Temecula crawl lands and whenever origin links prove unstable.
- Freshness policy: menus ~weekly, photos ~monthly, chains slower; per-source overrides.
- Read path: corpus-first; Vercel data cache demoted to short-TTL read-through.

### 5.2 Two-tier acquisition engine
- **Tier 1 — Local corpus crawler (unlimited, $0):** CLI in-repo (`npm run crawl -- --zone temecula`, `--place <id>`, `--refresh-stale`), runs on the founder's Mac (residential IP). Stack: Scrapling + Camoufox for hard targets (DoorDash, Grubhub, Menufy), curl_cffi/plain fetch for easy ones (restaurant sites, ordering platforms). Polite rate limits (~1 restaurant/min default), resumable, idempotent, writes to corpus + logs `source_runs`. Founder-runnable: one command, clear progress output, safe to interrupt.
- **Tier 2 — Live serverless gap-filler:** existing Vercel pipeline, corpus-first; on miss runs free direct sources (Places New menuItems, website/ordering-platform parse, Google photos + Gemini, menu-photo OCR) plus ≤2 Scrapfly free-tier attempts for hard targets; streams to user; persists everything learned. Every user request enriches the corpus.

### 5.3 Sources (pluggable interface: `fetch(restaurant) → SourceResult`)
Active: Google Places photos+reviews · Places API (New) menuItems · restaurant website schema.org · **ordering platforms (new: Toast, Square Online, Clover, ChowNow, Olo, PopMenu hosted pages)** · DoorDash · Grubhub · Menufy (2-hop link following, depth ≤3) · **menu-photo OCR (new: menu photos in Google's photo set → Gemini OCR → structured menu)**.
Dropped: Yelp (no free tier exists; no trial-farming).
Shadow candidates (scoreboard-gated): Uber Eats, ezCater, Instagram location pages, TikTok place tags, OpenMenu, Crawl4AI-for-websites.

### 5.4 AI pipeline
- **One batched Gemini call per restaurant** (all candidate photos + merged menu list): returns per-photo {short dish name ≤4 words, description?, is_orderable_dish, menu_match, same_dish_group}.
- "Would you order it?" filter: drinks-in-fridges/interiors/storefronts → excluded from hero tiers. Photos *of menus* → OCR pipeline, not trash.
- Output validation: reject truncated names (trailing conjunctions/commas); never re-analyze a photo already in the corpus.

### 5.5 Scoreboard & benchmark (build first)
- Fixed ~25-restaurant benchmark set (weighted toward Temecula; includes Richie's placeId `ChIJo5rSwlh_24ARYXLdrsbKRu8`, chains, Toast/Menufy-style independents, no-website dives).
- `npm run benchmark` + nightly run → per-source table: hit rate, items/restaurant, photos/restaurant, latency, error classes. All "improvement" claims cite before/after from this.

### 5.6 Fixes folded in (from live audit)
Stray `\n` on photo URLs · `GOOGLE_MAPS_API_KEY` leaking in client-visible photo URLs (proxy via `/api/photo` or storage URLs) · dish-name truncation live in prod · debug-sources extended to all sources · Menufy 2-hop.

## 6. Non-functional requirements
- **Speed:** corpus-covered: first dish photo <1s, full Reveal interactive <2s. Cold miss: first photo <4s (streamed), no blocking skeleton.
- **Cost:** $0/mo default posture (free tiers only). Paid spend only via PRODUCT_REVIEW §5.3 gates, founder-approved.
- **Resilience:** fail-open preserved everywhere; any source may die without visible breakage.
- **Testing:** fixture-based contract tests for every parser (recorded HTML/JSON → expected output); production-verification workflow retained for UX (commit → push → verify live, per founder's standing instruction).
- **Security:** no server keys in client-visible URLs; keys server-side or referrer-restricted.
- **Privacy:** no accounts, no stored user data; geolocation used transiently, never persisted.

## 7. Delivery phases & acceptance criteria

**Phase 0 — Turn it on (~days)**
Unblocks (`PLACES_API_KEY` — new key on seefood-vision restricted to Places API (New), founder holds it; key routing in `google.ts`; `SCRAPFLY_KEY`), §5.6 fixes, short-names prompt + orderability filter, benchmark + scoreboard v1.
✓ Accept: debug-sources shows ≥3 non-Google sources returning data on benchmark restaurants; Richie's shows menu-matched dishes with ≤4-word names in production; scoreboard produces a real table.

**Phase 1 — Corpus + engine (~1–2 wks)**
Supabase persistence, corpus-first streaming read path, batched Gemini, ordering-platform parsers, menu-photo OCR, local crawler CLI.
✓ Accept: warm restaurant <1s to first photo in production; crawler run on 25 benchmark restaurants from the Mac populates corpus with before/after scoreboard deltas; repeat visit costs zero external API calls.

**Phase 2 — Reveal + Map (~2–3 wks)**
Reveal feed, improved grid, persistent toggle, Map Explore v2 (photo pins, instant-open-on-block, dish-strip sheet, viewport prefetch), confidence tiers, share cards, stable slugs/URLs, real domain.
✓ Accept: founder walk-test in Temecula — open app at 5 restaurants: Reveal in <1s each; map shows photo pins on their block; switching restaurants via map feels instant; a shared dish card renders correctly in iMessage.

**Phase 3 — Saturate & prove (ongoing)**
Full Temecula pre-crawl, nightly refresh + scoreboard, zone expansion criteria, shadow-source testing.
✓ Accept: ≥90% of Temecula restaurants (with data anywhere) are "magic-capable" (≥5 named dishes); north-star dashboard live.

## 8. Metrics
North star: **% of restaurant opens that are "magic" (≥5 named dish photos in <1s)**. Supporting: time-to-first-photo p50/p95 · magic-capable restaurant count · per-source hit rates · menu-match rate · map-pin-tap → Reveal conversion · shares/session · D7 return.

## 9. Risks
ToS exposure on scraped sources (accepted for build/test; revisit pre-scale/press/fundraise) · open-source stealth maintenance treadmill (fixtures + scoreboard as tripwire; Scrapfly fallback) · Google-ships-this (defend with speed, corpus, illustrated map, future claimed pages) · Gemini free-tier limits (batching + never-reanalyze delay this) · Mac-crawler availability (acceptable; cloud+residential-proxy option documented if cadence bottlenecks).
