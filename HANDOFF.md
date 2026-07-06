# SeeFood — Agent Handoff Document

> **⚠️ SUPERSEDED (July 6, 2026): A senior product/engineering review replaced the plan in
> this document. The authoritative direction is now `PRD.md` (spec) + `PRODUCT_REVIEW.md`
> (rationale), executed per `AGENT_PROMPT.md`. Where this doc conflicts with the PRD, the
> PRD wins. Notably: the Yelp plan below is DEAD (Yelp has no free tier; do not create
> trial accounts), prices will not be shown in the UI, and the data strategy is now a
> two-tier engine (local Mac crawler + Scrapfly free tier) with permanent persistence.
> This doc remains useful for operational detail: keys, cloud projects, test cases, bugs.**

_Compiled 2026-07-06. Read this before touching the code. It is a snapshot — verify
against `DECISIONS.md` and the actual code before acting on anything that sounds stale._

---

## The Core Essence (read this first)

> **SeeFood answers one question: "What should I order here?"**
>
> A user stands outside or inside a restaurant, opens the app, and instantly sees
> real photos of real dishes with real menu names and descriptions — sourced by
> stitching together every available public data source (Google, Yelp, DoorDash,
> Grubhub, Menufy, the restaurant's own website) into one dead-simple photo grid.
> No searching, no scrolling reviews, no guessing what's good.
>
> The strategic bet: **no single source has good-enough menu/photo coverage alone.**
> Google Places has photos but rarely names dishes. Yelp has reviews but sparse menus.
> DoorDash/Grubhub/Menufy have rich pre-labeled menu photos but aggressive bot
> protection or spotty coverage. The product wins by out-aggregating everyone —
> pulling from all of them in parallel, merging, deduplicating, and letting Gemini
> vision fill the remaining gaps. **Being the best restaurant-data aggregator in the
> world is the whole game.** Every architectural decision should be judged against
> that yardstick.

---

## Pointers — where everything lives

| What | Where |
|---|---|
| **Production URL** | https://seefood-rho.vercel.app |
| **GitHub repo** | https://github.com/captaingeech74/seefood (branch: `main`, always deployable) |
| **Local path** | `/Users/ace/Desktop/development/seefood` |
| **Vercel project** | `garys-projects-4d34b7ce/seefood` — deploys automatically on push to `main` |
| **Vercel CLI** | Linked locally; `vercel env ls production` shows current env vars |
| **Project intelligence doc** | [`DECISIONS.md`](./DECISIONS.md) — 576 lines, the authoritative deep-dive on every architectural decision, tunable variable, and known limitation. **Read this in full before making changes.** |
| **This handoff doc** | `HANDOFF.md` (this file) — session-level summary, not a replacement for DECISIONS.md |
| **Google Cloud project (Maps/Places)** | `seefood-map` (815087896573) — has old Places API + Maps JS API enabled |
| **Google Cloud project (Gemini/Vision)** | `seefood-vision` (project shown in console as `seefood-vision`) — has Gemini API + Places API (New) enabled, billing active |
| **Diagnostic endpoint** | `GET /api/debug-sources?placeId=...&name=...&lat=...&lng=...` — tests all menu data sources live, not cached, logs raw errors |
| **Gemini test endpoint** | `GET /api/test-gemini` — verifies which Gemini models are reachable with current key |

No database. No auth. No user accounts. Fully stateless except for Next.js's built-in
response cache (24h TTL, keyed by placeId).

---

## Tech stack (unchanged since project start)

Next.js 14 (App Router) · TypeScript · Tailwind CSS v4 · Vercel hosting · no component
library · no state management library. Dev port 3010 (`npm run dev`). **The user's
explicit, standing instruction: do not develop or test locally — always build, commit,
push to `main`, and verify against the live production deployment.** Do not suggest
local dev/testing workflows.

---

## Build history — what's been done, roughly in order

1. **Gemini vision pipeline stood up** (replacing a retired Google Vision Label
   Detection integration) — analyzes each candidate photo, returns a dish name,
   filters non-food images.
2. **Long API-key/billing saga** — several dead API keys, wrong Google Cloud
   projects, eventually resolved by enabling prepay billing on `seefood-vision`
   and switching to a working key (`VISION_API_KEY` env var, currently distinct
   from `GOOGLE_MAPS_API_KEY`).
3. **Model + config bugs found and fixed:**
   - `gemini-1.5-flash` → `gemini-2.5-flash` (deprecated model swap)
   - Invalid `thinkingConfig` in `generationConfig` caused 400 errors on every
     call — removed entirely.
   - `maxOutputTokens: 200` was too low — Gemini 2.5 Flash burns 200–700 tokens on
     internal "thinking" before emitting text, so real output was getting truncated
     mid-word. Fixed by raising to `maxOutputTokens: 1024`.
4. **Fuzzy menu-matching bug** — matching logic that allowed the Gemini response to
   be a substring of a menu item AND vice versa caused unrelated dishes (e.g. many
   different brisket plates) to collapse onto one generic menu entry ("Brisket").
   Fixed by keeping only one direction of the fuzzy match.
5. **Full architecture upgrade** — introduced `MenuItemData { name, description?,
   imageUrl? }` as the shared type flowing through the whole pipeline; added
   `dishDescription` and expanded `source` union on `DishPhoto`; added source badges
   + description display in the Lightbox photo viewer.
6. **Menu data sources 1–3 added:**
   - Source 1: Google Places API v1 `menuItems` field
   - Source 2: restaurant's own website, scraped for schema.org `MenuItem` LD+JSON
   - Source 3: Yelp `attributes.menu_url`, parsed the same way, plus Yelp reviews
     and up to 3 Yelp photos merged into the Gemini candidate pool
7. **Response caching added** — `unstable_cache` (Next.js/Vercel Data Cache, free,
   built-in) wraps the whole dish-fetch pipeline, keyed by placeId, 24h TTL. Confirmed
   in testing: ~7–9s cold, ~370ms warm (21× speedup).
8. **UI upgrades:**
   - Map initial zoom changed from 16 (~625m radius, often showed only 1 restaurant)
     to 15 (~1250m radius, shows a full neighborhood)
   - "Change Restaurant" affordance redesigned from a small top-right pill into a
     full-width row at the bottom of the header: "Not the right place? → Change
     restaurant"
9. **Source 4 (DoorDash) + Source 5 (Grubhub) added:**
   - `fetchWithAntiBot()` helper routes through **Scrapfly** (`SCRAPFLY_KEY` env var,
     residential-IP anti-bot bypass, `asp=true`) when the key is present; falls back
     to a plain fetch with full browser-fingerprint headers otherwise.
   - DoorDash: search page scrape → store URL slug → `__NEXT_DATA__` JSON parse.
     Direct scraping is **blocked at the IP/ASN level in production** (403, confirmed
     via live testing) — Scrapfly is required for this source to work at all.
   - Grubhub: same `__NEXT_DATA__` pattern, less aggressive bot protection, may work
     without Scrapfly in some cases (untested at scale).
   - Both are pre-labeled sources — their photos bypass Gemini entirely and are
     scored 200 (always shown first in the gallery).
10. **Source 6 (Menufy/HungerRush) added** — the newest and most promising source,
    discovered by reverse-engineering **Richie's Real American Diner** (Temecula, CA)
    as a live example:
    - Detection: page HTML contains `api.menufy.com`
    - Menu items rendered client-side as `<new-menufy-item-card item-name="..."
      item-description="..." item-image-url="..." item-price="...">` web-component
      attributes, sourced from `location-id` + `api-key` embedded in a
      `<location-context>` element in the raw HTML
    - Photos served from `static.hungerrush.com/menufy/` CDN; we upscale the default
      300×300 URL parameter to 800×800
    - Two-strategy fetch: (A) call `api.menufy.com` directly server-side (multiple
      endpoint candidates tried, since the exact REST shape wasn't fully confirmed
      live — see Known Gaps below), (B) Scrapfly with `render_js=true` +
      `wait_for_selector=new-menufy-item-card` to get the fully-rendered DOM and
      parse the item-card attributes out of the HTML.
    - Added a link-follower (`checkLinksForMenufy`) for restaurants whose main
      marketing site is separate from their Menufy ordering site (exactly Richie's
      situation: `richiesdiner.com` links to `richiesdiner.com/order` which links to
      `richiesdinertemecula.com`, the actual Menufy site) — currently follows **one
      hop only**, which was NOT enough for Richie's two-hop chain. See Known Gaps.
11. **Places API (New) key-routing fix** — `fetchMenuFromPlacesV1` was calling with
    `GOOGLE_MAPS_API_KEY` (from `seefood-map`, which doesn't have Places API (New)
    enabled) instead of `VISION_API_KEY` (from `seefood-vision`, which does). Fixed
    to use the Vision key. **This surfaced a NEW blocker**, see Known Gaps.

---

## Current live state — what actually works right now (tested)

| Source | Status | Evidence |
|---|---|---|
| Google Places photos + Gemini vision naming | ✅ Working well | Dish names are long, specific, accurate: "Scrambled Eggs with Crispy Bacon and Pan-Fried Diced Potatoes" |
| Response caching | ✅ Confirmed | Cold ~7-9s, warm ~370ms |
| Map zoom / Change Restaurant UI | ✅ Live | Verified via Chrome MCP screenshot + DOM inspection |
| Website schema.org menu scraping | ✅ Works when present | ~35% expected hit rate, restaurant-dependent |
| Yelp (photos, reviews, menu_url) | ❌ Blocked | Trial expired: `"Your Trial has expired. Please upgrade..."` — needs a paid/new Yelp Fusion account |
| Google Places API (New) `menuItems` | ❌ Blocked (new finding) | `VISION_API_KEY` is API-key-restricted to `generativelanguage.googleapis.com` only, so calling `places.googleapis.com` with it returns 401 `"API keys are not supported by this API"`. Needs Places API (New) enabled on the **seefood-map** project instead, using the unrestricted `GOOGLE_MAPS_API_KEY`. |
| DoorDash direct scrape | ❌ Blocked | Confirmed 403 in production regardless of browser headers — IP-level block. Needs `SCRAPFLY_KEY` env var (not yet added). |
| Grubhub direct scrape | ⚠️ Untested at scale | Code deployed, not yet confirmed working live for any restaurant |
| Menufy direct API | ⚠️ Unconfirmed | Endpoint candidates are guesses; none confirmed to return real data yet |
| Menufy via Scrapfly render | ⚠️ Blocked on same key | Needs `SCRAPFLY_KEY` |
| Menufy link-follower (2-hop case) | ❌ Known gap | Richie's specific structure needs 2 hops, currently only follows 1 |

**Net effect on a typical restaurant today:** ~6-7 Google photos with excellent
Gemini-generated names, 0 pre-labeled/menu-matched photos. The pre-labeled sources
(DoorDash, Grubhub, Menufy, Yelp) are all coded and deployed but **inert until the
three env vars below are set.**

---

## Immediate action items (blocking further progress — need user or agent action)

1. **`SCRAPFLY_KEY`** — sign up free at scrapfly.io, no credit card required, 1,000
   free API calls/month. `vercel env add SCRAPFLY_KEY production`. This single key
   unlocks DoorDash, Grubhub, and the Menufy Scrapfly-render fallback simultaneously.
   **Highest leverage single action available.**
2. **Enable "Places API (New)" on the `seefood-map` Google Cloud project** (not
   `seefood-vision` — that was the wrong project, now identified). Cloud Console →
   seefood-map project → APIs & Services → Library → "Places API (New)" → Enable.
   Then revert `fetchMenuFromPlacesV1` in `src/lib/google.ts` to use
   `GOOGLE_MAPS_API_KEY` instead of `VISION_KEY` (or add a third, unrestricted key
   if you want Places (New) isolated from the Maps JS key).
3. **New Yelp Fusion account** — the current app's trial is expired at the account
   level, not just the app level. Create a brand-new Yelp Developer account (different
   email) → Create New App → get a fresh key → `vercel env rm YELP_API_KEY
   production` then `vercel env add YELP_API_KEY production`.

None of these are code changes. All three are account/dashboard actions outside the
repo. Once set, the very next request to `/api/dishes` for a fresh (uncached)
restaurant should show DoorDash/Grubhub/Yelp photos and the effect should be dramatic and immediately visible.

---

## Key architectural decisions (see DECISIONS.md for full depth)

- **Fail-open everywhere.** Every external source wrapped in try/catch returning
  `[]` or a fallback shape on any failure — a broken/rate-limited source degrades
  gracefully instead of breaking the page.
- **Pre-labeled photos always outrank Gemini-analyzed photos.** Score 200 vs. a
  0–100+ tiered scoring system for Gemini results (`computePriorityScore` in
  `google.ts`). If a source already tells us the dish name/description, we trust it
  over an AI guess and skip the Gemini call for that photo entirely (saves cost too).
- **All external API calls happen server-side** (in `src/lib/*.ts`, called from
  `src/app/api/*/route.ts`). No keys ever reach the browser except the
  HTTP-referrer-restricted Maps JS key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
- **Everything for a restaurant fetches in parallel**, not sequentially — Places
  Details, Places v1 menu, website scrape, Yelp, DoorDash, Grubhub, and all Gemini
  vision calls are `Promise.all`'d wherever there's no data dependency between them.
  This is why a cold load is ~7-9s instead of 30-40s+.
- **Two Google Cloud projects, on purpose** — `seefood-map` (Maps/Places, no org
  restrictions issue) and `seefood-vision` (Gemini, billing-enabled personal
  project). This split was original to a much earlier blocker (org-level admin
  restrictions on enabling Vision API on the Maps project) and has now caused a
  second-order issue: **the Vision key is API-restricted and can't call Places API
  (New) even though that API is enabled on that project.** The fix approach is in
  Action Item #2 above.

---

## Alternatives identified but not pursued

- **Google Custom Search API as a DoorDash-finder fallback** (`GOOGLE_SEARCH_API_KEY`
  + `GOOGLE_SEARCH_ENGINE_ID`) — coded as `fetchDoorDashViaGoogleSearch` in
  `google.ts`, works but costs ~$5/1,000 queries after 100/day free tier. Scrapfly
  was judged the better first move since it's free at low volume and also unlocks
  Grubhub + Menufy simultaneously, whereas Custom Search only unlocks DoorDash.
  Worth adding as a second-opinion fallback later if Scrapfly's free tier runs out.
- **Managed scraping SaaS (Apify, Foodspark, iWebDataScraping, etc.)** — researched
  during the DoorDash/Menufy investigation. These offer pre-built DoorDash/Grubhub/
  Menufy scrapers as a paid service. Rejected in favor of owning the scraping logic
  directly via Scrapfly (cheaper at our volume, more control over data shape, avoids
  vendor lock-in on a core data pipeline).
- **ZenRows** (alternative to Scrapfly) — comparable anti-bot bypass service,
  benchmarked slightly behind Scrapfly on success rate in independent comparisons
  at time of research, and notably more expensive ($69/mo vs Scrapfly's $30/mo
  paid tier). Scrapfly chosen; ZenRows is the fallback if Scrapfly underperforms.
- **Google Places App Check** — investigated because the user found this doc while
  researching Places API (New) setup. Confirmed **not applicable** — App Check only
  protects browser/mobile-app-originated calls; our Places calls are 100%
  server-to-server from a Node backend, which Google's own docs explicitly exempt.
  No action needed here, just ruled out as a red herring.
- **`getYelpPhotos()` unused legacy function** in `yelp.ts` — an older, simpler Yelp
  photo fetcher kept for reference but not called anywhere in the live pipeline
  (superseded by `fetchYelpBusinessData`). Candidate for deletion during a future
  cleanup pass, not urgent.

---

## Known gaps / half-finished pieces (be honest about these)

1. **Menufy direct API endpoint is a guess.** `fetchMenufyAPI()` in
   `src/lib/menuSources.ts` tries 7 plausible REST endpoint URL patterns against
   `api.menufy.com` (none confirmed to return real data in live testing — the browser
   calls were all blocked by CORS, which doesn't tell us if the *shape* is even
   right). The Scrapfly `render_js=true` fallback is the more reliable path and
   should be treated as primary until/unless the direct API is confirmed working.
2. **Menufy link-follower only follows 1 hop.** Richie's Diner requires 2
   (`richiesdiner.com` → `/order` → `richiesdinertemecula.com`). `checkLinksForMenufy`
   needs a recursive or 2-pass version to handle this pattern, which is likely common
   for multi-location restaurant groups.
3. **Grubhub has never been confirmed working end-to-end** against a real
   restaurant in production. Code is deployed and should be tested with Scrapfly
   active before trusting it.
4. **DoorDash via Google Custom Search fallback is untested** since those env vars
   were never added (Scrapfly was prioritized instead).
5. **The debug-sources endpoint (`/api/debug-sources`) does not yet test Grubhub or
   Menufy** — it only covers Places v1, website, Yelp, and DoorDash-direct. Should be
   extended to cover all 6 sources for faster future debugging.
6. **No automated tests exist anywhere in this repo.** All verification to date has
   been manual, live, production-only testing via the Chrome DevTools MCP and direct
   `fetch()` calls from a browser console tab. This matches the user's explicit
   "always test in production" instruction, but means there's no regression safety
   net — future changes should be spot-checked against a few real restaurants before
   considering them done.

---

## Suggested next steps, roughly in priority order

1. Get the three env vars / account fixes done (Action Items 1–3 above) — this is
   the highest-leverage unblock and requires no further code changes.
2. Re-run `/api/debug-sources` against Richie's Diner (`placeId:
   ChIJo5rSwlh_24ARYXLdrsbKRu8`) and a couple of chain restaurants once Scrapfly is
   live — confirm which of DoorDash/Grubhub/Menufy actually return data, and fix
   whichever don't (starting with Menufy's endpoint guesses).
3. Fix the Menufy 2-hop link-follower for Richie's-style site structures.
4. Extend `/api/debug-sources` to cover Grubhub + Menufy explicitly.
5. Once real coverage data exists across ~10-15 test restaurants, revisit
   `computePriorityScore` and the photo cap (`.slice(0, 20)` in `dishes/route.ts`)
   — with 6 sources now contributing, 20 may be too low a ceiling to show all the
   good pre-labeled photos for well-covered restaurants.
6. Consider deleting the unused `getYelpPhotos()` legacy function during a cleanup
   pass.
7. Longer-term / bigger swing (not yet scoped): decide whether any of this pipeline
   should move off a single 60-second serverless function (`maxDuration = 60` in
   `dishes/route.ts`) and into a background job / queue model if source count keeps
   growing and per-request latency becomes a problem for uncached restaurants.

---

## How to verify anything you build here

The user's standing instruction is **production-only testing** — no local dev
server verification. Use a live Chrome tab pointed at
`https://seefood-rho.vercel.app`, and either interact with the UI directly or use
`fetch()` calls from the browser's JS console (via a Chrome automation MCP tool) to
hit `/api/dishes`, `/api/restaurant`, and `/api/debug-sources` directly. Cache-bust
by varying the `name` query param slightly (it's part of the cache key) when you
need a fresh, uncached pipeline run to test a code change.
