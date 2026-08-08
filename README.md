# desprawl

**Unfuck large typescript projects**\
by scoping and delivering cleanup work.

## Quickstart

Install desprawl

```sh
pnpm i desprawl
```

and run it in your repo

```sh
desprawl
```

it will lead you.

### Output example

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

Analyze git-tracked files.

- **loc, comment, blank** per language, folder, split by line kind
- **chars and ~tok**, est 4 characters per token, for ai cost estimation
- **nest**, mean indentation depth of code lines
- **com, churn, last**, commits + lines moved per folder
- **contributors**, merged by email (with renames followed)

### CLI reference

```sh
desprawl [view] [path] [--depth N] [--top N] [--digits N] [--raw] [--json]
```

| | |
| --- | --- |
| `desprawl` | report on the current directory |
| `desprawl ../other-repo` | report on another repo |
| `desprawl view` | open the explorer html |
| `desprawl --json` | whole report, tree + time series |

| flag | |
| --- | --- |
| `--depth N` | how deep the tree goes, default 1 |
| `--top N` | contributors shown, default 10 |
| `--digits N` | significant digits, default 3 (eg `1`, `10`, `0.1k`, `1.0k`, `10k`) |
| `--raw` | exact numbers instead of scaled ones |
| `--json` | machine readable, every number exact |

`desprawl view` writes a html file with stats inlined and opens it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## Related

- Uses: [npm-packaging](https://www.npmjs.com/), [pnpm-cli](https://pnpm.io/), [ts](https://www.typescriptlang.org/), [git](https://git-scm.com/), [claude](https://claude.ai/new)
- Influence: code viz [graphify](https://github.com/Graphify-Labs/graphify), [GitNexus](https://github.com/abhigyanpatwari/GitNexus), [codegraph](https://github.com/colbymchenry/codegraph), archi viz [S202](https://github.com/Weigend/S202)

## License

MIT.