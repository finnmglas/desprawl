# Changelog

> ✨ AI generated release log

Notable changes per release. Dates are the day the tag shipped.

## [Unreleased]

### Added

- **Dart and Flutter are read like any other language**: imports resolve through `package:` names off every `pubspec.yaml`, declarations and calls land in the graph, and `http`, `dio` and shelf's router are told apart the way every other language's two sides are. A flutter app in a folder of repos now draws its red edge into the backend it calls.
- `pubspec.yaml` is a manifest: name, version, dependencies and overrides, with pub.dev as the registry a chip links to and the ecosystem its advisories are asked for under. Flutter, Bloc, Provider, Riverpod, dio and flutter_test each land in the bucket their npm counterpart uses.

### Fixed

- **A flutter repo read as "language none, Kotlin"**, naming the android shell over the hundred thousand lines of dart beside it. Dart counts as a language a repo can be written in now.

## [0.6.0] - 2026-08-19

The api graph, a picture you can read at module grain, and a folder of repos read as one.

### Added

- **The api graph**: every endpoint a repo serves matched to every http call site that reaches it, drawn in red as the one edge that crosses a repo, so a folder of repos shows its frontend reaching into its backend. Endpoints come off routers, their prefixes and file based routes across sixteen frameworks; call sites off fetch, axios, requests, httpx, retrofit, okhttp, reqwest and the repo's own wrappers. `desprawl api` prints both sides.
- OpenAPI, Swagger and `.proto` files are read as endpoints, Bruno, Postman and `.http` collections as call sites. A spec also says which hosts the fleet answers on, which is how an internal call is told from a call to OpenAI.
- **Module grain draws modules as boxes**, each carrying its name, size and shape, and it is what the graph opens on.
- **A line is something you can open**: hovering one names both ends and says what it carries, clicking one lists the imports, calls and requests on it and every path along it. A line is now reachable on 22% of the picture rather than 2%.
- **A folder of repos is read as a set.** The picker in the header ticks which repos the page is about, every panel follows it, and picking filters what was already read rather than reading again: unticking one of five went from twelve seconds to three.
- **The picture is laid out to be read, not to be tall.** Each repo gets a lane sized from its own content and the lanes pack into rows, ordered so nothing that calls out is drawn above or right of something that answers.
- **Library exports**: `import { analyze, build, calls, cycles, fold, knowledge } from "desprawl"`, with types. One entry point, everything else internal.
- **Panel search** finds any panel across every tab by what it is called and what it holds.
- Hourly timeline for windows of a month or less, file view for any file in the tree, and a per-tab panel layout you can drag, reorder and hide, saved between runs.
- Avatars resolved once are cached in `~/.config/desprawl/faces.json`, and names are merged by email.

### Changed

- **Three tabs**: Overview, Graph, Tasks. History, Files, Modules and Execution became panels. Old links still land where they meant to.
- **Tables are windowed** past 60 rows, with frozen column widths and the total pinned to the floor of the scroll.
- **Every `--json` is an envelope**: `{ desprawl, kind, repo, made, data }`, and every payload that can be written to a file names the desprawl and the repo behind it. `--limit` and the error shape are the same across all views now.
- **The repo is laid out in folders** rather than three piles, every declaration over 300 lines and every file over 700 split behind it, so desprawl reports no size, shape or cycle work on itself. The published api is unchanged.
- Exports moved into one dialog, and controls sit on the panel they change.

### Fixed

- **Python bodies ended at their first line**, so two thirds of the call graph was attributed to a file's top level. On a django backend that took call coverage from 72% to 92%.
- **C and C++ saw only definitions in the first column**, missing every method in a class and every prototype in a header: coverage on an arduino firmware went from 22% to 68%.
- **A jvm wildcard import named nothing**, and PHP single quotes were read as character literals, erasing half the strings in a php file.
- **An `export { a, b }` swallowed the next import**, so everything called through it read as unresolved.
- **Every tailwind class list read as repeated text**: 238 of 287 findings on one frontend were className attributes. What is left is real copy.
- **`--anon` did not anonymise.** It left the per-identity list beside the blanked one, and only ran when a page was being written. Every address, remote url and merge-subject account is out now, on every path a payload leaves by.
- **A folder of repos answered with the first repo's numbers** for the timeline, commits, tests and size, and returned a 500 for dependencies and history. Each of those reads every repo now, and a folder claims no name, version or licence of its own.
- **A small repo in a folder collapsed to one module**, since grouping balanced it against the fleet's weight rather than its own.
- **A crate was called `npm:tokio`.** Packages are named for the registry they publish in, read off the language asking.
- **A repo past thirty thousand files ran out of heap** building its call graph. The linux kernel now reads as 1.4m declarations and 3.9m calls, and a windowed table's first paint on 150k declarations went from 30 seconds to under one.
- **The exporters lied about what a table held**: numbers coerced out of text (`1.10` shipped as `1.1`), invalid TOML for backslashes and newlines, tabs shifting every column after them, and no guard on a cell a spreadsheet would run.
- **The knowledge graph said one thing three ways.** One word now: the grain is `declaration`, a thing's `kind` is `module`, `file`, `declaration` or `package`. `--grain function` still works.

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

[0.6.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.6.0
[0.5.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.5.0
[0.4.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.4.0
[0.3.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.3.0
[0.2.1]: https://github.com/finnmglas/desprawl/releases/tag/v0.2.1
[0.2.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.2.0
[0.1.0]: https://github.com/finnmglas/desprawl/releases/tag/v0.1.0
