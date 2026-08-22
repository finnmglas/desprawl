// owner: finn
// goal: what one served run holds, read once and kept until the head moves

import { analyze } from "../facts/analyze.ts"
import { before, type Want, type Was } from "../facts/before.ts"
import { calls } from "../read/calls.ts"
import { deps, joined } from "../facts/deps.ts"
import { build } from "../read/graph.ts"
import { everyApi, everyCall, fleet, graphs, many } from "../facts/many.ts"
import { git, made } from "../read/model.ts"
import { api as apiOf } from "../read/routes.ts"
import { copied, repeated, talky } from "../facts/sprawl.ts"
import { anonymous } from "./view.ts"
import { merged, tests } from "../facts/tests.ts"
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
  graph: (name: string | null) => Graph
  calls: (name: string | null) => Calls
  api: (name: string | null) => Api
  deps: (name?: string | null) => Promise<Deps>
  sprawl: (name?: string | null) => Sprawl
  tests: (name?: string | null) => Suite
  /** what it ran, kept so the panel still shows it after a reload */
  ran: (one: Suite) => Suite
  /** the whole history, and the size at each of the points it sampled */
  timeline: (name?: string | null) => Timeline
  sizes: (name?: string | null) => { date: string; bytes: number }[]
  commits: (name?: string | null) => number
  /** every repo a request is about, for a reader that reads them one at a time */
  about: (name?: string | null) => string[]
  /** one reading off an older commit, for the kpis that say which way they went */
  before: (name: string | null, days: number, want: Want) => Was | null
  /** what a run has read so far, for the page that carries everything it can */
  read: { graph: Graph | null; calls: Calls | null; deps: Deps | null; tests: Suite | null }
}

export function holds(repo: string, cap?: number, anon = false): Holds {
  const each = new Map<string, { head: string; stats: Stats }>()
  const built = new Map<string, Graph>()
  const rung = new Map<string, Calls>()
  const wired = new Map<string, Api>()
  const every = new Map<string, Stats>()
  const counted = new Map<string, number>()
  const allTime = new Map<string, Timeline>()
  const sizes = new Map<string, { date: string; bytes: number }[]>()
  const known = new Map<string, Deps>()
  // per repo as well as per set: a registry answered about a repo, not about a pick
  const asked = new Map<string, Promise<Deps>>()
  const loose = new Map<string, Sprawl>()
  const suite = new Map<string, Suite>()
  // keyed by repo and window: reading one is a checkout, and nobody wants two of those
  const was = new Map<string, Was>()

  // a folder of repos is read as one, and each of them is still readable on its own
  const many_ = fleet(repo)
  /** the repos a request named, in the order the folder holds them */
  const found = (name?: string | null): string[] =>
    (name ?? "")
      .split(",")
      .map((one) => one.trim())
      .filter(Boolean)
      .map((one) => many_.find((held) => held.endsWith(`/${one}`)) ?? "")
      .filter(Boolean)
  /** the one repo a request is about, "" when it is about several or the whole folder */
  const pick = (name: string | null): string => {
    const said = found(name)
    return said.length === 1 ? said[0] : ""
  }
  const at = (name: string | null): string => pick(name) || (many_.length ? "" : repo)
  /** what a per repo reader is about: the ones named, or every one of them */
  const mine = (name?: string | null): string[] => {
    const said = found(name)
    return said.length ? said : many_.length ? many_ : [repo]
  }
  // one cache line per set of repos, the whole folder included
  const key = (name?: string | null): string => mine(name).join(",")

  const graph = (name: string | null): Graph => {
    const seen = built.get(key(name))
    if (seen) return seen
    // one repo, whether it was named or is all this run holds, and "" for several of them
    const one = at(name)
    const made = one ? build(one) : graphs(repo, mine(name))
    built.set(key(name), made)
    return made
  }
  const rang = (name: string | null): Calls => {
    const seen = rung.get(key(name))
    if (seen) return seen
    const one = at(name)
    const made = one ? calls(one, graph(name)) : everyCall(repo, mine(name))
    rung.set(key(name), made)
    return made
  }
  /** one repo, read once for as long as its head stands still */
  const alone = (where: string): Stats => {
    const head = git(where, "rev-parse", "--short", "HEAD").trim()
    const seen = each.get(where)
    if (seen?.head === head) return seen.stats
    const made = analyze(where, cap)
    each.set(where, { head, stats: made })
    return made
  }

  const read: Holds["read"] = { graph: null, calls: null, deps: null, tests: null }

  return {
    fleet: many_,
    at,
    read,
    stats: (fresh, name = null) => {
      const said = (one: Stats) => (anon ? anonymous(one) : one)
      const only = pick(name)
      if (many_.length && !only) {
        const seen = every.get(key(name))
        if (!fresh && seen) return said(seen)
        const made = many(repo, cap, mine(name), alone).all
        every.set(key(name), made)
        return said(made)
      }
      const where = only || repo
      if (fresh) each.delete(where)
      return said(alone(where))
    },
    graph: (where) => (read.graph = graph(where)),
    calls: (where) => (read.calls = rang(where)),
    api: (name) => {
      const seen = wired.get(key(name))
      if (seen) return seen
      const one = at(name)
      const made = one ? apiOf(one, graph(name), rang(name)) : everyApi(repo, mine(name))
      wired.set(key(name), made)
      return made
    },
    // a registry that answered is worth keeping, one that did not is worth asking again
    deps: (name) => {
      const held_ = key(name)
      const seen = known.get(held_)
      if (seen) return Promise.resolve(seen)
      return Promise.all(
        mine(name).map((one) => {
          const seen_ = asked.get(one)
          if (seen_) return seen_
          const made = deps(one)
          asked.set(one, made)
          // one that answered nothing is worth asking again
          void made.then((got) => (got.offline || got.missed) && asked.delete(one))
          return made
        }),
      )
        .then(joined)
        .then((one) => {
          if (!one.offline && !one.missed) known.set(held_, one)
          return (read.deps = one)
        })
    },
    sprawl: (name) => {
      const held_ = key(name)
      const seen = loose.get(held_)
      if (seen) return seen
      const paths = Object.keys(graph(name ?? null).modules)
      // a fleet's paths are read from the folder holding it, each prefixed with its repo
      const root = pick(name ?? null) || repo
      const found: Sprawl = {
        ...made(root),
        repeated: repeated(root, paths),
        copied: copied(root, paths),
        talky: talky(root, paths),
      }
      loose.set(held_, found)
      return found
    },
    about: mine,
    tests: (name) => {
      const held_ = key(name)
      const held = suite.get(held_) ?? merged(mine(name).map(tests))
      suite.set(held_, held)
      return (read.tests = held)
    },
    ran: (found) => (read.tests = suite.set("", found).get("") ?? found),
    timeline: (name) => {
      const held_ = key(name)
      const held = allTime.get(held_) ?? timeline(mine(name))
      allTime.set(held_, held)
      return held
    },
    // each repo carries its own last known size forward, so the total is what was there
    sizes: (name) => {
      const held_ = key(name)
      const seen = sizes.get(held_)
      if (seen) return seen
      const held = new Map<string, number>()
      const by = new Map<string, number>()
      const walk = allTime.get(held_) ?? timeline(mine(name))
      allTime.set(held_, walk)
      // a folder samples each repo in turn, and a series runs in one direction
      for (const sample of [...walk.samples].sort((a, b) => a.date.localeCompare(b.date))) {
        held.set(sample.repo, bytesAt(sample.repo, sample.hash))
        let sum = 0
        for (const bytes of held.values()) sum += bytes
        by.set(sample.date, sum)
      }
      const made = [...by].map(([date, bytes]) => ({ date, bytes }))
      sizes.set(held_, made)
      return made
    },
    before: (name, days, want) => {
      // a checkout is of one repo, and the cards add a folder of them up: answering about
      // the first would be a wrong number said confidently. Pick one and it reads
      const held = mine(name ?? null)
      if (held.length !== 1) return null
      const one = held[0]
      const held_ = `${one}@${days}@${want}`
      const seen = was.get(held_)
      if (seen) return seen
      const made = before(one, days, want)
      if (made) was.set(held_, made)
      return made
    },
    commits: (name) => {
      const held_ = key(name)
      const held = counted.get(held_) ?? mine(name).reduce((sum, one) => sum + count(one), 0)
      counted.set(held_, held)
      return held
    },
  }
}
