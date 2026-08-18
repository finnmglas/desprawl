// owner: finn
// goal: what one served run holds, read once and kept until the head moves

import { analyze } from "../facts/analyze.ts"
import { calls } from "../read/calls.ts"
import { deps } from "../facts/deps.ts"
import { build } from "../read/graph.ts"
import { everyApi, everyCall, fleet, graphs, many } from "../facts/many.ts"
import { git } from "../read/model.ts"
import { api as apiOf } from "../read/routes.ts"
import { copied, repeated, talky } from "../facts/sprawl.ts"
import { tests } from "../facts/tests.ts"
import { count } from "../facts/history.ts"
import { bytesAt, timeline } from "../facts/samples.ts"
import type { Api } from "../read/specs.ts"
import type { Calls } from "../read/calls.ts"
import type { Deps } from "../facts/deps.ts"
import type { Graph } from "../read/graph.ts"
import type { Timeline } from "../facts/samples.ts"
import type { Stats } from "../read/model.ts"
import type { Suite } from "../facts/tests.ts"
import type { Sprawl } from "../facts/work.ts"

/** every reader a served run answers with, each one built the first time it is asked for */
export interface Holds {
  /** the repos in the folder, empty when one repo was opened */
  fleet: string[]
  /** the repo a request is about: the one it named, or this run's single one */
  at: (name: string | null) => string
  stats: (fresh: boolean, name?: string | null) => Stats
  graph: (where: string) => Graph
  calls: (where: string) => Calls
  api: (where: string) => Api
  deps: () => Promise<Deps>
  sprawl: () => Sprawl
  tests: () => Suite
  /** what it ran, kept so the panel still shows it after a reload */
  ran: (one: Suite) => Suite
  /** the whole history, and the size at each of the points it sampled */
  timeline: () => Timeline
  sizes: () => { date: string; bytes: number }[]
  commits: () => number
  /** what a run has read so far, for the page that carries everything it can */
  read: { graph: Graph | null; calls: Calls | null; deps: Deps | null; tests: Suite | null }
}

export function holds(repo: string, cap?: number): Holds {
  const each = new Map<string, { head: string; stats: Stats }>()
  const built = new Map<string, Graph>()
  const rung = new Map<string, Calls>()
  const wired = new Map<string, Api>()
  let whole: Stats | undefined
  let total = 0
  let allTime: Timeline | null = null
  let sizes: { date: string; bytes: number }[] | null = null
  let known: Deps | null = null
  let loose: Sprawl | null = null
  let suite: Suite | null = null

  // a folder of repos is read as one, and each of them is still readable on its own
  const many_ = fleet(repo)
  const pick = (name: string | null): string =>
    (name && many_.find((one) => one.endsWith(`/${name}`))) || ""
  const at = (name: string | null): string => pick(name) || (many_.length ? "" : repo)
  const one = () => at(null) || many_[0]

  const graph = (where: string): Graph => {
    const seen = built.get(where)
    if (seen) return seen
    const made = where ? build(where) : graphs(repo)
    built.set(where, made)
    return made
  }
  const rang = (where: string): Calls => {
    const seen = rung.get(where)
    if (seen) return seen
    const made = where ? calls(where, graph(where)) : everyCall(repo)
    rung.set(where, made)
    return made
  }
  const read: Holds["read"] = { graph: null, calls: null, deps: null, tests: null }

  return {
    fleet: many_,
    at,
    read,
    stats: (fresh, name = null) => {
      const mine = pick(name)
      if (many_.length && !mine) {
        if (!fresh && whole) return whole
        return (whole = many(repo, cap).all)
      }
      const where = mine || repo
      const head = git(where, "rev-parse", "--short", "HEAD").trim()
      const seen = each.get(where)
      if (!fresh && seen?.head === head) return seen.stats
      const made = analyze(where, cap)
      each.set(where, { head, stats: made })
      return made
    },
    graph: (where) => (read.graph = graph(where)),
    calls: (where) => (read.calls = rang(where)),
    api: (where) => {
      const seen = wired.get(where)
      if (seen) return seen
      const made = where ? apiOf(where, graph(where), rang(where)) : everyApi(repo)
      wired.set(where, made)
      return made
    },
    // a registry that answered is worth keeping, one that did not is worth asking again
    deps: () =>
      known
        ? Promise.resolve(known)
        : deps(repo).then((one) => {
            if (!one.offline && !one.missed) known = one
            return (read.deps = one)
          }),
    sprawl: () => {
      const paths = Object.keys(graph(at(null)).modules)
      return (loose ??= {
        repeated: repeated(repo, paths),
        copied: copied(repo, paths),
        talky: talky(repo, paths),
      })
    },
    tests: () => (read.tests = suite ??= tests(one())),
    ran: (found) => (read.tests = suite = found),
    timeline: () => (allTime ??= timeline(one())),
    sizes: () =>
      (sizes ??= (allTime ??= timeline(one())).samples.map((s) => ({
        date: s.date,
        bytes: bytesAt(repo, s.hash),
      }))),
    commits: () => (total ||= count(one())),
  }
}
