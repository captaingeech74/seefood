# SeeFood — Project Intelligence Document

This document exists so that any developer (human or AI) can pick up this project cold,
understand every meaningful decision, and continue building without needing to re-derive
context from the code. It is the single source of truth for *why* things are the way they are.

Update this file whenever a significant decision is made, reversed, or a variable is changed.

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
DishPhoto { id, url, dishName: string|null, source, attribution, width, height }
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

### Vision API cost
Each restaurant load = 1 batch Vision call for up to 20 images.
At Google's pricing (~$1.50/1000 images), 1000 restaurant views ≈ $30.
Portrait-first sorting reduces wasted Vision calls as portrait photos are more
likely to fail the food filter.

### Review NLP quality
The review parser works on the 5 reviews returned by Place Details API.
Google returns reviews by "relevance" (their algorithm), so highly rated/helpful
reviews surface first. We don't control which reviews we get. False positives
still occasionally slip through for restaurants with non-standard dish names.

### No caching
Every restaurant load makes fresh API calls. There's no Redis, no CDN cache, no
`unstable_cache`. Adding response caching for `placeId` → dishes would dramatically
reduce API costs and latency for popular restaurants.

### No Yelp photo Vision filtering
When/if Yelp photos are enabled, they bypass Vision filtering entirely. The Yelp
`label` field ("food", "inside", "outside", etc.) can serve as a pre-filter
instead of Vision — that's already partially scaffolded in `yelp.ts`.
