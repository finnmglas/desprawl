# Reference

Details on `desprawl` usage.

## Install

Run without installing:

```sh
npx desprawl
```

or install once

```sh
pnpm add -g desprawl
```

and unfuck projects

```sh
desprawl               # view your repo
desprawl <local path>  # view repo at path
desprawl <git url>     # view remote repo (auto-clones)
```

Defaults to UI, CLI available.

## Showcase

Analyze git-tracked repos (files, history, imports, calls):

- **commits** tracked and classified per time and module, loc split into code, comment, blank, nesting
- **timeline** by hour, day, week, month or year, whichever the span can draw
- **tokens** estimated to predict ai cost
- **contributors** listed traceably (also ai), merged by email
- **history** as a commit log with the branch rails beside it
- **stack** from manifests and marker files, frameworks etc
- **imports** are graphed, mapped and structured into groups logically to show module structure
- **cycles** read off the files themselves (so nothing invented or lost)
- **calls** followed from what runs, naming hotspots, unreachable code, recursion and repeated names
- **dependencies** licence of every installed package + version advisories
- **tests** counted read-only, run from interface w/ coverage
- **actions** git and scripts a repo declares, servers controllable from panel
- **tasks** what to clean up, sized, each handed to an agent that streams back into the panel
- **search** one box finds any panel by what it is called and what it holds
- **panels** dragged, reordered, hidden, and set to hold 5, 10 or all rows

```
/home/you/desprawl  @3982e3d
1.79k loc  109 comment (5.7% of source)  260 blank  33 files
68.3k chars  ~17.1k tokens
16 commits  1 contributors  2026-08-08 to 2026-08-08

LANGUAGE      loc     pct  comment  blank  files  chars   ~tok  nest
TypeScript  1.56k   87.5%      105    225     25  61.7k  15.4k   2.7
CSS            86    4.8%        2      7      1  2.95k    738   0.9
total       1.79k  100.0%      109    260     33  68.3k  17.1k   2.5

TREE      loc     pct  comment  blank  files  chars   ~tok  nest  com  churn        last
ui/     1.20k   66.9%       74    153     22  47.9k  12.0k   3.1   27  1.89k  2026-08-08
src/      477   26.7%       33     81      6  17.2k  4.31k   1.4   22  1.50k  2026-08-08
total   1.79k  100.0%      109    260     33  68.3k  17.1k   2.5   61  3.56k  2026-08-08
```

## CLI reference

```sh
desprawl [cli|view] [path|url] [--static] [--anon] [--out FILE] [--keep] [--depth N] [--top N] [--commits N] [--digits N] [--raw] [--json]
```

|                              |                                            |
| ---------------------------- | ------------------------------------------ |
| `desprawl`                   | open interface on current directory        |
| `desprawl ../other-repo`     | open another repo                          |
| `desprawl <git url>`         | clone to downloads, then open              |
| `desprawl cli`               | print report in cli                        |
| `desprawl --static`          | open static html file, no server           |
| `desprawl --json`            | whole cli report, tree + time series       |
| `desprawl check --base main` | what this branch added, exit 1 if anything |

| flag          |                                                         |
| ------------- | ------------------------------------------------------- |
| `--depth N`   | how deep tree goes, default 1                           |
| `--top N`     | contributors shown, default 10                          |
| `--commits N` | commits read from the log, default 10,000               |
| `--digits N`  | digits, default 3 (eg `1`, `10`, `0.1k`, `1.0k`, `10k`) |
| `--static`    | write standalone file rather than server                |
| `--anon`      | leave every commit address out, and avatars with them   |
| `--out FILE`  | write the file there, rather than a temporary name      |
| `--keep`      | keep server after the tab closes                        |
| `--raw`       | exact numbers instead of scaled ones                    |
| `--json`      | machine readable, numbers exact                         |
| `--base REF`  | what `check` compares against                           |

`desprawl` opens interface locally, reanalysing on request. Binds `127.0.0.1:7423`, falling back to a free port when that one is taken. Settings saved between runs. Closing tab ends the tool, nothing is left listening, `--keep` turns that off.

Given a git url instead of path, it clones into `Downloads/desprawl/<host>/<owner>/<repo>` and analyses, or uses the copy it already has.

Three tabs. **Overview** is what the repo is: size, languages, the file tree, the timeline, the commit log, who wrote it, its dependencies and its tests. **Graph** is how it is wired. **Tasks** is what to do about it.

Graph draws the picture first. Every file is a dot inside the module holding it, and a module sits on the level its imports put it on, so nothing drifts across the picture with the force. Switch the grain to modules, or down to declarations, where a file becomes a box of its own. Imports and calls are separate edges on separate bows, either can be turned off, and a pair carrying both shows both.

Below it, the import graph: files grouped into folders, `auto` picks module order and depth for you, and cycles are detected and organized visually. Then the call graph, which follows reach from what actually runs, every file's top level and every export unless you switch that off, and names what nothing arrives at with the lines deleting it would take out.

Every panel can be dragged, hidden and reordered, and how many rows each holds is one setting: five, ten, ten scrolled, or all of them.

`desprawl --static` writes static html file with stats inlined and opens that instead. No server and no network, so it keeps working offline and can be sent to someone, or served as a website.

A saved file carries both graphs, the dependency table and what the test suite holds, and says plainly what it cannot do: it never runs a suite, never reaches a registry, and its numbers are as old as the file.

Every panel saves as CSV, TSV, JSON, TOML, Markdown or Excel, every drawing as PNG, JPEG, WebP or SVG, and the whole report as a PDF printed by your own browser, so the text in it stays text.

## Check a diff

```sh
desprawl check --base main
```

Reads the base ref in a worktree of its own and reports what this branch **added**, never what the repo already holds: import cycles, unresolved imports and barrel files. Exits 1 if anything grew, so it plugs into CI or an agent loop.

A threshold on a total becomes a target, and "this repo has 3 loops" is not actionable on a repo that is already a mess. "Your diff added a loop that was not on main" is local, cheap and unarguable.

## Library

Importable types. `desprawl --json` covers everything else.

```ts
import { analyze, build, calls, cycles, layers, knowledge } from "desprawl"

const stats = analyze(repo) // loc, languages, history, contributors, stack
const graph = build(repo) // imports, per file
const reach = calls(repo, graph) // declarations and what calls what
const loops = cycles(graph) // file cycles, nothing invented or lost
const layout = layers(graph, 1) // files grouped into modules and levels
const found = knowledge(repo, { grain: "file", graph, calls: reach, layout })
```

`knowledge()` returns the whole picture as typed things & relations.

One entry point, everything else internal & free to move, so `desprawl/dist/*` is not importable.

## Related

- Uses: [npm-packaging](https://www.npmjs.com/), [pnpm-cli](https://pnpm.io/), [ts](https://www.typescriptlang.org/), [git](https://git-scm.com/), [claude](https://claude.ai/new)
- Influence: code viz [graphify](https://github.com/Graphify-Labs/graphify), [GitNexus](https://github.com/abhigyanpatwari/GitNexus), [codegraph](https://github.com/colbymchenry/codegraph), archi viz [S202](https://github.com/Weigend/S202), [c4 model](https://c4model.info/#what-is-the-c4-model)

## Continue

[README.md](README.md), [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md)
