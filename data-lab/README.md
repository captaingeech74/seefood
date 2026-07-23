# SeeFood DataLab Control Room

This directory is the durable memory and experiment ledger for the isolated
SeeFood DataLab described in `../docs/SEEFOOD_DATALAB.md`.

- `STATUS.md`: current plain-English state and latest measured baseline.
- `EXPERIMENT_QUEUE.md`: ranked hypotheses and expected value.
- `SOURCE_REGISTRY.md`: investigated sources and evidence-based decisions.
- `GEMINI_HANDOFF.md`: exact prompts/results for the manual Gemini bridge.
- `experiments/`: one committed record per completed experiment.
- `templates/EXPERIMENT.md`: required experiment format.
- `templates/WEEKLY_REPORT.md`: founder-facing update format.

Generated samples stay in ignored `raw/`, `artifacts/`, and `tmp/`.

## Runtime

- Codex task: **SeeFood DataLab**
- Thread ID: `019f913f-008b-7bc3-ae0c-5cdf65e3e139`
- Isolated branch: `codex/seefood-datalab-baseline`
- Recurring automation: `seefood-datalab-experiment-cycle`
- Cadence: one bounded cycle Monday, Wednesday, and Friday nights; a
  plain-English founder report on Saturday.

The automation is attached to the DataLab thread rather than the main SeeFood
thread. Future lead developers should inspect or update the existing automation
instead of creating a duplicate.
