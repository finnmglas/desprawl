# Changelog

> ✨ AI generated release log

Notable changes per release. Dates are the day the tag shipped.

## Unreleased

### Added

- **Panel search.** One box beside the tabs finds any panel across every tab by what it is called and what it holds, so `licences`, `dead code` and `who wrote` all land. Matches render as a flat list, tabs come back on clear.
- **Library exports.** `import { analyze, build, calls, cycles, fold, knowledge } from "desprawl"`, with types. One entry point, everything else internal.
- **Hourly timeline.** A window of a month or less can be read by the hour, every series off one live `git log --numstat`, so nothing in it is windowed differently from anything beside it.
- **Show rows setting.** Every table holds 5, 10, 10 scrolled or all of them, and never stands shorter than the height it was asked for.
- **Machine wide avatar cache.** Faces resolved once are kept in `~/.config/desprawl/faces.json`, so a second repo does not spend the same sixty GitHub calls an hour.
- **File view** for any file in the tree, and a copy button on the path beside it.
- **Panel layout is yours.** Drag, reorder and hide any panel, per tab, saved between runs.
- **Names merged by email**, so one person committing under two addresses reads as one.

### Changed

- **Three tabs**: Overview, Graph, Tasks. History, Files, Modules and Execution became panels. Old links still land where they meant to.
- **Tables are windowed.** Past 60 rows only what is on screen is built, with the total row pinned to the floor of the scroll.
- **Column widths are frozen** on the first paint, so scrolling a windowed table no longer resizes its columns.
- Exports moved out of the ellipsis menu into one dialog; theme moved into it.
- Timeline offers only the grains its span can draw, and lands on the nearest one it can carry when a zoom outgrows the current one.
- Controls sit on the panel they change rather than above panels they do not.

### Fixed

- A windowed table drew every row on its first paint to learn a row height. On a repo of 150k declarations that was 30 seconds; it is now under a second.
- Rails, headers and pinned totals never stuck, because the table's own overflow box was swallowing them.
- Panels the repo has nothing for no longer count as search results.

## [0.5.0] - 2026-08-13

Ten languages in one graph, the tabs in the terminal, agent runs watched live.

### Added

- **Ten languages in one import graph**: TypeScript, Rust, Python, Java/Kotlin/Scala, Go, Swift, C#, Ruby, PHP, C/C++. Each resolved its own way, each readable alone, and a mixed repo is one picture.
- Strings and comments scrubbed per language before anything is read, so a quoted path is not an import.
- **Nine named CLI views**: tasks, architecture, modules, execution, deps, stack, sprawl, history, knowledge. Every one takes `--json`.
- `desprawl sprawl` names repeated literals, copied blocks and files that are mostly comment.
- `desprawl knowledge` writes the repo as things and links, at module, file or function grain.
- **Agent runs stream into the panel**: what it did, what failed, what it cost. Every agent binary on PATH is its own entry with its own config.
- Fix buttons hand a finding straight to the agent, repo in hand.

### Fixed

- Bot author detection lost every commit after the first to a stray newline, so AI-signed counts read near zero.
- A tsconfig path without a star matched by prefix: `react` captured `react-dom`.
- Go read `return "hello"` as an import, and Python `'strings'` leaked their contents as code.
- `[dependencies.serde]` never reached the table, and `requests[socks]>=2` broke on its own brackets.
- Advisories for uninstalled packages were fetched, then dropped on the way to the row.
- A missing pnpm killed the whole server, and `desprawl view` printed the report instead of opening one.
- One person committing seven days of a week read as seven devs.

## [0.4.0] - 2026-08-11

Cycles read off the files, licences and advisories, tests and actions, and a way out of every panel.

### Added

- **Real import cycles**, read off the files rather than off folders. On vscode: 142 rings over 1,096 files, every one invisible at top-folder grain.
- **Dependencies**: every package on disk rather than only the ones a manifest names, licences grouped by what they ask of the code around them, advisories from osv.dev against the installed version, and the last release date per package.
- **Tests**: files and cases counted by reading, coverage parsed from a report already on disk, and a button that runs the suite or synthesises a coverage command per runner.
- **Actions**: git and project scripts run from the interface, servers start, stream and stop.
- **Exports**: every panel as CSV, TSV, JSON, TOML, Markdown or Excel, every drawing as PNG, JPEG, WebP or SVG, and the whole report as a PDF your own browser prints.
- `--anon` drops every commit address and the avatars with it. `--out FILE` writes where told.
- Published from the repo on every push: <https://finnmglas.github.io/desprawl/>

### Changed

- The dependency grid crosses out what genuinely runs; amber reads as "not isolated" rather than "loop".

### Fixed

- desprawl could not see its own `src/graph.ts`: the bundle detector matched the regex that defines it.
- `import { type X }` counted as a runtime edge.
- A partial clone made `--numstat` refetch the history over the network, forever.
- The test suite left a temp repo per call: 18,772 of them, and /tmp out of inodes.

## [0.3.0] - 2026-08-09

Import graphs, folded into modules, and the loops between them.

### Added

- **Modules**: every import resolved to the file it names, then folded into groups. `auto` picks the folders by weight so no group holds a tenth of the repo and none is a single file.
- A group's level comes from how far its own dependencies reach, so folder nesting cannot fake it.
- Inside against outside per group, which reads each one as Module, Sprawl or Entrypoint.
- **Loops**, with the imports whose removal provably leaves nothing looping, each marked type-only or real work.
- **Dependency grid**: one canvas instead of a hairball, ordered bottom of the stack first, sortable and searchable.
- Graph resolution covers path aliases, extends, workspace packages, index files and the esm `.js` to `.ts` rewrite. Whatever cannot be resolved is reported with a reason.
- The import graph and the git log download as json.

### Changed

- A focus display mode keeps logos and language colours without the shouting.
- Tab bars scroll on a phone instead of overflowing.
- The files panel splits code, comments and blank lines, shaded by whichever you pick.

## [0.2.1] - 2026-08-08

### Changed

- `desprawl` opens the explorer. `desprawl cli` prints the terminal report, `desprawl view` kept as an alias.
- An old node or a missing git is named at startup with the command that installs it, picked from the package manager actually present.
- "not a git repository" and "no commits yet" read as sentences rather than as git's stderr.

### Fixed

- `view` no longer dies on Windows: `start` is a shell builtin, not a binary.
- Preferences go to `%APPDATA%` on Windows, `$XDG_CONFIG_HOME` elsewhere.

## [0.2.0] - 2026-08-08

### Added

- **Project metadata** read off manifests and marker files: language and strictness, package manager, pinning, frameworks, state, ui, auth, telemetry, ports, build, testing, lint, format, ci, containers. Every `package.json` in the tree, so a monorepo is read whole.
- **Assistance**: which AI coding tools left a trace, from checked-in rules and from commit trailers and bot addresses. Prose is never matched, so a commit about an assistant is not one by one.
- **A served explorer** that reanalyses on request, with settings persisted between runs.
- Drag across the time series to zoom, click a commit for its files, per-series toggles and a log scale.
- Runs on the linux kernel: 87k files, 1.4m commits, with the log reading a capped window and saying so.

## [0.1.0] - 2026-08-08

First release. No runtime dependencies. One `git log` and one `git ls-files` per run, roughly three seconds on 400k lines.

### Added

- loc, comment and blank split per language and per folder, chars and estimated tokens, and mean indentation depth.
- Commits and contributors merged by mailmap email, with renames followed. Commits, churn and last-touched per file and folder.
- `desprawl` prints the report, `--json` emits the whole thing, `desprawl view` writes one self-contained html file with an overview, a folder explorer and the commit history as a branch graph.

[0.5.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.5.0
[0.4.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.4.0
[0.3.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.3.0
[0.2.1]: https://github.com/finnmglas/desprawl/releases/tag/v0.2.1
[0.2.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.2.0
[0.1.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.1.0
