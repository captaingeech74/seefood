# DL-002 National Holdout Lock

## Decision

Stage 1 is accepted. The hidden national cohort is frozen. Stage 2 evidence is
not yet supplied or evaluated.

No selected identity, alternate identity, selection seed, or unblinding map is
committed here. The Guardian-owned clear files remain ignored and mode `0600`.
The Stage 2 exporter may receive only the public-ID hashes in the ignored hash
handoff.

## Candidate Frame

- input rows: 1,727
- input SHA-256:
  `2effa8d760019d6b6c5d6953b01c0f6c524ccab110dc09af6c57d058c887fbe0`
- eligible after Guardian normalization: 1,464
- stable-ID duplicate groups: 93
- duplicate rows removed: 258
- conflicting market groups resolved from preserved CBSA evidence: 92
- cross-ID duplicate-location rows removed: 3
- chain rows excluded for missing brand evidence: 2
- selected records with unknown hard assignments: 0

## Frozen Design

- status: 108 open/orderable; 12 confirmed closed/moved/replaced
- market: 36 top-20; 30 other top-50; 24 MSA 51–387; 18
  micropolitan; 12 noncore
- business form: 64 chain; 56 independent
- census divisions: 10 New England; 14 Middle Atlantic; 14 East North
  Central; 10 West North Central; 18 South Atlantic; 8 East South Central; 14
  West South Central; 14 Mountain; 18 Pacific
- same brand: at most two records, separated by at least 80 km
- alternates: 12 unique direct replacements, each preserving every hard rule
- optional cuisine description: 10 known groups; largest known group 20%

The Guardian accepted 56 selected independent assignments as source-evidenced
inferences. This is recorded evidence quality, not an unknown hard assignment.

## Reproducibility

- method: `guardian-mincost-flow-v1.0.0`
- executed runtime: Node `v25.8.0`
- executed implementation SHA-256:
  `6122a6a6a975aa5b5f83996ad34c5d95a353a4a444f7dff5b51f2dae4e77a6e4`
- committed portable recipe:
  `scripts/select-dl002-national-holdout.cjs`
- committed portable recipe SHA-256:
  `96e19b264d4d5c7d7286f790f167f4b89b690e54e07b92049c47db14194c675e`
- seed commitment:
  `406871c9033ed0775be7dcf29ada45b9b3f042f88cdfc85941ae56333a351c6e`

The portable recipe differs from the executed recipe only by replacing the
worktree-specific absolute root with a repository-relative root.

## Hidden Artifact Commitments

- selected manifest:
  `0242995cc465ddc64afa768ab159d5be1bfc1ce0ad1b238d3057895608578a70`
- alternate manifest:
  `01baf227896b772412d586d252ae77abe0b9d394f9a5ea1c140b9359f795bc7c`
- Stage 2 public-ID hash handoff:
  `763da6a1d5e0d0c23767eadf9e50c0a3c1fc89af2c05359bba4fd563a1994a84`
- exclusion log:
  `db499ded159deaaa54588e4866ff03b833d2d97511074f3d85e978ff0efb827b`
- review log:
  `ebbc494f30408067852385691c4ea2191221d3be16ef0c032377a64ed7ac2903`

## Stage 2 Boundary

Stage 2 must return evidence for exactly the 120 selected hashes and may use
the 12 alternate hashes only as registered one-for-one replacements. The
DataLab Lead must not inspect the clear national manifest before the Guardian's
blind evidence decisions are frozen.
