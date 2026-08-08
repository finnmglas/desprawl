# desprawl

Unfuck large typescript projects by scoping and delivering cleanup work.

## Quickstart

Install desprawl

```sh
pnpm i desprawl
```

and run it in your repo

```sh
desprawl
```

just use it or see [REFERENCE.md](REFERENCE.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## Related

- Uses: [npm-packaging](https://www.npmjs.com/), [pnpm-cli](https://pnpm.io/), [ts](https://www.typescriptlang.org/), [git](https://git-scm.com/), [claude](https://claude.ai/new)
- Influence, with what each one taught us:
  - **graph model** - [graphify](https://github.com/Graphify-Labs/graphify) (per-edge confidence labels, so uncertainty is a first-class property), [GitNexus](https://github.com/abhigyanpatwari/GitNexus) (ingestion as an explicit phase DAG; shared code never names a language), [codegraph](https://github.com/colbymchenry/codegraph) (surgical context in one call, per-file parse fallback, explicit staleness), [joern](https://github.com/joernio/joern) (structure, control flow and data flow belong in one graph)
  - **architecture analysis** - [S202](https://github.com/Weigend/S202) (the layered view, tangles as non-trivial SCCs, the method-level cut list as a reviewable refactoring plan, a per-driver quality report)
  - **ranking and identity** - [aider](https://github.com/Aider-AI/aider) (PageRank over the reference graph as an importance signal), [scip](https://github.com/scip-code/scip) (symbol ids derived from source alone, so stored findings survive a re-index)
  - **agent surface** - [CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext) (MCP as the agent-facing surface, and the tool set an agent actually needs)

  No code from any of these is vendored. What was taken is an idea.

## License

MIT.
