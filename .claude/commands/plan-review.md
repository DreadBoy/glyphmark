---
description: Draft an implementation plan for a task, harden it with the architect-reviewer, then propose it for approval.
argument-hint: <task-url-or-description>
---

Plan the work for: $ARGUMENTS

Follow this loop. **Do NOT write implementation code at any step.**

1. **Understand.** If $ARGUMENTS is a URL, fetch it (GitHub issue → `gh issue view` /
   `gh api`; else WebFetch). Read the relevant code so the plan is grounded in how this
   repo actually works.

2. **Draft a plan.** Concrete: files to touch, the approach, tradeoffs, test strategy,
   and what's out of scope.

3. **Hand off to the reviewer.** Spawn the `architect-reviewer` subagent (Agent tool,
   subagent_type: "architect-reviewer") with the task summary, the full plan, and the
   file paths it needs to inspect.

4. **Iterate until the reviewer is satisfied.** If the review calls for changes, revise
   the plan to address every point and send it back for another pass. Keep the SAME
   reviewer across rounds (SendMessage) so it remembers what it already flagged. Cap at
   4 rounds; if it's still not satisfied, stop and tell me exactly where it's stuck.

5. **Propose to me.** Only once the reviewer is satisfied, present the final plan via
   ExitPlanMode, with a one-line note on what changed across review rounds. Do not
   implement until I approve.