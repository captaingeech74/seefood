# Experiment: DL-GOV-001 Access Opportunity Charter

## Decision Target

Should the DataLab discard a technically promising source when SeeFood lacks a
presently authorized or standard access path?

## Hypothesis

Separating technical value from access posture will retain more potentially
transformative sources and produce concrete permission or deal paths without
weakening the lab's execution safety boundary.

## Safety

This was a governance-only revision. No production read or write, deployment,
paid service, quota, source access, vendor contact, credential use, image
download, or crawl occurred.

## Cohort

The DataLab charter, agent rules, source registry, experiment queue, benchmark
specification, acquisition map, Gemini handoff, and control templates.

## Method

1. Locate language that treated current access eligibility as a source-value
   filter.
2. Separate technical value, current access posture, and access action.
3. Add permission-gated opportunity and deal-brief outputs.
4. Preserve the prohibition on unauthorized access, evasion, credential misuse,
   paid commitments, production changes, and unbounded collection.
5. Revise the Gemini prompt so it searches for both safe-now paths and
   restricted high-value opportunities.

## Baseline

The prior prompt asked for lawful, repeatable paths and rejected ideas that
lacked them. That was safe for execution but could hide valuable partner-only,
licensed, custom-permission, or bespoke-deal opportunities before their
technical value was evaluated.

## Result

The lab now records:

- a High/Medium/Low/Unknown technical-value rating;
- a distinct current access posture;
- a Test now/Pursue permission/Pursue commercial deal/Monitor/Do not pursue
  access action; and
- a structured deal brief for high-value permission-gated sources.

The Gemini prompt explicitly searches restricted-but-high-value source
families, asks for permission-gated validation plans, and requires five
human-to-human deal briefs. It still forbids unauthorized access or bypass
instructions.

Incremental restaurants, menus, matched photos, comparison dishes, and verified
coverage: zero. This cycle improved opportunity discovery, not data coverage.
Runtime was local review time. Money and paid quota: $0.

## Independent Verification

This governance change does not implement or evaluate a connector. Its effect
will be falsifiable when the Gemini result is reviewed: it should identify
evidenced high-value opportunities that the prior eligibility filter would
have rejected, while keeping them clearly outside measured coverage.

## Decision

**Revise.**

Retain the hard execution boundary, but never use present authorization as a
proxy for technical value.

## Access Action

**Test now** for public research and currently authorized probes. **Pursue
permission** or **Pursue a commercial deal** for strong blocked paths. Never
execute a permission-gated validation before the prerequisite is met.

## Plain-English Meaning

The lab's wings are wider: it can now find an exceptional dataset even if the
first practical step is a human conversation, custom exception, or data deal.
It still will not sneak into that dataset or pretend it already improved
SeeFood.

## Next Action

Run DL-001 as queued and have Kyle run the revised Gemini prompt. Use the
returned evidence to rank safe-now probes and negotiation-worthy opportunities
against the verified baseline.
