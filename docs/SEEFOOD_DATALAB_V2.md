# SeeFood DataLab 2.0

## Mission

Find the fastest practical data enhancements that make SeeFood's national
restaurant, menu, and dish-photo corpus materially stronger. Produce a short
ranked list of **Implement now**, **Implement with review**, **Negotiate**, and
**Drop** opportunities. For negotiation items, state the exact agreement needed.

Data acquisition is the mission. Documentation and governance support that
mission; they are not the product.

## Simplest National Strategy

Build one SeeFood-owned restaurant identity graph, not one-source dependency.
Quickly compare three operating models: a broad open roster as the seed, a
commercial roster as the seed, and a deliberately minimal combination of
complementary sources. Select the simplest model that materially improves
coverage, freshness, useful fields, and correction ability at acceptable cost.
No external roster is presumed to be authoritative; Overture is only one
starting candidate.

An external source earns and retains a role only when it makes high-confidence
improvements:

1. add a missing restaurant;
2. correct, merge, move, or close an existing restaurant;
3. add a website or provider identity;
4. acquire a current menu;
5. acquire useful item-linked food photos.

Do not build a county-by-county system. Ghost-kitchen classification, opening
date, cuisine balancing, food-truck quotas, and demographic quota perfection
are optional and may not block useful work.

## How 2.0 Works

The Lead runs short acquisition cycles in a shadow dataset. Each cycle fetches
or processes real source data, measures incremental value against the current
backbone, and ends with a decision. A one-page result is enough.

Measure incremental valid restaurants, corrections and closures, websites and
provider IDs, current menus, useful item-linked photos, identity/item-link
error rates from sensible spot checks, overlap, refresh behavior, runtime, and
likely cost.

Technical value and production readiness are separate scores. Publicly
observable data may be tested in the isolated lab even when production use may
later require permission or an agreement. Never describe technically acquired
data as production-ready until access, rights, reliability, and cost have been
reviewed.

## Aggressive but Simple Boundaries

DataLab 2.0 may use ordinary HTTP clients, public pages, rendered browsers,
structured data, sitemaps, public datasets, Common Crawl, restaurant websites,
and public ordering pages. It may build bounded collectors and a local shadow
database.

It must not bypass authentication, defeat CAPTCHAs, evade rate limits or blocks,
impersonate users, obtain private/customer data, or exploit a system. A blocked
source is evidence about practicality, not an invitation to circumvent it.

## Isolation From Production

DataLab 2.0 operates only in its own Codex thread, branch, and worktree. It may
not write production Supabase or R2 data, deploy Vercel, change production
infrastructure, push or merge `main`, edit DataLab 1.0, or install production
automation. It receives no production credentials. Any comparison with
production uses a sanitized read-only export prepared by the main lead.

Raw source material and shadow data stay ignored inside the 2.0 worktree. Only
small sanitized fixtures, collectors, measurements, and recommendations are
committed. Production integration is a later main-thread decision with normal
tests, rollback, and monitoring.

## Initial Program and Finish Line

1. Compare a few plausible national roster strategies and choose the simplest
   effective source combination for one internal identity graph.
2. Evaluate that strategy on a practical national sample spanning chains, independents,
   metros, smaller communities, and multiple regions.
3. Test enrichment for websites, provider identities, closures, and omissions.
4. Measure national DoorDash menu/photo yield.
5. Measure restaurant-website and ordering-platform menu/photo yield.
6. Test one or two genuinely promising channels revealed by the data.

Within six major cycles, DataLab 2.0 must deliver an implementation-ranked
source plan and at least one working lab connector or backbone enhancement. It
may stop earlier if the answer is clear. It must not continue merely to improve
documentation or eliminate every uncertainty.

A recommendation needs real incremental results, a reproducible collector or
method, a basic error audit, a cost/refresh estimate, and known failure modes.
Automated production publishing should target at least 99% restaurant identity
precision and 95% item linkage precision; lower-confidence data may be retained
for quarantine or review rather than discarded.
