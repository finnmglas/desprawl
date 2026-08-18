# Changelog

> ✨ AI generated release log

Notable changes per release. Dates are the day the tag shipped.

## Unreleased

### Added

- **A line is something you can open.** Hovering one lights the two things it runs between and writes their names, dims everything else, and says what it carries; clicking one opens it: the imports, calls and requests on it, every path that runs along it, and both ends to open in turn. The cursor lands on a line along its whole length rather than at a handful of sampled points, widest in the middle and narrowest at the ends, where the thing it runs to is what a reader is aiming at. A dot is hovered first, then the writing on a module card, then a line, then the rest of that card: before that, a card covered every line crossing it, and a line was reachable on 2% of the picture rather than 22%. Arrows now sit halfway along a line as well as at its end, and the api ones are drawn whether anything is hovered or not.
- **The picture is laid out to be read, not to be tall.** Every repo in a folder of repos gets a lane sized from its own content rather than a share of one width, and the lanes are packed into rows: a fleet that drew as four slivers 1:5 tall now draws as four squares. Inside a lane, modules are ordered by which way they face on the wire, what answers requests on the left and what makes them on the right, and the lanes themselves are ordered the same way, so nothing that calls out is ever drawn above or right of something that answers. Anything laid out again while you watch walks to its new place rather than jumping, boxes included.
- **Module grain draws modules as boxes** rather than dots, each carrying its name, its size and its shape, and hovering one names every module it reaches. The graph opens on it, since it is the reading of the picture that is legible before you zoom.
- **The api graph.** Every endpoint a repo serves and every http call site it holds, matched up, drawn in red on the graph: the one edge that crosses a repo, so a folder of repos shows its frontend reaching into its backend. Endpoints come off the routers themselves (django includes and DRF routers, express and nest mounts, fastapi and flask prefixes, spring, jaxrs, laravel, rails, actix, axum, gin, chi, aspnet, ktor, vapor, esp, a bare node server dispatching on the path, a bun or deno route table, hapi, fastify and convex route objects, tornado, bottle and flask-restful) as well as the prefixes they hang under: a gin or echo group, a rails `namespace`, a spring or jax-rs class annotation and off file based routers (next app and pages, sveltekit, nuxt, nitro). Call sites come off fetch, axios and every renamed instance of it, requests, httpx, retrofit, refit, okhttp, ktor, reqwest, guzzle, faraday, alamofire, HttpClient, websockets, and a wrapper of the repo's own named after the verb it sends. A base url held in a name is read back out, so `${BASE}/plans` is a path and `{_BASE}/user` names its host. Two panels list both sides, and `desprawl api` prints them.
- **Documents that list endpoints are read as endpoints.** An OpenAPI or Swagger file (yaml or json, wherever it is filed), a `.proto` service, and the collections that call them: Bruno, Postman and `.http`. A spec also says which hosts the fleet answers on, which is the one honest way to tell `https://api.ours.com/v1/things` from `https://api.openai.com/v1/chat/completions`.
- **Panel search.** One box beside the tabs finds any panel across every tab by what it is called and what it holds, so `licences`, `dead code` and `who wrote` all land. Matches render as a flat list, tabs come back on clear.
- **Library exports.** `import { analyze, build, calls, cycles, fold, knowledge } from "desprawl"`, with types. One entry point, everything else internal.
- **Hourly timeline.** A window of a month or less can be read by the hour, every series off one live `git log --numstat`, so nothing in it is windowed differently from anything beside it.
- **Show rows setting.** Every table holds 5, 10, 10 scrolled or all of them, and never stands shorter than the height it was asked for.
- **Machine wide avatar cache.** Faces resolved once are kept in `~/.config/desprawl/faces.json`, so a second repo does not spend the same sixty GitHub calls an hour.
- **File view** for any file in the tree, and a copy button on the path beside it.
- **Panel layout is yours.** Drag, reorder and hide any panel, per tab, saved between runs.
- **Names merged by email**, so one person committing under two addresses reads as one.

### Changed

- **A folder of repos is read as a set, not as one of them.** The picker in the header ticks the repos the page is about, all of them to begin with, with an arrow beside each one that opens that repo on its own. Every panel follows the set. Picking is not a re-read: the graphs are filtered out of what was already read for the whole folder, and each repo's own read is held, so a set is a merge rather than a second pass. Unticking one of five went from a twelve second wait on the graph to three, and from fifteen seconds on the overview to two.

- **Three tabs**: Overview, Graph, Tasks. History, Files, Modules and Execution became panels. Old links still land where they meant to.
- **Tables are windowed.** Past 60 rows only what is on screen is built, with the total row pinned to the floor of the scroll.
- **Column widths are frozen** on the first paint, so scrolling a windowed table no longer resizes its columns.
- Exports moved out of the ellipsis menu into one dialog; theme moved into it.
- Timeline offers only the grains its span can draw, and lands on the nearest one it can carry when a zoom outgrows the current one.
- Controls sit on the panel they change rather than above panels they do not.
- **The repo is laid out in folders rather than in three piles.** `src` reads as `read`, `facts` and `serve`, `ui/lib` as `draw`, `say` and `app`, and the molecules as `graph`, `agent` and `panels`, with `cli.ts` and `index.ts` left where the package points at them. Nothing about the published api changed: the one entry point is still `desprawl` itself. Every declaration over 300 lines and every file over 700 was split behind that, so desprawl reports no size, shape or cycle work on itself.

### Fixed

- **Python bodies ended at their first line.** A `def` has no brace to match, so every python declaration spanned a line or two and two thirds of the call graph was attributed to the file's top level instead of the function holding it. Bodies now end where the indentation comes back, and a method inside a class declares a name at all. On a django backend that took call coverage from 72% to 92% and the edges from 11k to 29k.
- **C and C++ saw only definitions in the first column**, so every method inside a class and every prototype in a header was invisible, and a function shaped macro declared nothing. Call coverage on an arduino firmware went from 22% to 68%. Arduino sketches (`.ino`), CUDA and a few more C++ spellings are read as C++ now.
- **A jvm wildcard import named nothing.** `import com.app.*` dropped its star before resolution, so a package import resolved to no file at all: it now names every file in that package, the way the compiler reads it. On a kotlin launcher that trebled the import edges and took call coverage from 82% to 90%.
- **PHP single quotes were read as character literals**, so half the strings in a php file, its `require` paths among them, were erased before anything read them.
- **A graph narrower than its panel sat against the left edge**, since the picture reported the frame's width rather than what was drawn in it.
- **A drag that ended on something opened it.** Moving the picture is not clicking what happens to be under the cursor when you let go.
- **The knowledge graph said one thing three ways.** A grain called `function`, a thing of that grain called a `declaration`, and a column called `sort` in the shape and `kind`/`relation` in the rows. One word now: the grain is `declaration`, a thing's `kind` is `module`, `file`, `declaration` or `package`, and a link's `kind` is what it does. `--grain function` still works and means the same thing.
- **A crate was called `npm:tokio`.** Packages are named for the registry they are published in, read off the language that asks for them: `crates.io:tokio`, `PyPI:fastapi`, `Maven:...`, `npm:react`.
- **A thing now says what language it was read as**, so a polyglot repo's exported graph can be split back apart, and what holds what is said once, as `inside`, rather than as a `contains` link beside it.
- **A contributor has an id.** Every index in a payload, a commit's `who`, the keys of a folder's `by`, the days in `active`, names that id, and each address in `identities` carries the id of the person it was folded into, so the two lists can be read together. `Record<number, number>` is typed as what JSON actually returns.
- **`--limit` means the same thing everywhere.** It cut the payload for tasks, only the printed text for sprawl, and nothing at all for execution, which was fixed at twenty rows. It cuts all three now.
- **Errors come in one shape.** A bad token, a bad hash, a bad date, a bad script and a missing route answered as plain text while everything else answered `{ "error": … }`; a client had to sniff the content type. They are all json now.
- **The knowledge graph is in the exports dialog**, which is the one format built for something else to read, and the repeated class lists are listed apart from repeated text in `desprawl sprawl`, since the cure differs.
- `Checked`, `Count`, `Task`, `Deps`, `Dep`, `Suite`, `Run`, `Timeline`, `Hours`, `Sprawl`, `Contributor` and `Made` are exported types now, so whatever parses the cli in CI can be told what it is holding. `knowledge()` defaults to the module grain, the one the cli and the tabs already default to.
- **Nothing in a file said which desprawl wrote it.** Only `Stats` carried a version, so an `imports.json` or a `calls.json` found later was unreadable without guessing. Every payload that can end up in a file now carries `desprawl` and the `repo` it was read from: the import graph, the call graph, the api, the knowledge graph, the dependencies, the test suite, the timeline and the text sprawl. No timestamp on those, so reading the same repo twice writes the same bytes. The saved html carries all of them.
- **Every `--json` is an envelope.** `{ "desprawl", "kind", "repo", "made", "data" }`, the same shape for the whole report, for every panel and for `check`, where before each view printed a bare payload whose shape differed per view and said nothing about itself. The payload is under `data`, unchanged.
- **A static page of a folder of repos could not be written at all.** `desprawl view <folder> --static` read the folder as a single repo and stopped at "not a git repository", though the served run had read it as a fleet for months. It reads it the same way the server does now, dependencies and test suites merged across the repos in it.
- **A table exported what the screen was doing to it, not what it held.** Under the repo or row scale a count column wrote `0.0731` where the same column, same heading, same file name wrote `1790` under the absolute one. A file says what the rows hold; the scale is a way of looking at them.
- **The json and excel writers made numbers out of text.** Anything `Number()` accepted was coerced, so a version `1.10` shipped as `1.1`, `1e5` as `100000`, `0x1f` as `31`, `" 12 "` as `12` and `Infinity` as `null`. A cell is a number now only if it reads back as itself.
- **The TOML writer emitted invalid TOML** for the values it is most often handed: a backslash stayed raw and a newline sat inside a basic string, both of which stop a parser. Every control character is escaped now.
- **A tab or a newline broke the paste.** The clipboard writer escaped a cell only when the separator was a comma, so a tab inside a value shifted every column after it. The clipboard and the files are written by the same hand now.
- **A cell a spreadsheet would run is held back.** `=`, a function call after an `@`, and a sign that goes on to build an expression are prefixed in csv and tsv. A churn of `-1.15m` and a package called `@types/node` are text, and are left as they were.
- **A folder of repos answered with the first repo's numbers.** Everything read per repo, the timeline, the commit count, the test suite and the size over time, came from whichever repo the folder listed first and said nothing about it: a fleet of ten and a half thousand commits reported four. Dependencies, the size series and the hourly history did worse and returned a 500, since a folder holding repos is not itself a git repo. Each of those now reads every repo in the folder and adds them up, one row per person rather than one per repo, and each honours `?repo=` to narrow to one. The dependency list is the union with `direct` and `dev` folded, the size series carries each repo's last known size forward so the total is what was on disk, and the sampling stays within one repo's cost.
- **A folder claimed the first repo's stack as its own**, so its name, version, licence, manifests, dependency count and every framework badge were one repo's, and the architecture wall drew that repo's services beside all the others. A folder now claims no name, version or licence, counts what can be counted and unions the rest, and a repo's card in a fleet draws its own modules without the folder's services beside it.
- **A folder's import coverage was a different number than a repo's**: it was counted against edges plus externals rather than against the specifiers actually read, so the two could not be compared. Both count the same way now, and the graph carries the `seen` it is a share of.
- **`identities` on a folder was a copy of the folded contributor list**, so the by-email view showed the same rows as by-person. It is one row per address across the fleet: 49 addresses behind 23 people, in the one I read it against.
- **`--anon` did not anonymise.** It blanked the address on each contributor and left the unfolded per-identity list beside it, every address on it, plus the ones folded into `also`, and it only ran when a page was being written: `--json --anon` and `cli --anon` printed the lot. Every address is out now, on every path a payload leaves by, a served run included. It also drops the remote urls, which name the account a repo is hosted under, reads the repo as its folder rather than as a path down someone's home directory, and takes the account and branch out of the merge subjects git and the forges write for you. Prose a person typed is left alone, since nothing can promise to read that.
- **A table loaded straight onto its own tab overlapped its first two columns.** Column widths are frozen on the first paint, and on a reload that paint had no rows in it yet, so every column was frozen to the width of its own heading. They are read off the first paint that has rows.
- **Every tailwind class list read as repeated text.** A className is what an element looks like, not one decision written out twice, and a repo styled with utility classes reported nothing else: 238 of 287 findings on one frontend, 11 of 14 here. A class list and the module an import names are both left alone now, so what is left is real copy: on that frontend 287 findings became 42, and every one of them is a sentence or a value typed out again.
- **An `export { a, b }` swallowed the next import.** A re-export with no `from` on it let the import statement below it be read as part of the same clause, so that import bound the re-exported names instead of its own and every call through it read as unresolved. Both scanners now stop a clause at the next import or export.
- **A folder of repos collapsed to one dot** at module grain with bounds on, since every dot named a band that only existed per repo.
- **A small repo in a folder of repos read as one module.** Grouping balanced every repo against the fleet's total weight, so anything small enough never opened at all: a phone app of fourteen files was one box beside a backend of fifteen hundred. Every repo now folds exactly as it does alone, and a fleet shows the same module count as opening each repo one at a time.
- **A repo past thirty thousand files ran out of heap** building its call graph, since node hands a process about 4 GB and v8 will not raise that once it is running. The run now starts again with room, and the call graph itself holds one row per unresolved name rather than one per call site, and reads each file again rather than keeping every file's text at once. The linux kernel reads as 1.4m declarations and 3.9m calls.
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
