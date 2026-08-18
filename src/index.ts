// owner: finn
// goal: the public api, everything else internal

export { analyze } from "./facts/analyze.ts"
export { calls } from "./read/calls.ts"
export { cycles } from "./read/cycles.ts"
export { build } from "./read/graph.ts"
export { GRAINS, knowledge } from "./facts/knowledge.ts"
export { fold as layers } from "./read/layers.ts"
export { api } from "./read/routes.ts"
export { VERSION } from "./read/model.ts"

export type { Calls, Symbol as Declaration } from "./read/calls.ts"
export type { Edge, Graph, Missing, Module } from "./read/graph.ts"
export type { Asking, Grain, Knowledge, Link, Thing } from "./facts/knowledge.ts"
export type { Layout, Unit } from "./read/layers.ts"
export type { Api, Client, Endpoint, Link as Request } from "./read/routes.ts"
export type { Contributor, Made, Node, Remote, Stack, Stats } from "./read/model.ts"

// what the cli prints, for whatever reads it in ci
export type { Checked, Count } from "./facts/check.ts"
export type { Dep, Deps } from "./facts/deps.ts"
export type { Sprawl, Task } from "./facts/work.ts"
export type { Run, Suite } from "./facts/tests.ts"
export type { Hours, Timeline } from "./facts/samples.ts"
