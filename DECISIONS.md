# SeeFood — Key Product & Engineering Decisions

A living log of the choices that shaped the app and the variables to tune later.
Add a new entry whenever a significant decision is made or reversed.

---

## Photo Pipeline

### Candidate count: 20 photos per restaurant
**Decision:** Fetch up to 20 Google Places photos per restaurant.
**Rationale:** 20 gives enough variety without excessive Vision API cost. Google sorts by quality, so diminishing returns are real after ~10–12, but we want data before capping.
**Variables to tune later:**
- `CANDIDATE_LIMIT = 20` (in `google.ts`, the `.slice(0, 20)` call)
- May reduce to 10–12 once we have real-world data on how many food photos survive filtering.

### Portrait photo ordering: non-portrait first, portrait last
**Decision:** Sort the 20 candidates so non-portrait photos (width ≥ height) come first; portrait photos are appended at the end. We still include portrait photos if needed to fill the 20-photo pool.
**Rationale:** Portrait-orientation photos skew toward exterior shots, people, and menus. Including them last lets us assess their actual food-photo hit rate over time before deciding whether to drop them entirely.
**Variables to tune later:**
- Portrait threshold: currently `height > width` (strict). Could soften to `height > width * 1.15` to only exclude very tall portraits.
- Could add a hard cap on portrait photos (e.g., max 3–5) once data shows they rarely pass Vision filtering.

### Attribution badge: "Official" vs "User"
**Decision:** Every photo card shows a badge in the top-right corner.
- Owner-attributed photos → amber "Official" badge (high contrast, prominent).
- User-attributed photos → frosted dark "User" badge (subtle, low contrast).
**Rationale:** Surface the distinction visually so we can assess the food-photo hit rate of each source over time. Restaurant owners upload food photos intentionally; user photos are more mixed.
**Variables to tune later:**
- Could eventually filter out user photos entirely, or cap them (e.g., max 5 per restaurant), if data shows low value.
- Badge visibility/style can be toned down once the data collection phase is complete.

---

## Vision API

### Vision API key: Default Gemini Project (project 1035694549658)
**Decision:** Uses a separate `VISION_API_KEY` env var pointing to a personal Google Cloud project with no org restrictions.
**Rationale:** The Maps-linked project (815087896573) had org-level permission blocks that prevented enabling the Vision API without admin approval.
**Note:** Both keys live in `.env.local` (git-ignored) and as Vercel production env vars.

### Food filtering: fail-open
**Decision:** If the Vision API call errors or times out (8s), every photo passes through as `isFood: true`.
**Rationale:** Better to show a few non-food photos than to silently show zero photos to the user.

### Dish name labeling
**Decision:** Use the highest-scoring Vision label that (a) scores > 0.72, (b) is present in a food-positive photo, and (c) is not in the `SKIP_AS_DISH_NAME` generic-label blocklist.
**Variables to tune later:**
- Score threshold: `0.72` — raise to reduce false labels, lower to get more coverage.
- `SKIP_AS_DISH_NAME` set — expand if generic labels keep appearing as dish names.

---

## UX

### Map: "Search this area" pattern
**Decision:** On first map load, auto-search the current location. On subsequent pans/zooms, show a "Search this area" button rather than auto-searching.
**Rationale:** Avoids surprise API calls on every pan while still being frictionless on first open.

### Restaurant header: inline "Not here?" link
**Decision:** Replaced the "Switch ↕" button with an inline "Not here?" text link next to the address.
**Rationale:** "Switch" was ambiguous UI; "Not here?" is self-explanatory and takes less visual space.

### Loading: inline skeleton, not full-screen spinner
**Decision:** Keep the restaurant header visible while dishes load; show a skeleton grid in the photo area.
**Rationale:** Confirms to the user which restaurant they're looking at while content loads.

---

## Infrastructure

### Git tag rollback: v0.1.0
Annotated tag saved before the Vision API + map redesign work began.
To restore: `git checkout v0.1.0`

### Deployment
- Vercel project: `seefood-rho.vercel.app`
- GitHub: `captaingeech74/seefood`
- Branch: `main` → auto-deploys to Vercel on push
