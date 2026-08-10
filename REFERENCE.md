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

Defaults to UI, CLI available.

## Showcase

Analyze git-tracked repos (files, history, imports, calls):

- **loc, comment, blank** per language, folder, split by line kind
- **chars and ~tok**, est 4 characters per token, for ai cost estimation
- **nest**, mean indentation depth of code lines
- **com, churn, last**, commits + lines moved per folder
- **contributors**, merged by email (with renames followed)
- **project metadata**, the stack read off manifests and marker files: language, packages and pinning, frameworks, what it connects to, build, ci and containers
- **assistance**, which ai coding tools left a trace, from checked in rules and from commit signatures
- **imports**, every module specifier resolved to the file it names, with aliases, workspace packages and the `.js` to `.ts` rewrite followed
- **structure**, those imports folded into groups: the levels they stack into, what stays inside a group against what leaves, and the loops that stop any of them being moved

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
desprawl [cli|view] [path|url] [--static] [--keep] [--depth N] [--top N] [--commits N] [--digits N] [--raw] [--json]
```

|                          |                                              |
| ------------------------ | -------------------------------------------- |
| `desprawl`               | open the explorer on the current directory   |
| `desprawl ../other-repo` | open it on another repo                      |
| `desprawl <git url>`     | clone it to your downloads, then open that   |
| `desprawl cli`           | print the report in the terminal instead     |
| `desprawl --static`      | open one self contained html file, no server |
| `desprawl --json`        | whole report, tree + time series             |

| flag          |                                                                     |
| ------------- | ------------------------------------------------------------------- |
| `--depth N`   | how deep the tree goes, default 1                                   |
| `--top N`     | contributors shown, default 10                                      |
| `--commits N` | commits read from the log, default 10,000                           |
| `--digits N`  | significant digits, default 3 (eg `1`, `10`, `0.1k`, `1.0k`, `10k`) |
| `--static`    | write a standalone file rather than serving                         |
| `--keep`      | keep serving after the last tab closes                              |
| `--raw`       | exact numbers instead of scaled ones                                |
| `--json`      | machine readable, every number exact                                |

`desprawl` serves the explorer locally and opens it, reanalysing on request so `refresh` picks up new commits without a restart. It binds `127.0.0.1:7423`, falling back to a free port when that one is taken, and every request needs a token minted for that run, because any page in your browser can otherwise reach localhost. One fixed origin means the browser keeps your display settings between runs. Closing the last tab ends the run, so nothing is left listening, and `--keep` turns that off.

Given a git url instead of a path, it clones into `Downloads/desprawl/<host>/<owner>/<repo>` and analyses that, or fast forwards the copy it already has. The https and ssh forms of one url land in the same place.

The **Modules** view reads the import graph rather than the tree. Files are grouped into folders, `auto` picking them by weight so no group holds more than a tenth of the repo and no group is a single file, or by a fixed depth if you prefer. Each group gets a level from how far its own dependencies reach, a share of imports that never leave it, and a place in a grid of every dependency at once. Groups that import each other are reported as loops, together with a set of imports whose removal opens them, each marked as type only or real work.

`desprawl --static` writes one self contained html file with the stats inlined and opens that instead. No server and no network, so it keeps working offline and can be sent to someone.

## Continue

[README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md)
