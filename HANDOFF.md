# SeeFood Senior Lead Handoff

Updated July 23, 2026. This is the current operational snapshot for the active
general-development lead. It is intentionally concise; durable product and
architecture decisions belong in `DECISIONS.md` and the focused documents under
`docs/`.

## Product North Star

SeeFood helps a diner answer one immediate question: what does the food at this
restaurant actually look like? Its differentiator is menu-item-level visual
coverage and the ability to compare photos shared by Management with photos
shared by Customers. Customer photos contributed through SeeFood remain in the
Customer category and receive distinctive SeeFood attribution.

Temecula is the proof market. The rollout then expands through San Diego metro,
San Diego County, Los Angeles, other major California metros, the 50 largest US
MSAs, and finally all 387 MSAs.

## Current State

- Production: <https://seefood-rho.vercel.app>
- Repository: `/Users/ace/Documents/New project/seefood`
- Production branch: `main`; a push to `main` triggers Vercel deployment.
- Snapshot commit when this handoff was refreshed: `bfec4de`.
- Stack: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase
  Postgres, Cloudflare R2, Google Maps, Sharp, and Vitest.
- Verification baseline: 42 tests passing before this handoff.
- Image bytes are stored in R2 and delivered by signed R2 redirects instead of
  streaming through Vercel. A custom R2 domain remains the intended end state.
- The corpus is persistent. It contains restaurant identity, menu, photo,
  provenance, acquisition, analytics, member, merchant, and management data.
  Do not treat this as the old stateless prototype.

## Read Order

1. `HANDOFF.md` for the live state and immediate assignment.
2. `DECISIONS.md` for authoritative product and architecture decisions.
3. The code and tests for actual current behavior.
4. Focused documents relevant to the task:
   - `docs/METRO_ROLLOUT.md`
   - `docs/MANAGEMENT_MENU_TOOLS.md`
   - `docs/CUSTOMER_INSIGHTS.md`
   - `docs/OWNER_DINER_BRIDGE.md`
   - `docs/DATA_ACQUISITION_BACKLOG.md`
   - `docs/INFRASTRUCTURE_OPTIONS_2026.md`
   - `docs/SEEFOOD_DATALAB.md`
5. `PRD.md` and `PRODUCT_REVIEW.md` for product framing and historical intent.

When documents disagree, prefer current code and tests, then this snapshot,
then the newest entry in `DECISIONS.md`. Treat older narrative documents as
history rather than runtime truth.

## Architecture Map

- Product routes and APIs: `src/app/`
- User-facing and management UI: `src/components/`
- Data, acquisition, image, geography, and analytics logic: `src/lib/`
- Acquisition and maintenance jobs: `scripts/` and `src/crawler/`
- Database migrations: `db/migrations/`
- Tests: `src/lib/__tests__/`
- Benchmark fixtures and results: `benchmark/`

Important product surfaces include the restaurant grid and reveal, the food map,
My SeeFood, Hookups, Management, Management Menu Tools, Customer Insights, and
the V1/V2 coverage dashboards.

The acquisition system combines multiple sources while retaining provenance.
Restaurant identity, menu-item identity, photo identity, photo attribution, and
menu-photo matching are separate concerns. Google and other sources remain
useful; no source should silently overwrite another source's evidence.

## Working Rules

- Inspect the worktree before editing. Preserve user changes and unrelated work.
- Before a major production change, create and push an appropriately named
  rollback tag or otherwise record an exact rollback commit.
- Never expose secrets or copy environment values into documentation or chat.
- Protect production data. Diagnose first, keep mutations scoped, and make
  cleanup operations idempotent and auditable.
- Keep fixes close to the responsible layer. Avoid hiding corrupt corpus data
  only in the UI unless presentation grouping is the correct product behavior.
- Run `npm test`, `npx tsc --noEmit`, and `npm run build` for meaningful changes.
  Verify affected flows in a browser at phone and desktop widths.
- Push to `main`, confirm the Vercel deployment is Ready, and spot-check
  production when the user asks to build or deploy.
- Explain outcomes to Kyle in plain language, including what changed, why it
  mattered, and any remaining limitation.

## Known Boundaries

- Management dashboards, Hookups, and some owner flows currently contain
  browser-persisted sample behavior for product validation. Do not mistake all
  visible UI for fully authenticated, server-backed account infrastructure.
- Management menu-page extraction depends on Gemini. The prepaid Gemini balance
  was depleted at the last check; the API now returns a clear 503 and the
  workflow retains a manual fallback. Do not obscure this as a generic failure.
- Authentication, verified merchant access, billing, and real promotion
  delivery/redemption still require production layers beyond the current sample.
- R2 custom-domain configuration is planned but not yet complete.

## Separate DataLab

SeeFood DataLab is a bounded research project in its own Codex thread, branch,
and worktree. It may inspect the system but may not write production data,
deploy, alter infrastructure, push or merge `main`, start paid services, or run
unbounded crawls. Its findings become production work only after the main lead
reviews and deliberately integrates them. See `docs/SEEFOOD_DATALAB.md`.

Do not perform the general-development assignment in the DataLab worktree, and
do not redirect the main build around an unfinished DataLab experiment.

## Immediate Assignment

The user's first task for the new senior lead is:

> I just did some light QA, and I noticed that if you go to the Olive Garden on
> Overland Drive in Temecula, there's a ton of duplicate photos. Can you
> diagnose why this is the case? I expect it's impacting lots of our
> restaurants. Fix it and then explain the results to me and tell me how that
> affected our data strength.

Treat this as a systemic data-quality investigation, not a one-restaurant visual
patch.

1. Reproduce the Olive Garden issue and record a before-state.
2. Distinguish exact duplicate records, repeated origin URLs, identical bytes at
   different URLs or sizes, cross-source copies, one photo attached to multiple
   menu items, chain/template reuse, and legitimate near-duplicate photos.
3. Trace every duplication class through acquisition, normalization, storage,
   matching, read APIs, and presentation.
4. Sample other Temecula restaurants and at least one chain to establish blast
   radius before choosing the fix.
5. Preserve legitimate separate photos, source attribution, and menu matches.
   Prefer durable ingest/storage identity controls plus a safe cleanup path;
   use UI grouping only where it represents the intended product.
6. Make cleanup idempotent, scoped, logged, and reversible. Create a rollback
   point before changing production data.
7. Measure before and after: total photo records, genuinely unique photos,
   affected restaurants and menu items, useful menu-photo coverage, comparison
   coverage, duplicate inflation removed, and any legitimate coverage lost.
8. Add focused tests, run the full verification bar, deploy, and verify the
   actual Olive Garden production experience.
9. Report the result in nontechnical language and state honestly whether
   SeeFood's real data strength rose, stayed level while its metrics became more
   truthful, or both.

## Handoff Maintenance

Follow `docs/HOW_TO_HAND_OFF.md` for the next lead transition. Update this file
in place; do not accumulate competing handoff snapshots.
