# SeeFood DataLab Control Room

This directory is the durable memory and experiment ledger for the isolated
SeeFood DataLab described in `../docs/SEEFOOD_DATALAB.md`.

- `STATUS.md`: current plain-English state and latest measured baseline.
- `EXPERIMENT_QUEUE.md`: ranked hypotheses and expected value.
- `SOURCE_REGISTRY.md`: investigated sources and evidence-based decisions.
- `BENCHMARK_SPEC.md`: exact coverage definitions, cohorts, and evaluation rules.
- `ACQUISITION_MAP.md`: current identity, menu, photo, and contribution paths.
- `ACCESS_OPPORTUNITY_POLICY.md`: separates technical value from present access
  and defines permission/deal recommendations.
- `GEMINI_HANDOFF.md`: exact prompts/results for the manual Gemini bridge.
- `experiments/`: one committed record per completed experiment.
- `templates/EXPERIMENT.md`: required experiment format.
- `templates/WEEKLY_REPORT.md`: founder-facing update format.

Generated samples stay in ignored `raw/`, `artifacts/`, and `tmp/`.
