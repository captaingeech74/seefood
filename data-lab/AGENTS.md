# SeeFood DataLab Agent Rules

Read `../docs/SEEFOOD_DATALAB.md` before doing any work in this directory.

This is an isolated research lab. Never write production Supabase/R2 data,
deploy, change domains, merge or push `main`, start paid services, or run
unbounded crawls.

One cycle equals one hypothesis, one minimal test, independent evaluation, and
one Keep/Revise/Reject/Quarantine decision. Update `STATUS.md`,
`EXPERIMENT_QUEUE.md`, `SOURCE_REGISTRY.md`, and the experiment record before
ending a cycle.

Do not count raw records or unmatched restaurant photos as coverage. The north
star is strongly matched Management-versus-Customer comparison dishes.

Use `raw/`, `artifacts/`, and `tmp/` for generated data. These paths are ignored.
Never commit credentials, session data, personal data, or large downloaded
corpora.

Communicate with Kyle in plain language. The weekly report must say whether the
lab is bearing fruit, what improved, confidence, cost, next action, and what he
needs to do.
