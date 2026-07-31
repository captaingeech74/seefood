# DataLab 2.0 Status

## State

**Complete — Cycles 0–4; stop before Cycle 5**

Cycle 4's deterministic 24-restaurant website sample found 9 accessible menu
surfaces, but only one structured menu: 37 unique schema.org items and no linked
dish photos. Five of the menus and all 37 items were on DoorDash-sitemap-
unmatched identities. ChowNow was the only recurring platform with structured
yield, while Toast was blocked or static-empty. See `CYCLE_4_RESULT.md`; none of
these selected results is a national rate.

## Current Decision

Implement with review the small website connector mix: one homepage, one strict
menu/order link, and schema.org/client-visible JSON parsing. Do not prioritize
website photo downloading from this evidence. ChowNow is the best observed
named connector but needs a larger sanctioned sample or agreement before a
standalone build. Continue the Cycle 3 DoorDash negotiation separately.

## Production Impact

None. This lab used no production credentials, writes, paid calls, or deploys.

## Next Report

Cycle 5 should test only the highest-value unresolved channel, then publish the
final ranked source plan and concrete production backlog. Stop here until that
cycle is authorized.
