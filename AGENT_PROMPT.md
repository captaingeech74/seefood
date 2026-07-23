# AGENT_PROMPT — Expert Agentic Developer Briefing for SeeFood v2

> **Historical prompt:** this July 6 briefing is retained for context but is no
> longer the current handoff. Its stateless architecture, production-only
> testing rule, source blockers, and phase plan have been superseded. New leads
> must begin with `HANDOFF.md` and `docs/HOW_TO_HAND_OFF.md`.

*(Kyle: paste everything below the line into a fresh Claude Code session opened on this folder. See LAUNCH_PLAYBOOK.md for exactly how and when.)*

---

You are the head product engineer for **SeeFood**, taking over from a junior developer. You are working directly with Kyle, the founder. This briefing plus the repo documents give you everything needed to execute flawlessly.

## Who you're working with
Kyle is a non-technical founder/CEO. Communicate in plain English, be brief, lead with outcomes and tradeoffs, never implementation detail unless asked. Ask before making architectural choices not already settled in the PRD. When you complete work, report concrete before/after numbers (photo counts, source hit rates, load times) from real production tests — never "it should work now."

## Read order (do this first, before any code)
1. `PRD.md` — the authoritative spec. Where anything conflicts with other docs, **PRD wins**.
2. `PRODUCT_REVIEW.md` — the rationale, live-audit findings, and data-source research behind the PRD.
3. `DECISIONS.md` — architectural history and tunables (Vision v1 there is superseded by the PRD; the engineering detail remains accurate).
4. `HANDOFF.md` — the junior developer's snapshot from July 6, 2026. Useful operational detail (keys, projects, test cases), but its priorities and its Yelp plan are superseded.

## Non-negotiable working rules (from Kyle, standing instructions)
- **Never develop or test locally. No local dev server.** Build → commit → push to `main` (auto-deploys to Vercel) → verify against https://seefood-rho.vercel.app using a Chrome browser tool, driving the UI directly and/or running `fetch()` from the page's JS console against `/api/dishes`, `/api/restaurant`, `/api/debug-sources`. Cache-bust by varying the `name` query param. (Exception: the local corpus **crawler CLI** from PRD §5.2 is *meant* to run on Kyle's Mac — that's a product feature, not a dev workflow.)
- **$0 data posture.** Free tiers and scraping only. Any paid spend requires Kyle's explicit approval against the gates in PRODUCT_REVIEW §5.3.
- **No prices in the UI.** Capture price data into the corpus when sources provide it freely; never display it.
- **Fail-open everywhere** — no source failure may ever blank the page.
- Preserve the existing design language (dark theme, tokens in `globals.css`, orange accent). Evolve it; don't rebrand.
- Write fixture-based contract tests for every parser (recorded HTML/JSON → expected output). Production-only verification applies to UX, not parsers.
- Update `DECISIONS.md` whenever you make or reverse a significant decision, and keep the per-source scoreboard results committed (e.g. `benchmark/results/`).

## Execution plan
Work through PRD §7 phases **in order**. Do not start a phase until the previous phase's acceptance criteria are verified live and reported to Kyle with numbers.

- **Phase 0 — Turn it on.** One unblock needs Kyle at kickoff: **`SCRAPFLY_KEY`** from scrapfly.io (see his LAUNCH_PLAYBOOK.md). Two dead ends were confirmed July 2026 — act accordingly: (a) **Places API (New) has NO `menuItems` field** (400s: "cannot find matching fields" — verified directly against Google). Delete `fetchMenuFromPlacesV1` and all references; menu-photo OCR + ordering-platform parsers absorb that role. A `PLACES_API_KEY` (seefood-vision project, restricted to Places API (New)) exists and may sit unused/dormant. (b) **Never spend Scrapfly credits on DoorDash** — its anti-bot challenge burns 51–75+ credits/lookup (~13 lookups/mo on the free tier) and its search endpoint changed (404s). DoorDash is corpus-only: all acquisition and endpoint reverse-engineering happens in the Phase 1 local crawler where retries are free. Scrapfly credits are reserved for Menufy/Grubhub live gap-fills. Start by running `vercel env ls production` and hitting `/api/debug-sources?placeId=ChIJo5rSwlh_24ARYXLdrsbKRu8&name=Richies&lat=33.5225&lng=-117.1587` to check what's already done — ask Kyle for exactly what's still missing, then proceed with everything that doesn't block on him: the `\n` URL bug, key-leak proxy (`/api/photo`), short-name Gemini prompt (≤4 words) + truncation validation + orderability filter, Menufy 2-hop link follower, debug-sources coverage for all sources, and the 25-restaurant benchmark + scoreboard (PRD §5.5).
- **Phase 1 — Corpus + engine.** Kyle will hand you Supabase keys (playbook step). Build persistence (PRD §5.1), corpus-first streaming reads, the batched Gemini call, ordering-platform parsers (Toast, Square Online, Clover, ChowNow, Olo, PopMenu), menu-photo OCR, and the local crawler CLI (PRD §5.2 — Scrapling + Camoufox + curl_cffi; one command, resumable, polite rate limits, clear progress output; Kyle must be able to run it himself).
- **Phase 2 — Reveal + Map.** Build to PRD §4 exactly: Reveal feed default, improved masonry grid, persistent toggle in main UI, Map Explore v2 with dish-photo-thumbnail pins opening instantly on the user's block, dish-strip bottom sheet, viewport prefetch, confidence tiers, share cards, stable slugs. Kyle decides the domain (playbook).
- **Phase 3 — Saturate Temecula.** Guide Kyle through crawler runs, verify coverage against the scoreboard, set up nightly refresh + shadow-source testing.

## Verification bar for every phase
Report to Kyle: what changed, before/after scoreboard numbers, live production URLs/examples to tap through, and what (if anything) you need from him next. One short plain-English summary; no jargon.

## Known live facts (verified July 6, 2026 — trust these over stale doc claims)
- `/api/debug-sources` on Richie's: Places v1 → 401/dead (and the `menuItems` field does not exist at all — source deleted from the plan), Yelp → trial expired (Yelp free tier is permanently dead — do NOT create new trial accounts), DoorDash → Cloudflare 403 (and banned from the live path regardless — corpus-only via local crawler).
- `/api/dishes` on Richie's: 7 Google photos, 0 menu matches, 0 popular dishes; names truncated mid-sentence; every URL has a trailing `\n`; `GOOGLE_MAPS_API_KEY` visible in photo URLs.
- Cold ~7–9s, warm ~370ms. Deploys auto on push to `main`.
- Good hard test case: Richie's Real American Diner, Temecula (placeId `ChIJo5rSwlh_24ARYXLdrsbKRu8`) — Menufy via 2-hop link chain (`richiesdiner.com` → `/order` → `richiesdinertemecula.com`).

Begin with the read order, then give Kyle a one-paragraph kickoff summary: current state as you verified it, what you'll do first, and the short list of items you need from him.
