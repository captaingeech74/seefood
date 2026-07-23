# Source Registry

This file is a decision index, not a substitute for the detailed history in
`DECISIONS.md`. The first baseline cycle must populate measured current results.

| Source family | Existing SeeFood state | DataLab status | Next evidence required |
|---|---|---|---|
| Google Places/photos | Production source with known restaurant/photo utility | Baseline required | Incremental identity/photo coverage and item-match precision |
| OpenStreetMap/Overture | Identity-layer inputs already explored/imported | Baseline required | Incremental restaurant identities and merge precision |
| DoorDash | California sitemap discovery and corpus crawler exist; substantial historical investigation is documented | Re-measure, do not reinvent | Current successful-store rate, menu/photo yield, stability, incremental coverage |
| Grubhub/Menufy | Existing source and crawler paths documented | Baseline required | Current hit rate, incremental menu/photos, source-specific failures |
| Restaurant websites/schema.org | Existing live acquisition path | Baseline required | Long-tail hit rate, freshness, management-photo yield |
| Toast/ChowNow/Popmenu/Olo and ordering providers | Partial investigations and backlog opportunity | Candidate family | Reusable-provider adapter yield across blind restaurants |
| Merchant contributions | Management tools exist | Strategic fallback | Cost and conversion needed to close comparison gaps |
| Customer contributions | Product workflow exists | Strategic moat | Upload conversion and comparison coverage generated |

Every retained source must eventually record access method, sample size,
incremental coverage, provenance, item-match quality, repeatability, cost,
failure rate, refresh path, and Keep/Revise/Reject/Quarantine decision.
