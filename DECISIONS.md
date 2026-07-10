# SeeFood — Project Intelligence Document

This document exists so that any developer (human or AI) can pick up this project cold,
understand every meaningful decision, and continue building without needing to re-derive
context from the code. It is the single source of truth for *why* things are the way they are.

Update this file whenever a significant decision is made, reversed, or a variable is changed.

---

## ⚑ The Vision — Version 2 (locked, July 2026) — SUPERSEDES Version 1

> **SeeFood is the menu you can see.** Open it at any restaurant — or point at one on the
> map — and the menu materializes as beautiful photos of real dishes, instantly. Full spec:
> **`PRD.md`** (authoritative; wins all conflicts). Rationale: **`PRODUCT_REVIEW.md`**.
>
> Key v2 decisions (founder-approved):
> - **The Reveal** (full-screen dish-first vertical feed) is the default view; an improved
>   grid remains one tap away via a persistent toggle in the main UI.
> - **Map Explore is a first-class surface** (dish-photo-thumbnail pins, instant open on
>   the user's block) — SeeFood is also for browsing restaurants you're not standing in.
> - **No prices in the UI** (capture into corpus when free; never display in early versions).
> - **Permanent data corpus** (Supabase) replaces the 24h throwaway cache — the corpus is the moat.
> - **Two-tier data engine:** unlimited $0 local crawler on the founder's Mac
>   (Scrapling/Camoufox/curl_cffi, residential IP) + Scrapfly free tier for live gaps.
> - **Yelp dropped** (no free tier exists anymore; no trial-farming).
> - **Launch zone: Temecula, CA** — pre-crawled to saturation before expanding.
> - Long-term: user contributions + reputation (points/levels), and paid restaurant-claimed
>   pages with "From Management" photos (tagged, filterable).

## ⚑ The Vision — Version 1 (locked, May 2026) — superseded by V2 above

> **SeeFood is the world's best aggregator of restaurant menu data.**
>
> It sources menu item names, descriptions, and photos from every available data
> source — Google Places, Yelp, DoorDash, the restaurant's own website — and
> reassembles them into the simplest possible user experience:
>
> *Open the app at a restaurant. Instantly see what to order, with real photos
> and real menu descriptions. No searching. No scrolling through reviews.*
>
> The question it answers: **"What should I order here?"**
>
> Every feature, every data source, every architectural decision must serve that
> singular purpose. If it doesn't help a person decide what to eat, it doesn't
> belong in this app.

This vision was arrived at organically during development and is recorded here
so no future contributor ever has to re-derive it.

---

## What This App Does

SeeFood is a mobile-first PWA that answers one question: **"What should I order here?"**

The user opens the app at a restaurant. The app:
1. Detects their GPS location
2. Identifies the nearest restaurant via Google Places
3. Fetches up to 20 photos of that restaurant, filters them to food-only using Vision AI,
   and labels each dish where possible
4. Extracts dish names mentioned in Google reviews via NLP
5. Presents everything as a dark-themed photo grid with dish labels, review chips,
   and a map-based restaurant picker

There is no login, no database, no user data stored anywhere. Fully stateless.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Vercel-native, handles SSR/API routes in one project |
| Language | TypeScript | Type safety on API response shapes |
| Styling | Tailwind CSS v4 | Utility-first, no design system overhead |
| Hosting | Vercel (`seefood-rho.vercel.app`) | Zero-config deploys from GitHub main branch |
| Repo | GitHub (`captaingeech74/seefood`) | Auto-deploys to Vercel on push |
| Dev port | 3010 | Non-default to avoid conflicts (`next dev -p 3010`) |

No UI component library. No state management library. No database. No auth.

---

## Architecture Overview

```
Browser (PWA)
  └─ src/app/page.tsx          ← single-page client component, owns all state
       ├─ /api/restaurant      ← server route: GPS → nearest restaurant
       │    ├─ google.ts       → findNearbyRestaurant / getRestaurantDetails
       │    └─ yelp.ts         → findYelpBusiness (returns yelpId for future use)
       └─ /api/dishes          ← server route: placeId → filtered food photos + dish names
            └─ google.ts       → getGooglePhotosAndReviews
                 ├─ Places API  (photo candidates)
                 ├─ Vision API  (food filter + dish label per photo)
                 └─ reviewParser.ts (dish names extracted from review text)
```

All API calls to Google/Yelp happen **server-side** (in route handlers), keeping keys
out of the browser. The client only talks to `/api/*`.

---

## Application State Machine

The main page (`page.tsx`) drives through these states:

```
locating
  → loading_restaurant   (GPS acquired, fetching nearest place)
    → loading_dishes     (restaurant found, fetching photos — header IS visible here)
      → ready            (all data loaded, gallery shown)
  → error                (GPS denied or no restaurant found)
  → map_open             (user tapped "Not here?" or "Search for a Restaurant")
```

**Key decision:** `loading_dishes` does NOT show a full-screen spinner. The `RestaurantHeader`
stays visible so the user knows which restaurant is loading. Only the gallery area shows
a skeleton grid. This was a deliberate UX choice over a simpler full-screen loading state.

---

## File Map

### `src/app/page.tsx`
Client component. Owns the entire app state. Renders one of:
- `<LoadingScreen>` for `locating` and `loading_restaurant`
- Error screen with "Search for a Restaurant" CTA for `error`
- `<MapPicker>` for `map_open`
- `<RestaurantHeader>` + `<PopularDishes>` + `<DishGallery>` for `ready`/`loading_dishes`

### `src/app/layout.tsx`
Sets PWA metadata: `manifest.json`, Apple Web App capable, `black-translucent` status bar,
`viewportFit: "cover"` for notch/island handling. Preconnects to Google Maps domains.

### `src/app/api/restaurant/route.ts`
GET handler. Accepts `?lat=&lng=` (GPS flow) or `?placeId=` (map-select flow).
Returns a `Restaurant` JSON object. Also tries to find a matching Yelp business ID
(stored on the restaurant object for future use — see Yelp section below).

### `src/app/api/dishes/route.ts`
GET handler. Accepts `?placeId=`. Calls `getGooglePhotosAndReviews`, returns
`{ dishes: DishPhoto[], popularDishes: string[] }`. Hard cap: `dishes.slice(0, 20)`.

### `src/lib/types.ts`
Two interfaces that are the contract between server and client:

```typescript
MenuItemData { name, description?, imageUrl? }  // travels through pipeline

DishPhoto {
  id, url,
  dishName: string|null,
  dishDescription: string|null,   // sourced alongside name; shown in lightbox
  isMenuMatch: boolean,
  source: "google"|"yelp"|"doordash"|"website",  // shown in lightbox
  attribution: "user"|"owner",
  width, height
}
Restaurant { id, name, address, lat, lng, placeId?, yelpId?,
             rating?, reviewCount?, priceLevel?, isOpen? }
```

### `src/lib/google.ts`
The most important server-side file. Three exported functions + Vision API internals.

**`findNearbyRestaurant(lat, lng)`** — Nearby Search, returns closest restaurant.
**`getRestaurantDetails(placeId)`** — Place Details, returns full restaurant record.
**`getGooglePhotosAndReviews(placeId)`** — Place Details (photos + reviews), runs Vision
  batch, returns filtered `DishPhoto[]` + `popularDishes[]`.

### `src/lib/reviewParser.ts`
Pure NLP. Takes Google review objects, returns up to 8 dish name strings.
Three extraction strategies: trigger phrases, quoted phrases, praise constructions.
See "Review Parser" section below for tuning variables.

### `src/lib/yelp.ts`
**`findYelpBusiness(name, lat, lng)`** — Business Search by name+location. Returns Yelp ID.
**`getYelpPhotos(businessId)`** — Fetches business photos + reviews. Returns `DishPhoto[]`.
⚠️ `getYelpPhotos` is implemented but **never called**. Yelp free tier only returns 3 photos
per business, which isn't enough to be useful. The function exists for future expansion.
The `yelpId` is fetched and stored on the `Restaurant` object so it's available when needed.

### `src/components/RestaurantHeader.tsx`
Sticky header. Shows: green dot + "YOU'RE AT" → restaurant name → rating/price/open badge
row → address + "Not here?" orange link. The "Not here?" link replaced an earlier
"Switch ↕" button that tested poorly (ambiguous UX).

### `src/components/MapPicker.tsx`
Full-screen map overlay. Google Maps JS API loaded dynamically via script tag (not npm
package, because the maps npm package doesn't work well with Next.js App Router).
- First `idle` event → auto-search current area
- Subsequent `idle` events → show "Search this area" floating button (350ms debounce)
- Search box (Google Places SearchBox) navigates map and triggers restaurant search
- Restaurant pins: orange filled circles (selected: white fill + orange ring + larger)
- **Modern bottom sheet pattern** replaces info windows. Tapping a pin sets `selected`
  state which renders a glass-effect card at the bottom of the map with name, rating,
  price level, address, and a "See the dishes" CTA button.
- Tap-empty-map dismisses the sheet; selected pin resets to base style.
- Recenter FAB (floating action button) bottom-right; auto-hides while sheet is open.
- Map style: flatter dark theme (#16161c surfaces) with POI labels suppressed for clarity.
- `gestureHandling: "greedy"` so single-finger pan works on mobile.

### `src/components/DishGallery.tsx`
Single unified responsive grid (2 cols mobile / 3 tablet / 4 desktop).
Photos are sorted: named dishes first, unnamed after — but rendered in one continuous
grid (no awkward two-section split as in earlier versions). The section header reads
"The Menu — N identified · M total". Shows a 12-cell shimmer skeleton while loading.
Owns the `lightboxIndex` state and renders `<Lightbox>` when a card is tapped.

### `src/components/DishCard.tsx`
Square card rendered as a `<button>` for accessibility.
- Lazy-loaded image with fade-in + subtle hover scale (1.03)
- Shimmer skeleton (gradient sweep) while loading
- Bottom vignette gradient + bold dish name overlay (line-clamp-2)
- Attribution badge top-LEFT: amber "Management" for owner photos, frosted dark "User"
  for user-contributed photos
- Tap → opens `<Lightbox>` via `onOpen` callback

### `src/components/Lightbox.tsx`
Full-screen modal photo viewer. The centerpiece UX of the gallery.
- Swipe horizontally between photos, swipe down to dismiss
- Keyboard navigation (Esc, arrow keys) for desktop
- Side arrow buttons on `sm+` screens
- Dish name + "Management/User" attribution overlay at bottom
- Index counter at top ("3 / 17")
- Locks body scroll while open
- z-index 100 so it covers the sticky header

### `src/components/PopularDishes.tsx`
Horizontal chip row of dish names extracted from reviews. Orange-tinted pills.
Hidden when the list is empty.

### `src/components/LoadingScreen.tsx`
Simple centered spinner + message. Used only for `locating` and `loading_restaurant`.

---

## External APIs & Keys

All keys are in `.env.local` (git-ignored) and as Vercel production env vars.

| Env Var | Project | Used For |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Cloud 815087896573 (seefood-map) | Places API (Nearby, Details, Photos) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Same key | Google Maps JS API in MapPicker (client-side) |
| `VISION_API_KEY` | Google Cloud 1035694549658 (Default Gemini Project) | Cloud Vision API |
| `YELP_API_KEY` | Yelp App `_CA6mufZeOpz2Qscu6XqLQ` | Yelp Fusion — business search + reviews |

**Why two separate Google Cloud projects?** The seefood-map project (815087896573) has
org-level restrictions that blocked enabling the Vision API without admin approval
(Google Workspace org admin). The Default Gemini Project (1035694549658) is a personal
project with no org restrictions. Vision API billing was manually linked to enable it.

**NEXT_PUBLIC_ prefix:** The Maps JS API key must be available client-side for the MapPicker
dynamic script load. This is safe because it's a browser-restricted key (HTTP referrer
restrictions should be set in Google Cloud Console if not already done).

---

## Photo Pipeline (Most Complex Subsystem)

### Step-by-step flow for one restaurant

1. `getGooglePhotosAndReviews(placeId)` calls Place Details API for `photos,reviews`
2. The raw photo array is split into two buckets and concatenated:
   - **Bucket 1:** non-portrait photos (`width >= height`) — first in the list
   - **Bucket 2:** portrait photos (`height > width`) — appended at end
3. Combined array is sliced to **20 candidates**
4. Photo URLs are constructed (Google Places Photo API, `maxwidth=800`)
5. All 20 URLs sent in **one batch POST** to Vision API (`LABEL_DETECTION`, 15 labels/image)
6. Each response is evaluated:
   - `isFood`: any label with score > 0.65 matches `FOOD_SIGNAL_LABELS` → passes filter
   - `dishName`: highest-scoring label with score > 0.72, food-positive, not in `SKIP_AS_DISH_NAME`
7. Non-food photos (`isFood = false`) are dropped entirely
8. Surviving photos become `DishPhoto[]` with attribution ("owner" or "user") detected
   from the `html_attributions` text of the Google photo

### Tunable variables

| Variable | Current Value | Where | Notes |
|---|---|---|---|
| Candidate cap | 20 | `google.ts` `.slice(0, 20)` | May reduce to 10–12 once we have hit-rate data |
| Portrait threshold | `height > width` (strict) | `google.ts` filter | Could soften to `height > width * 1.15` |
| Food signal score | `> 0.65` | `FOOD_SIGNAL_LABELS` check | Lower = more pass-through |
| Dish name score | `> 0.72` | `dishLabel` find | Raise to tighten; lower for more labels |
| Vision timeout | 8000ms | `AbortSignal.timeout(8000)` | Fail-open on timeout |
| API route cap | 20 | `dishes/route.ts` `.slice(0, 20)` | Second guard; matches candidate cap |

### Fail-open behavior
If Vision API errors, times out, or returns an unexpected shape, every candidate photo
passes through as `isFood: true` with `dishName: null`. The user sees photos without
labels rather than an empty gallery. This is intentional.

### Attribution detection logic
Owner photos are detected heuristically from `html_attributions`:
- Contains "owner" → owner
- Contains "the official" → owner
- Has attributions but does NOT contain "maps.google.com/maps/contrib" → owner
- Otherwise → user

This heuristic is imperfect. Google doesn't expose a clean owner/user flag.

---

## Review Parser (NLP)

Extracts dish mentions from up to 5 Google reviews returned by the Place Details API.
Returns up to 8 unique dish names, sorted by mention score.

### Three extraction strategies

1. **Trigger phrases** (e.g., "try the", "ordered the") → grab 1–4 words after
2. **Quoted phrases** (e.g., `"morning bun"`) → +3 confidence weight
3. **Praise constructions** (e.g., "the ramen was amazing") → +2 confidence weight

### Validation pipeline

Each candidate phrase must:
- Be 1–5 words, 3–40 characters
- Not start with a digit
- Contain no word from `REJECT_PHRASES` (stop words, opinion words, conjunctions, etc.)
- Either be in `KNOWN_DISHES` OR end with a word from `FOOD_SUFFIXES`

### Tunable variables

| Variable | Where | Notes |
|---|---|---|
| Max dishes returned | `if (final.length >= 8) break` | Increase for more chips |
| Quote confidence weight | `+3` in quoted match | Adjust relative to trigger weight |
| Praise confidence weight | `+2` in praise match | |
| `FOOD_SUFFIXES` | Hardcoded array | Add new dish types here |
| `REJECT_PHRASES` | Hardcoded Set | Add stop words that sneak through |
| `KNOWN_DISHES` | Hardcoded Set | Add short names that fail suffix check |

---

## Map Experience

### "Search this area" pattern
On first map `idle` event → auto-search nearby restaurants (no button needed).
On subsequent `idle` events (after user pan/zoom) → show floating "Search this area" button.
This avoids surprise API calls on every pan while staying frictionless on first open.

### Initial map zoom
Set to **15** (≈1250m radius). Was 16 (≈625m) which showed only 1 restaurant in suburban
areas. Zoom 15 shows a full neighborhood's worth of options on first open.

### Restaurant pin detection radius
Derived from zoom level: `radius = Math.min(50000, Math.round(40000 / Math.pow(2, zoom - 10)))`
Clamped to minimum 300m. The formula means at zoom 14 ≈ 2500m radius.

### Why dynamic script tag, not npm package
The `@googlemaps/js-api-loader` or direct import approach doesn't work cleanly with
Next.js App Router. The MapPicker loads the Maps JS API via a `<script>` tag appended
to `document.head` with a `callback=initMapPicker` parameter. `initMapPicker` is set
on `window` before the script fires.

---

## Design System

All design tokens live in `src/app/globals.css` as CSS custom properties on `:root`.
Components reference them via `var(--token-name)` to keep visual consistency.

### Surface scale
- `--surface-0: #0a0a0a` — page background
- `--surface-1: #131313` — slightly raised (rare; modal backdrops)
- `--surface-2: #1a1a1a` — cards, inputs
- `--surface-3: #242424` — pressed/hovered card states

### Text scale
- `--text-primary` (#fafafa) — headings, primary content
- `--text-secondary` (rgba 0.65) — body text
- `--text-tertiary` (rgba 0.40) — secondary metadata
- `--text-quaternary` (rgba 0.22) — footnotes, dividers, count labels

### Brand
- `--accent: #ff6b35` — primary orange
- `--accent-hover: #ff8555`
- `--accent-soft: rgba(255,107,53,0.12)` — chip backgrounds
- `--accent-ring: rgba(255,107,53,0.35)` — focus rings

### Motion
- `--ease-out-expo` — content reveal, fade-up
- `--ease-spring` — card entrances, position transitions (Apple-like)
- `--ease-standard` — micro-interactions, tap-scale

### Reusable utilities
- `.shimmer` — animated gradient sweep for skeletons
- `.glass` — `backdrop-filter: saturate(180%) blur(20px)` + 72% black
- `.fade-up`, `.fade-in`, `.slide-up`, `.scale-in`, `.dot-pulse` — keyframes
- `.tap-scale` — 97% active scale with standard easing
- `.text-shadow-soft` — for text overlaid on photography
- `.no-scrollbar` — hides scrollbars on horizontal scroll containers

### Typography
- System font stack with `font-feature-settings: "ss01", "cv11", "kern"` for
  proper kerning and stylistic alternates on supported fonts (Inter, SF)
- `tabular-nums` applied on counts/ratings to prevent number jitter
- Letter-spacing scale: `tracking-[-0.015em]` on headings, `tracking-[0.18em]` on eyebrows

---

## UX Design Principles

- **Dark theme throughout:** bg `#0a0a0a`, cards `#1a1a1a`, accent `#ff6b35` (orange)
- **Mobile-first:** max-width 3xl, safe-area insets everywhere, no pinch-zoom
- **No text over food:** dish name appears as a small frosted pill at the very bottom
  edge of the card, not as a gradient overlay covering the food
- **Attribution as signal:** "Management" badge (amber) vs "User" badge (frosted dark)
  — both visible so we can assess quality of each source over time
- **Inline loading:** restaurant header stays visible while dishes load (not full-screen)
- **Error recovery:** if GPS denied, user gets a "Search for a Restaurant" CTA that
  opens MapPicker centered on San Francisco as the fallback location

---

## PWA Setup

- `public/manifest.json` — app name, icons, display: standalone, background: #0a0a0a
- `layout.tsx` — `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }`
- `viewportFit: "cover"` + `env(safe-area-inset-*)` in headers/footers
- Theme color `#0a0a0a` for browser chrome

To add to iOS home screen: Safari → Share → Add to Home Screen.

---

## Deployment

| Target | URL | Trigger |
|---|---|---|
| Production | `seefood-rho.vercel.app` | Push to `main` |
| Local dev | `localhost:3010` | `npm run dev` |

Vercel env vars are set via `vercel env add NAME production`. The `.env.local` file
is git-ignored and must be re-created from scratch when cloning. Required vars:
- `GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (same key as above)
- `VISION_API_KEY`
- `YELP_API_KEY`

---

## Git Conventions

- `main` is always deployable
- Annotated tags as rollback checkpoints: `git tag -a v0.1.0 -m "..."` then `git push origin --tags`
- `v0.1.0` — saved before Vision API + map redesign work

---

## Known Limitations & Future Work

### Yelp photos unused
`getYelpPhotos` is implemented but never called. Yelp free tier returns only 3 photos
per business — not enough to be useful. The Yelp business ID (`yelpId`) is fetched and
stored on the `Restaurant` object, ready to use if Yelp paid access is obtained.

### Google Places photo limit
The Places API returns at most ~10 photos on the free tier; up to 20 on paid. We
request 20 and get whatever Google returns.

### Photo Analysis: Gemini 2.5 Flash (Vision API fully retired)

Google Vision `LABEL_DETECTION` is retired. Gemini 2.5 Flash multimodal vision replaced
it — it reasons about food in natural language and matches against actual menu item names.
The `VISION_API_KEY` env var is retained but now points to the Gemini project.

### Pipeline (in order)

1. **Menu data assembly** (Phase 1+2, see "Menu Data Sources" below): All three menu
   sources run before photo analysis. The merged item list is the reference Gemini works from.
2. **Image fetch** (`fetchImageAsBase64`): Each photo fetched at `maxwidth=400` as base64
   for Gemini inline data. Display URL uses `maxwidth=800`.
3. **Gemini analysis** (`analyzePhotoWithGemini`): All 20 photos analyzed in parallel.
   Each call sends image + full merged menu list. Response: `{dishName, isMenuMatch, isFood}`.
4. **Priority scoring** (`computePriorityScore`): Scores each photo 100+/50/30+/10/5/-1.
5. **Sort + filter**: Stable sort descending by score. Non-food (−1) filtered out.

### Gemini prompt strategy
- *With reference list*: "Here is their menu / dishes commonly ordered here. Return the
  exact item name from the list, OR the full specific dish name if not on the list, OR null."
- *No reference*: "Return the full, specific dish name — include cooking method, key
  ingredients, and modifiers. Or null if no food visible."
- Temperature 0, maxOutputTokens 200, thinkingBudget 0 (thinking disabled — saves
  tokens/cost; CoT not needed for food identification).
- Match logic: exact OR fuzzy (one string contains the other) → `isMenuMatch: true`.
  Handles "Truffle Burger" ↔ "House Truffle Wagyu Burger" correctly.

### Priority scoring tiers
| Score | Meaning |
|---|---|
| 100+ | Menu match + in `popularDishes` — the money shots |
| 50   | Menu match only |
| 30+  | AI-identified + in `popularDishes` |
| 10   | AI-identified food |
| 5    | Food visible, no label |
| -1   | Non-food → filtered out |

### Tunable variables
| Variable | Value | Where |
|---|---|---|
| Gemini model (primary) | `gemini-2.5-flash` | `MODELS[0]` in `analyzePhotoWithGemini` |
| Gemini model (fallback) | `gemini-2.5-flash-lite` | `MODELS[1]` |
| Temperature | 0 | `generationConfig` |
| maxOutputTokens | 200 | `generationConfig` |
| thinkingBudget | 0 | `generationConfig.thinkingConfig` |
| Gemini timeout | 20s | `AbortSignal.timeout(20000)` |
| Image analysis size | maxwidth=400 | `analysisUrls` builder |
| Image display size | maxwidth=800 | `displayUrls` builder |
| Menu items cap | 60 | `referenceItems.slice(0, 60)` |
| popularDishes cap | 20 | `popularDishes.slice(0, 20)` |
| Function timeout | 60s | `export const maxDuration = 60` in route.ts |

### isMenuMatch semantics
`isMenuMatch: true` means the Gemini response matched the reference list — either exact
or fuzzy (containment in either direction). Both formal menu items and popular dishes from
reviews qualify. From the user's perspective this means "we're confident this is a named
dish from this restaurant."

---

## Menu Data Sources

Three sources are queried in parallel on every restaurant load and merged before Gemini
sees a single image. `menuSources.ts` provides the shared URL-to-items parser.

### Source 1 — Google Places API v1 `menuItems` — ☠️ CONFIRMED NONEXISTENT (July 2026)
`fetchMenuFromPlacesV1(placeId)` — **this source was a phantom.** Founder verified directly
against Google: Places API (New) has no `menuItems` field ("cannot find matching fields for
path 'menuItems'"). The "~15–25% coverage" claim below was never real; the call never once
returned data. Code deleted per PRD. Replacement roles: menu-photo OCR + ordering-platform parsers.

### Source 2 — Restaurant website schema.org LD+JSON
`fetchMenuFromUrl(websiteUrl)` — the restaurant's own website, ~35–50% of restaurants
with a website embed schema.org `MenuItem` data for SEO (auto-generated by Toast, Square,
Squarespace, Wix, Olo). The `website` field is fetched from the existing Place Details
call (one extra field, zero extra API calls). `menuSources.ts` recursively walks the
LD+JSON tree collecting all `@type: MenuItem` names.

### Source 3 — Yelp `attributes.menu_url`
`fetchYelpBusinessData()` now returns both review text AND menu items. If the Yelp
business listing includes a `menu_url` in its attributes, that URL is fetched and parsed
with the same `fetchMenuFromUrl` schema.org parser. This runs inside the Yelp call itself
— no extra latency phase.

### Source 4 — DoorDash (two-strategy, no env vars required for basic operation)
DoorDash has the broadest menu coverage. Every menu item has a name, description,
and photo — already paired together. DoorDash photos **bypass Gemini** (pre-labeled).

**Two parallel strategies** (results merged + deduplicated):

**Strategy A — Direct scrape (always active, no env vars):**
`fetchDoorDashDirect` → searches doordash.com/search/?q={name}, extracts store URL slugs
from the HTML via regex, scores by name overlap, fetches the best match store page,
parses `__NEXT_DATA__` JSON recursively for `{name, description, imageUrl}` objects.
Best-effort; gracefully returns `[]` on any failure (bot detection, timeouts, etc.).

**Strategy B — Google Custom Search (optional, more reliable when enabled):**
`fetchDoorDashViaGoogleSearch` → same as before. Requires two env vars:
```
GOOGLE_SEARCH_API_KEY=...   # Google Cloud Console → Custom Search API
GOOGLE_SEARCH_ENGINE_ID=... # programmablesearchengine.google.com
```
Cost: $0.005/query after 100/day free tier. Returns `[]` gracefully if vars absent.

Both strategies call shared `fetchDoorDashStorePage(url)` to parse the store page.

---

## Vision API cost
Each restaurant load = 1 batch Vision call for up to 20 images.
At Google's pricing (~$1.50/1000 images), 1000 restaurant views ≈ $30.
Portrait-first sorting reduces wasted Vision calls as portrait photos are more
likely to fail the food filter.

### Review NLP quality
The review parser now works on Google reviews (≤5) **plus** Yelp reviews (≤20),
merged before NLP runs. This gives up to 25 reviews vs the original 5.
Google returns reviews by "relevance"; Yelp by `yelp_sort`. Both are biased toward
high-confidence reviews. False positives still occasionally slip through for
restaurants with non-standard dish names.

### Response caching (added)
`unstable_cache` from `next/cache` wraps `getGooglePhotosAndReviews` in the dishes
route handler. Cache key: `["restaurant-dishes", placeId, restaurantName]`.
TTL: 86400s (24 hours). Uses Next.js / Vercel Data Cache — free, built-in, persistent
across cold starts. A 20–40s API+Gemini round-trip becomes a sub-100ms cache read on
repeat visits to the same restaurant.

### No Yelp photo Vision filtering
When/if Yelp photos are enabled, they bypass Vision filtering entirely. The Yelp
`label` field ("food", "inside", "outside", etc.) can serve as a pre-filter
instead of Vision — that's already partially scaffolded in `yelp.ts`.

---

## Phase 0 fixes (July 6, 2026)

- **Places API (New) unblocked.** New `PLACES_API_KEY` (seefood-vision project, restricted
  to Places API New) added to Vercel + `.env.local`. `fetchMenuFromPlacesV1` in `google.ts`
  now uses it instead of the Gemini-restricted `VISION_API_KEY`.
- **`SCRAPFLY_KEY` added** — unblocks DoorDash/Grubhub/Menufy anti-bot fallback paths.
- **Root cause of the stray `\n` on every photo URL found:** it wasn't a code bug — the
  `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, and `VISION_API_KEY` Vercel env
  var *values themselves* had a literal trailing `\n` baked in (visible via `vercel env
  pull`), likely from how they were originally pasted in months ago. Removed and re-added
  all three with clean values; also added defensive `.trim()` in `google.ts` so this class
  of bug can't silently reappear.
- **Key-leak fix:** added `/api/photo?ref=&maxwidth=` proxy route (`src/app/api/photo/route.ts`)
  that fetches Google Places photo bytes server-side. Google display URLs sent to the client
  no longer contain `GOOGLE_MAPS_API_KEY` — only the photo_reference. The Gemini analysis
  URL (server-only, never reaches the browser) still uses the raw Google URL.
- **Gemini prompt rework** (`analyzePhotoWithGemini` in `google.ts`): now requests strict
  JSON (`responseMimeType: "application/json"`) with separate `name` (≤4 words, menu-style)
  and `description` (long-form) fields, plus an explicit `isOrderable` flag so drinks-in-
  fridges/interiors/storefronts get excluded even when technically "food". Added
  `isTruncatedOrInvalid()` to reject names ending in conjunctions/dangling punctuation as a
  second line of defense against truncation.
- **Menufy 2-hop link follower fixed.** `checkLinksForMenufy` in `menuSources.ts` is now
  recursive (depth cap 3, visited-set guard against loops) instead of following exactly one
  hop — needed for Richie's Diner's `richiesdiner.com` → `/order` → `richiesdinertemecula.com`
  chain.
- **`/api/debug-sources` extended to all 6 sources** (places_v1, website, yelp, doordash,
  grubhub, menufy) by exporting `fetchMenuFromDoorDash`/`fetchMenuFromGrubhub` from
  `google.ts` and calling the real production code paths instead of duplicating scrape logic
  in the debug route.
- **Benchmark + scoreboard built** (`npm run benchmark`, `scripts/benchmark.mjs`): fixed
  25-restaurant Temecula set (`benchmark/restaurants.json`, mix of chains/independents/
  Menufy-style/no-website dives, Richie's included) hit live against `/api/debug-sources`
  and `/api/dishes`; writes a per-source hit-rate/items/latency table plus a JSON snapshot
  to `benchmark/results/<date>.json`.
- **Google Places API (New) has no `menuItems` field.** Confirmed live: requesting it
  returns `400 Cannot find matching fields for path 'menuItems'`. The key/routing works
  fine (verified with other fields like `reviews`, `editorialSummary`); the field the
  original code (and PRD §5.3) assumed exists simply doesn't. This source is dead — not
  a config problem, a wrong assumption. Flagged for Kyle; no further Places v1 menu work
  should happen without Google actually shipping this.
- **DoorDash is broken two ways, one fixed, one not.** (1) `fetchWithAntiBot`'s ASP
  challenge for DoorDash costs 51–75+ Scrapfly credits per call (`ERR::SCRAPE::
  COST_BUDGET_LIMIT` at the old `cost_budget=10`, which silently rejected every DoorDash
  attempt before it ever hit the network — that's why DoorDash scored 0% on every prior
  benchmark run). Raised to `cost_budget=100`; at that price the free 1,000-credit/month
  tier only covers ~10-13 DoorDash lookups/month, a real constraint worth Kyle knowing
  about. (2) Even past the cost gate, DoorDash's own `/search/?q=` endpoint now returns a
  plain 404 for search queries that used to work (confirmed directly via Scrapfly against
  `doordash.com/search/?q=Chick-fil-A` — `ERR::SCRAPE::BAD_UPSTREAM_RESPONSE`, real 404,
  not a bot block). DoorDash likely changed their search URL structure since this scraper
  was written. Did not chase further today to avoid burning Scrapfly credits investigating
  a site-structure question — needs its own investigation (probably a different search
  endpoint or a GraphQL API) before DoorDash can come back online. Grubhub, by contrast,
  is cheap and returning real responses today (still 0 hits on the current benchmark set
  because Grubhub's search often doesn't index small independents — worth re-testing on
  chains specifically).
- **Menufy link-follower bug found and fixed**: the original href-scanner matched every
  `href=""` attribute in the HTML (including `<link>`/`<img>` favicon, font, and CDN
  asset tags), which crowded the real `/order` anchor out of the 4-candidate slice taken
  from the head of the document. Now scans only `<a href="">` anchors and prioritizes
  order/menu-path links. This alone took Richie's Diner's Menufy source from 0 → 221
  parsed menu items.

---

## Phase 1 (July 6-7, 2026)

- **Critical Gemini regression found and fixed**: the Phase 0 JSON short-name prompt
  (`responseMimeType: "application/json"`) was sent to the `v1` Gemini endpoint, which
  doesn't recognize that field (`400 Cannot find field`) — confirmed live. Every
  restaurant relying purely on Gemini (no Menufy/website/Grubhub pre-labeled data) got
  **zero dish names** from the moment that prompt shipped. Only caught now because
  Richie's has full Menufy coverage and masked it in every prior test. Fixed by moving
  to `v1beta`. Lesson: verify a fix against a restaurant with NO pre-labeled source, not
  just the flagship test case — Richie's success can hide totally broken paths.
- **Supabase corpus is live**: `db/schema.sql` (restaurants, menu_items, photos,
  source_runs) applied via `scripts/setup-db.mjs`. Direct `db.<ref>.supabase.co` is
  IPv6-only on new projects and unreachable from networks without IPv6 (including this
  one) — use the Supavisor pooler connection string from the dashboard (Settings →
  Database), stored as `DATABASE_URL` in `.env.local` only, never committed.
- **Corpus persistence race found and fixed**: `/api/dishes` originally fired
  `persistToCorpus(...)` without awaiting it before returning the response. Vercel
  serverless functions stop executing the instant a response returns — no background
  work survives without an explicit `waitUntil`, which this Next 14 setup doesn't use.
  Only the restaurant-row upsert (a single fast REST call) reliably landed; menu_items
  and photos were silently never written. Fixed by awaiting persistence before
  responding — adds a few seconds to cold-miss latency, acceptable since cold misses
  already take ~30s for Gemini.
- **Places v1 code fully deleted** (`fetchMenuFromPlacesV1` and all references) —
  confirmed dead field, not resurrecting without Google shipping it.
- **Yelp fully deleted** (`yelp.ts`, `findYelpBusiness`, `yelpId` on `Restaurant`) — no
  free tier exists, per PRD.
- **DoorDash removed from every live-path call site** (`getGooglePhotosAndReviews`,
  `/api/debug-sources`) — corpus-only now, via the Tier 1 crawler. `fetchMenuFromDoorDash`
  and its raw-HTML parsers (`parseDoorDashSearchSlugs`, `extractDoorDashItems`,
  `parseNextDataMenuItems`) stay exported specifically for crawler reuse.
- **Ordering-platform parsers added** (Toast, Square, Clover, ChowNow, Olo, PopMenu):
  stable hostname/CDN detection signatures + a generic embedded-JSON node-walker
  (same resilient technique as the Menufy API parser). Honest caveat: the fixtures for
  these six are constructed from each platform's publicly documented embed pattern, NOT
  recorded from a live restaurant on that platform — confidence is real for detection,
  best-effort for extraction until the benchmark scoreboard confirms a hit on an actual
  live target. A platform sitting at 0% hit rate against a restaurant confirmed to use it
  needs its extractor revisited.
- **Menu-photo OCR pipeline added**: the batched Gemini call now also returns
  `isMenuPhoto` per photo; photos of a printed menu/board get a dedicated OCR-style
  Gemini call extracting `{name, description, price}[]`, tagged `source: "menu_ocr"`,
  merged into the corpus for future requests (too late to help the current request's
  photo-naming, which already ran).
- **Fixture-based contract tests added** (vitest, 18 tests): Menufy item-card parsing,
  the category-vs-item price guard, schema.org, and all 6 ordering platforms. Run with
  `npm test`.
- **Tier 1 local crawler CLI built** (`npm run crawl -- --zone temecula` /
  `--place <id> --name --lat --lng` / `--refresh-stale`). Architecture (founder decision,
  July 2026): **hybrid** — Python (`crawler/fetch.py`, Scrapling + Camoufox + curl_cffi)
  does raw fetching ONLY for DoorDash, the one target genuinely banned from the live
  path by Scrapfly economics. Every other source (website, Menufy, ordering platforms,
  Grubhub, Google photos + Gemini) reuses `getGooglePhotosAndReviews` verbatim — the
  exact same parsers as the live path, never a second copy. `src/crawler/pythonFetch.ts`
  self-installs the Python venv + `pip install -r crawler/requirements.txt` on first run
  so `npm run crawl` is the only command Kyle ever needs.
  **Honest status: the Python/Camoufox fetch path is UNVERIFIED.** This sandbox can't
  safely exercise it (installing Camoufox pulls a real Firefox binary; running it here
  would be testing infrastructure that's explicitly meant to run on Kyle's Mac, not a
  dev sandbox). TypeScript compiles clean and the Node-only paths (website/Menufy/
  ordering-platforms/Grubhub/Gemini) are exactly the live pipeline, already verified
  live in production — but the first real end-to-end proof of the DoorDash Python path
  happens when Kyle runs `npm run crawl` himself. If `camoufox`/`scrapling` fail to
  install (e.g. Python <3.10 requirement — Kyle's Mac shipped with Python 3.9.6 in
  testing), that's the first thing to check; the crawler degrades gracefully (skips
  DoorDash, runs everything else) rather than crashing either way.
  Zone discovery today reads the fixed `benchmark/restaurants.json` seed list for
  `--zone temecula` rather than a full paginated Places-API sweep — good enough to prove
  the pipeline; full zone-wide discovery (a few hundred restaurants) is Phase 3 scope.

---

## Phase 1 closeout — real-world ordering-platform test (July 7, 2026)

Swapped 5 benchmark chains for 5 real Temecula restaurants confirmed live to use our
parsers (curled each site directly before adding): Swing Inn Cafe & BBQ, E.A.T
Marketplace, Ebullition Brew Works, Uncle Bob's (all **toasttab.com** links), Le Coffee
Shop (**.square.site**). This surfaced two real bugs the fixture tests couldn't catch:

- **Toast restaurants link out, they don't embed.** Every real Toast restaurant found
  links to a *separate* `toasttab.com` ordering page (`<a href="https://www.toasttab.com/...">`
  on the marketing site) — same 2-hop pattern as Menufy, which our extractor didn't
  follow. Fixed: `findOrderingPlatformLink()` now follows a link to the platform's own
  domain when nothing is embedded on the page. **But Toast's ordering page itself blocks
  direct fetches (403), and Scrapfly's ASP challenge for it costs ~51 credits/attempt —
  the identical expensive tier that got DoorDash banned from the live path.** Toast is
  therefore also corpus-only now: the link-follow fix lands (useful for the crawler,
  which can render it via Camoufox for $0), but the live serverless path will never pay
  Scrapfly for Toast, matching the DoorDash policy exactly.
- **Square/ChowNow/Clover/Olo/PopMenu render their menu entirely client-side.** Le Coffee
  Shop's raw HTML has zero `<a href>` tags and no embedded JSON at all — confirmed it's a
  pure JS SPA (Square's `editmysite.com`/Vue stack). The original parser design (scan raw
  HTML for embedded JSON) was checking the wrong thing entirely for this platform family.
  Added `fetchOrderingPlatformViaScrapfly()` — Scrapfly `render_js=true` fallback for
  every platform except Toast (cost was ~<30 credits on the one test, far cheaper than
  Toast's ASP wall). Confirmed the render succeeds (200, real page content) but this
  specific site's menu lives behind additional in-page navigation Scrapfly's default
  render didn't reach — extraction still returned 0 there. The render fallback is real
  and lands, but "renders the JS" and "finds the menu content" turned out to be two
  different problems; the second one needs more iteration per platform and is not fully
  solved by this pass. Honest status, not a claimed fix.

---

## DoorDash discovery: sitemap investigated and ruled out (July 2026)

First real end-to-end crawler run (Kyle's Mac, Python 3.12 + Camoufox + patchright,
after fixing three real setup bugs: old system Python, missing `patchright`, missing
`msgspec` — see commits) proved Camoufox genuinely gets past Cloudflare (clean `404`
from DoorDash's real server, not a challenge page) — but DoorDash's client-side search
has no stable public URL. Confirmed against **BJ's Restaurant & Brewhouse**, a
restaurant independently confirmed present on DoorDash (`doordash.com/store/bj's-
restaurant-&-brewhouse-temecula-262570/804086/`, found via web search) — all 4 guessed
search URL patterns still failed. This ruled out "wrong restaurant" as the cause; the
search endpoint itself is the problem, and it isn't documented anywhere.

Per Kyle's instruction, spent real time checking sitemap-based discovery *before*
reaching for a paid API:
- `www.doordash.com/robots.txt`, `/sitemap-static-doordash-index.xml`, and
  `/sitemap/{country}/{state}/{city}/...` browse pages are all behind the same
  Cloudflare challenge as the rest of the app — inaccessible without a real browser
  render, same cost as scraping search directly.
- `cdn.doordash.com/sitemaps/sitemaps/sitemap-cuisine-doordash-index.xml` **is** publicly
  reachable (plain CDN asset, no Cloudflare challenge) and indexes 4 regional sitemaps
  (`en-US`, `en-CA`, `en-AU`, `en-NZ`). But every URL in them is a generic category page
  (`/cuisine/indian-near-me/`, `/cuisine/hot-pot-near-me/`, 311 of them) — not a single
  per-restaurant `/store/` URL anywhere. DoorDash does not publish a store-level sitemap.
- Guessed store/sitemap-index paths under `cdn.doordash.com` (`sitemap-doordash-en-US-
  store-index.xml`, `sitemap-index.xml`, etc.) all returned a clean S3 `AccessDenied` —
  confirms these paths genuinely don't exist there, not a block.

**Conclusion: sitemap discovery is a dead end for DoorDash specifically.** Google Custom
Search (approved by Kyle, PRODUCT_REVIEW §5.3 low-cost gate) is the only viable
discovery channel. Budget discipline matching the Scrapfly pattern: self-enforced hard
cap at 100 queries/day tracked in `search_api_usage` (Supabase, survives across
serverless/crawler invocations — not just relying on Google's own quota), visible in
`/api/debug-sources`, and discovered store URLs are cached on `restaurants.doordash_store_url`
so the same restaurant is never looked up twice.

---

## DoorDash discovery: Custom Search JSON API is dead — closed to new customers (July 2026)

Wired the whole thing above (`findDoorDashStoreUrl`, budget guard, `search_api_usage`
table, debug-sources counter) the moment Kyle sent real API key + Search Engine ID.
First live call: `403 PERMISSION_DENIED — This project does not have the access to
Custom Search JSON API`. Assumed a project/key mismatch and asked Kyle to check. **He'd
already verified it properly**: clean key created directly under the enabled project
(`seefood-vision`, Custom Search API confirmed Enabled in the console), correct
restrictions — still a hard 403. Google has closed the Custom Search JSON API to new
customers entirely; no project can activate it going forward regardless of setup.
**Deleted all of it** — `findDoorDashStoreUrl`, `fetchDoorDashViaGoogleSearch`, the
`reserveSearchApiCall`/`getSearchApiUsageToday` budget guard, the `search_api_usage`
table, `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_ENGINE_ID` (removed from Vercel + local
env). Kept `restaurants.doordash_store_url` + `getDoorDashStoreUrl`/`saveDoorDashStoreUrl`
— that cache is discovery-method-agnostic and still applies to whatever replaces it.

**New discovery plan (Kyle's direction, in order):**
1. **Sitemap, take two.** The July 7 investigation above only reached `cdn.doordash.com`
   (no Cloudflare wall) and found cuisine-category sitemaps, not store-level ones. It
   never actually read `www.doordash.com/robots.txt` — every attempt from this sandbox
   (curl, WebFetch, Googlebot UA, plain UA) hit the same Cloudflare challenge. The
   crawler's Camoufox setup, proven to get past that wall (clean 404s from DoorDash's
   real server, not challenge pages), can read the real robots.txt — diagnostic command
   given to Kyle to run and paste back.
2. **Camoufox-driven interactive search**, if no store sitemap exists: type the
   restaurant name into DoorDash's own search box on a real rendered page, same as a
   human would. Free, unlimited retries on Kyle's residential IP — exactly the crawler's
   reason to exist. No public documentation exists for DoorDash's search input selector;
   a second diagnostic command dumps every `<input>` tag from the real rendered homepage
   so the actual selector gets used, not a guess.
3. **Brave Search API** (~2,000 free queries/month) as a last-resort managed fallback,
   only with the same self-enforced budget-cap discipline as Scrapfly/the now-dead
   Custom Search attempt, and only after asking Kyle first — not to be wired
   speculatively ahead of need.

---

## DoorDash discovery: sitemap works — solved for California (July 7, 2026)

Take two on sitemap discovery, this time actually reading the real `robots.txt` via
Kyle's crawler (Camoufox gets past Cloudflare; this sandbox never could). Result: a
genuine store-level sitemap exists.

- `www.doordash.com/robots.txt` lists 18 `Sitemap:` directives, including
  `sitemap-store-doordash-index.xml` — the July 6 investigation only ever reached
  `cdn.doordash.com` directly and found the cuisine-category sitemaps; it never got to
  read the real robots.txt to find this one, because every attempt from this sandbox
  hit the Cloudflare wall.
- That URL 301-redirects to `cdn.doordash.com/sitemaps/sitemaps/sitemap-store-doordash-
  index.xml` — a per-**state** index (`sitemap-doordash-{state}-stores.xml` for ~30 US
  states/CA provinces). Confirmed live: **this CDN host has no Cloudflare wall at all**
  — plain `fetch()` works from anywhere, including this sandbox. No Camoufox, no
  residential IP, $0, needed only for discovery.
- Downloaded `sitemap-doordash-ca-stores.xml` directly (17.9MB, 103,071 store URLs,
  ~85k after excluding `/convenience/store/` retail listings) and tested against 6 real
  Temecula restaurants: **4/5 known-DoorDash restaurants matched correctly** (Panera
  Bread, Buffalo Wild Wings, Ebullition, Swing Inn Cafe & BBQ — Swing Inn's actual
  DoorDash listing name is "Swing Inn Cafe", missing "& BBQ"). Richie's and E.A.T
  Marketplace correctly returned no match (both independently confirmed absent from
  DoorDash). One real bug found and fixed: BJ's initially matched a "-catering-" sub-
  listing instead of the primary restaurant (same word-overlap score, more slug words)
  — fixed by preferring the tightest match (fewest unexplained extra words) on ties.
- Individual store pages (`www.doordash.com/store/...`) remain Cloudflare-walled — the
  sitemap only solves *discovery* (finding the right URL), the crawler's Camoufox still
  does the actual page fetch for menu items.

**Implementation**: `src/crawler/doordashSitemap.ts` — `loadStoreSitemap(state)`
downloads + disk-caches a state's sitemap (24h TTL, matching DoorDash's own
`changefreq: daily`), `findDoorDashStoreUrlInSitemap(urls, name, city)` matches by
word-overlap with a tightest-match tiebreak. Wired into `crawlDoorDash` as the primary
discovery step (after the persistent `doordash_store_url` cache check), hardcoded to
`ca`/`temecula` for now since that's the exclusive launch zone. Camoufox interactive
search (priority #2 in Kyle's plan) is deferred — not needed yet since the sitemap alone
resolves Temecula-area restaurants; revisit if/when the crawler expands beyond
California or a specific restaurant isn't in the state sitemap.
6 fixture-based tests added (`src/lib/__tests__/doordashSitemap.test.ts`) covering the
catering-tiebreak bug, city disambiguation, and the two confirmed-absent restaurants.

---

## DoorDash CDN sitemaps checked for leaked menu/dish data — none found (July 2026)

Per Kyle's request, checked `sitemap-business_menu-doordash-index.xml` and
`sitemap-dish-doordash-index.xml` (both listed in robots.txt, both on the unprotected
`cdn.doordash.com` host) for any structured menu/dish data leak. Neither leaks anything:
- `business_menu` (5 shards, ~6k URLs each): real `/business/{slug}/menu` **links**, a
  different ID namespace from `/store/`, still requiring a page fetch — not embedded data.
- `dish` (4 regional shards): same pattern as the earlier cuisine sitemap — generic
  `/dish/{category}-near-me/` landing pages (alcohol, appetizer, breakfast-&-brunch...),
  not per-restaurant dish data.
Honest conclusion: no bonanza here. The store-level sitemap (previous entry) remains the
only genuinely useful discovery channel DoorDash's CDN exposes.

## Grubhub sitemap investigated — no restaurant-level index exists (July 2026)

Checked whether the DoorDash sitemap technique generalizes to Grubhub before further
diagnosing its 0/25 benchmark hit rate, per Kyle's instruction.
- `www.grubhub.com/robots.txt` is reachable directly (Grubhub has **no Cloudflare wall
  at all** — confirmed via plain `curl` from this sandbox, no crawler needed) but lists
  no `Sitemap:` directive.
- Found real infrastructure via search: `sitemap-city-{city}-{state}-browse.xml.gz`
  (confirmed live for `temecula-ca`) — but these are cuisine-category browse pages
  (`/delivery/ca-temecula/pizza`, `/delivery/ca-temecula/sushi`, ~70 categories), not
  restaurant listings. Tried the parallel `-restaurant`/`-store` naming guesses; all 404.
  **No restaurant-level sitemap exists for Grubhub.**
- Root-caused the actual 0% hit rate instead: Grubhub's search results page is a pure
  client-rendered SPA. Confirmed via plain fetch (13.5KB shell, zero restaurant links,
  zero `__NEXT_DATA__`) *and* via Scrapfly with `render_js=true` (200, real 39KB
  content, still zero restaurant links — the SPA hadn't finished hydrating/fetching
  results within Scrapfly's default render wait). This is not a bot-block (Grubhub has
  none) — our `render_js=false` config for Grubhub was simply never executing the JS
  that populates results, so it was destined to find nothing regardless of query.
- Did not chase a Scrapfly `wait_for_selector`/longer-wait tune blindly (that's exactly
  the guess-and-check Kyle asked to stop doing) — Grubhub needs either careful Scrapfly
  wait tuning or, more consistent with the DoorDash pattern, Camoufox in the crawler
  (Grubhub needs zero anti-bot bypass, so Camoufox there should be simpler than
  DoorDash's case, not harder). Deferred to the crawler alongside DoorDash rather than
  spending more Scrapfly credits guessing on the live path.

## Benchmark harness bug: NDJSON stream broke `res.json()`, made "0/25 magic-capable" a false reading (July 2026)

`/api/dishes` was converted to stream newline-delimited JSON (one line on a corpus-fresh
hit, two lines — pre-labeled/raw then final Gemini-labeled — on a cache miss) in the
"Stream first photos before Gemini completes" change, but `scripts/benchmark.mjs`'s
`fetchJson` still called `res.json()` on the raw body. `JSON.parse` throws on multi-line
NDJSON; the throw was swallowed by `fetchJson`'s catch block, silently returning
`json: null` for every restaurant that took the two-line cache-miss path (i.e. almost
all of them on a cache-busted benchmark run). Result: a scoreboard run that logged
`photos=0 matched=0` across all 25 restaurants and "Magic-capable: 0/25" — not a real
regression, a broken harness silently returning nothing.

Also found and fixed a second bug in the same script: the "magic-capable" formula was
`menu_matched_count + photo_count >= 5`, which double-counts menu-matched dishes (they're
already included in `photo_count`). Corrected to count photos with a real `dishName`
(`isMenuMatch` dishes plus Gemini-identified-but-not-menu-matched dishes) — this is what
"named dish photo" actually means per `DishGallery`'s own bucketing.

Fix: added `fetchNdjson`, which reads the full response text, splits on newlines, and
`JSON.parse`s only the last non-empty line (always the final, fully-scored result
regardless of whether the restaurant took the one-line or two-line path). Re-ran after
the fix: real numbers match the pre-existing 2026-07-07 baseline's magic-capable count
(20/25 both times) with a meaningfully higher avg photos/restaurant (6.16 → 11.2),
confirming the underlying pipeline was fine — only the benchmark's own JSON parsing was
broken. Lesson: whenever a response-shape change (`res.json()` → streaming) lands, grep
every consumer of that endpoint, not just the production UI — `benchmark.mjs` was hit
because scripts don't get the same TypeScript-consumer visibility as component code.

## Two real bugs found while reviewing Kyle's first live crawler run (July 2026)

Kyle ran the national sitemap preload (663,805 store URLs cached across 102
regions — US states, Canada, Australia, NZ, Japan, Puerto Rico) and a full
BJ's crawl. Preload was clean. The BJ's crawl surfaced two genuine bugs, not
capability gaps:

**1. DoorDash sitemap URLs weren't XML-unescaped.** `loadStoreSitemap`
extracted `<loc>` content with a raw regex and returned it as-is. Sitemap XML
escapes "&" as "&amp;" — so BJ's real slug (`bj's-restaurant-&-brewhouse-...`)
came back as `bj's-restaurant-&amp;-brewhouse-...`. Discovery worked
perfectly (found the exact right store, correctly rejected the catering
sub-listing) but the crawler then fetched the literal `&amp;` URL, which
DoorDash 404s/falls through on — explaining "found via sitemap: [right URL]"
immediately followed by "0 items from [that URL]". Fixed by extracting the
XML-parsing logic into a pure `extractStoreUrlsFromSitemapXml` function that
unescapes `&amp; &lt; &gt; &quot; &apos;` before filtering, with a fixture
test reproducing the exact BJ's case. The existing sitemap-matcher tests had
baked the bug into their fixtures (asserting an `&amp;`-encoded URL as the
"correct" answer) — updated those too.

**2. Every crawler run (and every `/api/debug-sources` call) was burning a
Scrapfly credit on Grubhub for a source with a confirmed 0% success rate.**
The live pipeline (`getGooglePhotosAndReviews`, reused by both the crawler
and the live serverless path) unconditionally called the old Scrapfly-based
`fetchMenuFromGrubhub` — the exact function the July 2026 SPA-rendering
diagnosis (see above) had already proven never succeeds. The crawler's new
Camoufox-based `crawlGrubhub` was correctly added alongside it but never
replaced it, so Grubhub was being attempted twice per restaurant: once via
Scrapfly (guaranteed failure, real credit cost) and once via Camoufox (the
actual working path). Removed the Scrapfly-based Grubhub call from the live
pipeline entirely — same treatment DoorDash already got for the same reason
(cost with a proven-zero success rate). Grubhub is now corpus-only via the
crawler's Camoufox path, exactly like DoorDash. Deleted the now-fully-dead
`fetchWithAntiBot`, `fetchDeliveryStorePage`, `fetchMenuFromGrubhub`,
`fetchMenuFromDoorDash`, `fetchDoorDashDirect`, and `parseDoorDashSearchSlugs`
(the last three were already dead before this session — DoorDash's
search-based discovery was fully superseded by the sitemap approach and
nothing called them anymore). `benchmark.mjs` and `/api/debug-sources` updated
to match: Grubhub is now excluded from live-tested SOURCES the same way
DoorDash already was.

Both fixes are corpus-side (crawler + shared pipeline) — pending a fresh
crawler run to confirm real DoorDash items now come back for BJ's.
