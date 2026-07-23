# How to Hand Off SeeFood

This is the reusable protocol for transferring general-development ownership to
a fresh senior Codex lead. It describes the process, not the current project
state. Current state belongs in `HANDOFF.md`.

## When a Handoff Helps

Hand off when a fresh lead will materially improve the work: the current thread
has accumulated substantial history, the next assignment is systemic or
cross-cutting, or a clean independent diagnosis is valuable. Do not hand off
merely because time passed or because a new task began. Continuity is often
better for a narrow follow-up.

Only one thread should own general production development at a time. DataLab is
a separate research role and does not count as the general lead.

## Model And Effort

- Use GPT-5.6 Sol at medium effort for routine, well-bounded implementation.
- Use GPT-5.6 Sol at high effort for the first task after a handoff and for
  systemic data, architecture, debugging, migration, or broad UX work.
- Do not keep extra-high effort as the default. Escalate it only when repeated
  high-effort investigation leaves a genuinely difficult problem unresolved.

Model choice is less important than a verified state snapshot, a clear first
assignment, and an explicit completion bar.

## Prepare The Repository

1. Inspect `git status`, the current branch, recent commits, and the production
   deployment state.
2. Resolve or clearly identify any active work. Never silently discard user or
   agent changes.
3. Run the verification appropriate to the current state. Record known failures
   rather than presenting assumptions as facts.
4. Update `HANDOFF.md` in place with the current commit, architecture, product
   surfaces, known blockers, safety boundaries, and the next task verbatim.
5. Add durable decisions to `DECISIONS.md`; link to focused documents instead of
   copying their full contents into the handoff.
6. Commit and push the documentation so the fresh lead receives the same truth
   locally and on GitHub.

Never put secrets, credentials, raw environment values, or the full chat history
in a handoff. The goal is an accurate map, not a transcript.

## Source Of Truth

Use this order when claims conflict:

1. Current code, schema, and tests.
2. Reproduced production behavior.
3. `HANDOFF.md`.
4. The newest relevant entry in `DECISIONS.md`.
5. Focused documents under `docs/`.
6. Historical PRDs, reviews, and old conversation summaries.

The fresh lead should verify important claims rather than merely trusting the
outgoing lead's prose.

## Start The New Lead

Create a new Codex task in the normal local project checkout and give it:

- The repository path and production URL.
- Instructions to read `HANDOFF.md`, `DECISIONS.md`, this protocol, relevant
  focused documents, and the code before editing.
- The user's first assignment verbatim.
- The expected diagnostic and verification bar.
- Explicit ownership of general development from that point forward.
- Any isolated worktree or automation it must not disturb.

Use a separate worktree only for genuinely parallel, isolated work. The active
general lead should normally use the main checkout because it owns integration
and production delivery.

## Verify The Transfer

The outgoing lead verifies that the new task exists, has the intended model and
effort, and can see the repository. The new lead should begin by confirming the
branch and worktree state, reading the authoritative documents, and reproducing
the first issue before editing.

The outgoing lead then stops making production changes. It remains useful for
historical questions, but conflicting dual ownership defeats the purpose of the
handoff.

## Complete Or Reverse

A handoff is complete when the fresh lead can state the current system, the
first task, the risks, and the completion bar without relying on hidden chat
context. If the task was created with incorrect context, fix the prompt or
restart it before development proceeds. Do not compensate for a bad handoff by
letting two leads edit production simultaneously.
