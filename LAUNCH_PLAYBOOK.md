# LAUNCH_PLAYBOOK — Kyle's Step-by-Step
*Everything YOU do, in order. The agent does the rest. ~45 minutes of your time spread across the phases.*

---

## Step 1 — Unlock the data feeds (do these first, ~20 min total)

**1a. Google — Places API (New) key — ✅ DONE (Plan B, July 2026)**
seefood-map was unreachable, so a new API key was created on **seefood-vision** (where Places API (New) is already enabled, billing active), restricted to Places API (New) only. Keep that key handy — give it to the agent at kickoff when it asks; it goes into Vercel as `PLACES_API_KEY`.

**1b. Scrapfly — free key (5 min)**
1. Sign up free at **scrapfly.io** (no credit card; 1,000 calls/month).
2. Copy your API key from the dashboard.
3. Keep it handy — the agent will ask for it and add it to Vercel for you.

**1c. Supabase — free database (10 min, needed at Phase 1)**
1. Sign up at **supabase.com** → New project (any name, e.g. "seefood"; pick a strong DB password and save it).
2. When the agent asks, give it: Project URL and the two API keys (Settings → API → `anon` key and `service_role` key). Paste them into the Claude Code chat when requested.
3. (Database only — text data. It's plenty: 500MB holds tens of thousands of restaurants. Photos live elsewhere → 1f.)

**1f. Cloudflare R2 — free image storage (10 min, needed at Phase 1)**
1. Sign up free at **cloudflare.com** → in the dashboard, choose **R2 Object Storage** → add R2 to your account (asks for a card or PayPal for overage verification; free tier is 10GB + unlimited serving, $0).
2. Create a bucket named `seefood-photos`.
3. When the agent asks, give it: Account ID + an R2 API token (R2 → Manage API Tokens → Create; Object Read & Write). It handles the rest.

**1d. Skip Yelp.** Do not create any new Yelp accounts. (Free tier is permanently gone; new-trial workarounds are a dead end.)

**1e. Domain (optional, ~$15/yr, needed by Phase 2)**
Buy `seefood.app` or similar at a registrar (Namecheap/Porkbun). Tell the agent when you have it; it will wire it to Vercel and walk you through the two DNS entries.

---

## Step 2 — Start the agent (5 min)

1. Open the **Claude desktop app → Code tab** → open folder `~/Desktop/development/seefood`.
2. Model: **latest Sonnet** (agreed — right choice for a well-specified plan; if it ever gets stuck in a deep debugging loop, switch that session to Opus).
3. Paste the entire contents of **`AGENT_PROMPT.md`** (everything below its divider line) as your first message.
4. The agent will read the docs, verify live state, then give you a kickoff summary plus a short list of what it needs (your Scrapfly key, confirmation of 1a).

**What to hand over, when — the whole schedule:**

| When | You give the agent |
|---|---|
| Session start | AGENT_PROMPT.md contents (it reads PRD/REVIEW/etc. from the repo itself) |
| Phase 0, when asked | New Places key (1a) · Scrapfly key (1b) |
| Phase 1, when asked | Supabase URL + keys (1c) |
| Phase 2, when asked | Domain name (1e) |
| Phase 3 | Nothing — you run the crawler (Step 4) and walk-test (Step 5) |

New/fresh session later? Just say: *"Read AGENT_PROMPT.md and continue from where the last session left off."*

---

## Step 3 — Supervise (ongoing, minutes per phase)

- The agent must **end every phase with plain-English results + before/after numbers + live links to tap**. If it reports "should work," reply: "Show me live production numbers."
- Approve phases one at a time. Don't let it start the next phase until you've tapped through the current one on your phone.
- Any request to spend money must cite the specific gate in PRODUCT_REVIEW §5.3. Default answer is no.

---

## Step 4 — Run the crawler (Phase 1+, ~1 command)

The agent will build a one-command crawler that runs on this Mac (your home internet connection is the superpower — it gets past blocks that stop cloud servers).
1. When the agent says it's ready, it will give you the exact command (something like `npm run crawl -- --zone temecula`) — run it in Terminal from the seefood folder.
2. Keep the Mac awake while it runs (the agent will include a keep-awake wrapper). Expect a few hours for all of Temecula; it's safe to interrupt and resume.
3. Re-run weekly, or when the agent asks. That's the whole data operation.

---

## Step 5 — The walk test (Phase 2 done = your acceptance test)

Drive to 5 Temecula restaurants (include Richie's). At each: open the app cold. Pass = your restaurant auto-detected and dishes on screen in ~1 second, names look like menu items (not AI essays), map shows food-photo pins on your block, and sharing a dish to iMessage looks great. Anything that fails, tell the agent exactly what you saw.

---

## Quick reference — what got decided (so you can hold the line)
- No prices in the UI (capture silently for later, never show).
- Reveal feed is the default; grid stays, one tap away, in the main UI.
- Map explore is a first-class surface with dish-photo pins — not just a switcher.
- $0 data stack: local Mac crawler (unlimited) + Scrapfly free tier (live gaps) + Google free SKUs + restaurant websites/ordering platforms + menu-photo OCR. Scrapfly re-verified as best in its class; the Mac crawler is the 1000x lever.
- Yelp is dead to us. Temecula is the launch zone. The corpus is forever — nothing gets thrown away anymore.
