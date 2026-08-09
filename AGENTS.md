# AGENTS.md - operating guide for desprawl

This file is maintained in the same change that makes it stale. If a path moves,
a command changes or a rule is reversed, fix it here too. A stale operating
guide is a bug.

Contributor conventions (branch naming, commit format, the file ownership
header, `.folderinfo`) live in [CONTRIBUTING.md](CONTRIBUTING.md) and are not
repeated here. This file covers what an agent needs beyond them: what the
product claims, and the rules that keep those claims true.

## What this is

> **Permanently unfuck large AI-touched TypeScript projects by scoping and
> delivering cleanup work.**

That sentence is also the `package.json` description, and it is a commitment
rather than a tagline. Two words in it do work:

- **Permanently** - a one-time cleanup is not permanent, because nothing stops
  the same agents re-accumulating the same mess next quarter. Permanence has to
  come from scoring the diff and failing only on *new* violations, not from the
  cleanup itself.
- **Scoping** - the buyer is a dev shop or consultancy that inherited a codebase
  their client built with AI tools and has to fix a price before it knows what
  is inside. The competitor is a senior engineer reading for a week, not
  SonarQube.

Everything below follows from the buyer being someone who quotes a number to a
third party. If we are wrong, they eat it.

## Relationship to the experimentation repo

`desprawl` **ships**. It is the npm package and the thing a user runs.

Its sibling, `../agentic-code-review` (working name Strata, private), is the
experimentation repo and **does not ship**. Ideas are proven there and carried
here. The long-form reasoning behind most rules in this file - the decision
records, the practitioner research, the incidents - lives there under
`agent-memory/` and `icp/`.

Two things follow:

- **Nothing carries over implicitly.** desprawl is a fresh implementation, not a
  port: `src/{cli,scan,history,analyze,model,view}.ts` plus a Vite UI, sharing
  no code with that repo. A rule that exists only in its `CLAUDE.md` protects
  nothing here. That is why this file exists.
- **Do not duplicate `agent-memory/` here.** The decision records are about
  ideas that apply to both repos, and two copies of a memory store diverge and
  then mislead. Link to the sibling instead. If desprawl later needs its own
  running record, that is a separate decision to make deliberately.

## Hard rules (do not violate)

These are the rules with a cost attached. Each carries its reason, because a
rule whose justification is missing is the first one relaxed under a deadline.
The bracketed numbers are the corresponding rule in the sibling repo's
`CLAUDE.md`, so the longer argument is findable.

1. **An architecture claim may only rest on a proven edge.** [4] An edge whose
   resolution is uncertain may exist in the graph for navigation and may be
   cited as evidence, where the uncertainty label warns the reader. It must
   never be aggregated into a claim about the codebase: a package dependency, a
   cycle, a layering violation. A fabricated cycle sends someone refactoring
   code that was never tangled. If you find yourself relaxing this to make a
   number look better, stop.

2. **Every finding carries its evidence.** [5] A finding without a path a reader
   can follow is not shippable, and confidence is inherited from the weakest
   link on that path rather than asserted. The reason is defensive: the loudest
   complaint about tools in this category is that the arrows mean nothing, and a
   finding that must carry its path is much harder to wield as a blunt
   instrument than a bare number. That only holds if **the path is the headline
   and the score is the footnote.**

3. **Missing edges beat wrong edges.** [6] Where resolution is not provable,
   emit nothing. Do not guess to raise a coverage percentage. A gap is a known
   unknown that a user can work around; a wrong edge is an unknown unknown that
   they cannot.

4. **An improvement claim is measured, never predicted.** [11] If a change can
   be applied and re-measured, it must be: apply it in a scratch worktree,
   rebuild, report the *observed* delta. Someone quotes fixed-price work off
   these numbers, so a predicted improvement that misses burns the exact margin
   the tool promised to protect. Projected and measured must also use different
   words in any output, and only one of them may be quoted.

   Corollary: **never emit a composite security score.** Architecture and
   maintainability grades are defensible because their ground truth is
   structural. Security has adversarial ground truth. If we say 97 and the
   client is breached, we have destroyed whoever repeated it. Security findings
   ship with evidence and without a grade.

5. **Ship as a ranker, never a gate on the score.** Gates get gamed, and the
   documented gaming stories are all about gates on ratios that padding can
   inflate, or absolute counts enforced against individuals. So:

   - never gate on a composite score, which is a ratio and therefore gameable;
   - gate only on structural facts that a diff either did or did not introduce,
     which is what makes the new-violations ratchet compatible with this rule
     rather than in tension with it;
   - always ship a suppression path that is **not itself penalised**, because
     organisations turn every dial to maximum, and the escape hatch is what
     keeps the tool from being experienced as oppression.

   Related, and the reason a composite number is never the headline: a weighted
   mean hides its worst driver. The sibling repo scored itself 97 while one
   package held 29% of its symbols. Prefer countable deltas in anything a buyer
   reads. "Twenty of these arrows are gone" is checkable; a score is not.

6. **No em-dashes.** [9] Never write the em-dash character anywhere: prose,
   commit messages, code comments, doc strings. Use a spaced hyphen `-` as a
   separator, or rewrite the sentence. House style, and cheap to hold.

## Where these bite, honestly

At this commit desprawl produces LOC, language and churn statistics: `scan.ts`
walks the tree, `history.ts` reads git, `analyze.ts` assembles a `Stats`, and
the UI renders it. There is no dependency graph and no findings yet, so rules 1,
2 and 3 currently govern code that is about to be written rather than code that
exists.

That is deliberate. These are precisely the rules that get quietly relaxed once
there is a shipping deadline and a coverage number to raise, which is why they
are written down before the code that would tempt anyone to relax them.

## Workflow

```sh
pnpm install
pnpm check      # tsc --noEmit, for the CLI and the UI
pnpm desprawl   # run the CLI against the current repo
pnpm ui         # Vite dev server for the report UI
pnpm build      # single-file UI bundle; also runs on prepack
```

Changes land as a **pull request onto `main`**, merged as a merge commit. Branch
on your fork per `CONTRIBUTING.md`. Do not push to `main` directly.

## What deliberately did not carry from the sibling repo

Listed so nobody re-imports it by reflex:

- Its repository layout, its pnpm workspace and its build-order gotcha. desprawl
  is a single package with a different shape.
- Its `agent-memory/` conventions. See the linking decision above.
- A `.folderinfo` in every folder. desprawl has a root one and no lint enforcing
  the rest, so this is not a rule here unless desprawl adopts the lint.
- Dogfooding against that repo specifically. Running desprawl on desprawl is
  still a good idea; the rule as written there names the wrong repo.
