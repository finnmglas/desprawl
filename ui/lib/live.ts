// owner: finn
// goal: parts too big to ship up front, asked for once the ui is painted

import { toast } from "./toast.ts"
import type { Calls } from "../../src/calls.ts"
import type { Deps } from "../../src/deps.ts"
import type { Sprawl } from "../../src/work.ts"
import type { Run, Suite } from "../../src/tests.ts"
import type { Action, Alive } from "../../src/actions.ts"
import type { Agent } from "../../src/agent.ts"
import type { Talk } from "../../src/talk.ts"
import type { Graph } from "../../src/graph.ts"
import type { Detail, Hours, Moved, Timeline } from "../../src/history.ts"
import type { Source } from "../../src/serve.ts"
import type { Commit, Node } from "../../src/model.ts"

export const token = (): string | null => new URLSearchParams(location.search).get("t")

// served mode only, a static file already holds everything
export const isLive = (): boolean => !!token() && !window.__DESPRAWL__

const complained = new Set<string>()
const failed = (path: string, why: string): void => {
  const name = path.split("?")[0]
  if (complained.has(name)) return
  complained.add(name)
  toast(`Could not load ${name.replace("/api/", "")}`, why, "error")
}

// slowness freezes
let inflight = 0
const watching = new Set<(busy: number) => void>()
export const onBusy = (fn: (busy: number) => void): (() => void) => {
  watching.add(fn)
  return () => void watching.delete(fn)
}
const busy = (step: number) => {
  inflight += step
  watching.forEach((fn) => fn(inflight))
}

// so a dead server reads as dead, not as a quiet tab
let online = true
const watchingConn = new Set<(ok: boolean) => void>()
export const onConnection = (fn: (ok: boolean) => void): (() => void) => {
  watchingConn.add(fn)
  return () => void watchingConn.delete(fn)
}
const connected = (ok: boolean) => {
  if (online === ok) return
  online = ok
  watchingConn.forEach((fn) => fn(ok))
}

// a folder of repos: which one every request below is about, empty for all of them
let only = ""
export const readingRepo = (): string => only
/** switching drops everything held for the one before it */
export const readRepo = (name: string): void => {
  only = name
  drop()
}

async function ask<T>(path: string, fallback: T, sent?: RequestInit): Promise<T> {
  const t = token()
  if (!t) return fallback
  busy(1)
  try {
    const named = only ? `&repo=${encodeURIComponent(only)}` : ""
    const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}t=${t}${named}`, sent)
    if (res.ok) return (await res.json()) as T
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    failed(path, body?.error ?? `${res.status} ${res.statusText}`)
  } catch (err) {
    failed(path, err instanceof Error ? err.message : "the server did not answer")
  } finally {
    busy(-1)
  }
  return fallback
}

/** held open, so the server sees the tab close, and the tab sees the server go */
export function attach(): void {
  // a static file has no server to tell, and must never try to reach one
  if (!isLive()) return
  // a headless printer waits on a stream that never ends
  if (printing()) return
  // the browser drops this the moment the tab goes, and reopens it after a sleep
  const source = new EventSource(`/api/session?t=${token()}`)
  source.onopen = () => connected(true)
  // fires on the first failed reconnect too, so a dead server shows within seconds
  source.onerror = () => connected(false)
}

/** opened to be printed, not read */
export const printing = (): boolean => new URLSearchParams(location.search).has("paper")

export const filesIn = (path: string): Promise<Node[]> =>
  ask(`/api/files?path=${encodeURIComponent(path)}`, [])

/** the file itself, which a static page cannot carry and never asks for */
export const sourceOf = (path: string): Promise<Source | null> =>
  ask<Source | null>(`/api/source?path=${encodeURIComponent(path)}`, null)

export const commitDetail = (hash: string): Promise<Detail | null> =>
  ask<Detail | null>(`/api/commit?hash=${hash}`, null)

export const olderCommits = (skip: number, count: number): Promise<Commit[]> =>
  ask(`/api/log?skip=${skip}&count=${count}`, [])

export const allTime = (): Promise<Timeline | null> => ask<Timeline | null>("/api/timeline", null)

/** built on the first ask, or carried by a static page */
// held for the life of the page, or every tab switch refetches a megabyte
const held = new Map<string, Promise<unknown>>()
const drop = () => held.clear()
const once = <T>(path: string, made: () => Promise<T>): Promise<T> => {
  const found = (held.get(path) ?? made()) as Promise<T>
  held.set(path, found)
  // a failed ask resolves null, and holding that would make the failure permanent
  void found.then((v) => v ?? held.delete(path))
  return found
}

export const importGraph = (): Promise<Graph | null> =>
  window.__DESPRAWL_GRAPH__
    ? Promise.resolve(window.__DESPRAWL_GRAPH__)
    : once("/api/graph", () => ask<Graph | null>("/api/graph", null))

/** every declaration and what calls it */
export const callGraph = (): Promise<Calls | null> =>
  window.__DESPRAWL_CALLS__
    ? Promise.resolve(window.__DESPRAWL_CALLS__)
    : once("/api/calls", () => ask<Calls | null>("/api/calls", null))

/** the whole thing as one file, built by the server */
export async function staticPage(): Promise<string | null> {
  const t = token()
  if (!t) return null
  try {
    const res = await fetch(`/api/static?t=${t}`)
    if (res.ok) return await res.text()
  } catch {
    /* the toast below says it did not arrive */
  }
  toast("Could not build the file", "the server did not answer", "error")
  return null
}

/** what moved between two days, and who moved it */
export const movedIn = (from: string, to: string): Promise<Moved> =>
  ask<Moved>(`/api/moved?from=${from}&to=${to}`, { paths: {}, people: {} })

export interface Sample {
  date: string
  bytes: number
}

export const sizeCurve = (): Promise<Sample[]> => ask<Sample[]>("/api/size", [])

/** too fine to carry in the payload */
export const hourCurve = (from: string, to: string): Promise<Hours | null> =>
  ask<Hours | null>(`/api/hours?from=${from}&to=${to}`, null)

/** faces this machine already asked github for */
export const knownFaces = (): Promise<Record<string, string>> =>
  ask<Record<string, string>>("/api/faces", {})

export const keepFaces = (faces: Record<string, string>): Promise<Record<string, string>> =>
  ask<Record<string, string>>("/api/faces", faces, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(faces),
  })

/** the repos in the folder this run was pointed at, empty for a single repo */
export const allRepos = (): Promise<string[]> => ask<string[]>("/api/repos", [])

export const trueCount = (): Promise<number> =>
  ask<{ commits: number }>("/api/count", { commits: 0 }).then((r) => r.commits)

/** a browser on that machine can write one */
export async function canPrint(): Promise<boolean> {
  const t = token()
  if (!t) return false
  try {
    const res = await fetch(`/api/can-print?t=${t}`)
    return res.ok && ((await res.json()) as { can: boolean }).can
  } catch {
    return false
  }
}

/** the whole report, printed rather than painted */
export async function printed(): Promise<Blob | null> {
  const t = token()
  if (!t) return null
  try {
    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light"
    const res = await fetch(`/api/pdf?t=${t}&theme=${theme}`)
    if (res.ok) return await res.blob()
  } catch {
    /* the caller falls back to a picture */
  }
  return null
}

/** the text level sprawl: repeated literals and copied runs */
export const sprawlHere = (): Promise<Sprawl> =>
  ask("/api/sprawl", { repeated: [], copied: [], talky: [] })

/** licences off disk, advisories from osv, asked for once */
export const dependencies = (): Promise<Deps | null> =>
  window.__DESPRAWL_DEPS__
    ? Promise.resolve(window.__DESPRAWL_DEPS__)
    : // the server only reaches the registry once, and now the page only asks it once either
      once("/api/deps", () => ask<Deps | null>("/api/deps", null))

/** what the repo would run, counted rather than run */
export const testSuite = (): Promise<Suite | null> =>
  window.__DESPRAWL_TESTS__
    ? Promise.resolve(window.__DESPRAWL_TESTS__)
    : ask<Suite | null>("/api/tests", null)

/** and actually running it, which only a served run can do */
export const runTests = (script: string, coverage = false): Promise<Suite | null> =>
  ask<Suite | null>(
    `/api/tests/run?script=${encodeURIComponent(script)}${coverage ? "&coverage=1" : ""}`,
    null,
  )

/** what this repo can be told to do, and doing it, both served only */
export const repoActions = (): Promise<Action[]> => ask<Action[]>("/api/actions", [])

export const runAction = (id: string): Promise<Run | null> =>
  ask<Run | null>(`/api/actions/run?id=${encodeURIComponent(id)}`, null)

/** the ones that never end: started, watched and interrupted from the same panel */
export const startAction = (id: string): Promise<Alive | null> =>
  ask<Alive | null>(`/api/actions/start?id=${encodeURIComponent(id)}`, null)

export const stopAction = (id: string): Promise<{ stopped: boolean }> =>
  ask(`/api/actions/stop?id=${encodeURIComponent(id)}`, { stopped: false })

export const aliveActions = (): Promise<Alive[]> => ask<Alive[]>("/api/actions/alive", [])

/** dropped for good, which only a stopped one allows */
export const forgetAction = (id: string): Promise<{ forgotten: boolean }> =>
  ask(`/api/actions/forget?id=${encodeURIComponent(id)}`, { forgotten: false })

export const agentHere = (): Promise<Agent | null> => ask<Agent | null>("/api/agent", null)

/** so a new run shows on the press, not on the next beat */
const watchers = new Set<(made: Talk) => void>()
export const onAgent = (told: (made: Talk) => void) => {
  watchers.add(told)
  return () => watchers.delete(told)
}

/** the task goes over as text, the argv is built on the other side */
export const startFix = (said: {
  id: string
  title: string
  why: string
  where: string
  extra: string
  model: string
  mode: string
  install: string
  trust: string
}): Promise<Talk | null> =>
  ask<Talk | null>("/api/agent/fix", null, {
    method: "POST",
    body: JSON.stringify({
      id: said.id,
      task: said.title,
      why: said.why,
      where: said.where,
      extra: said.extra,
      model: said.model,
      mode: said.mode,
      install: said.install,
      trust: said.trust,
    }),
  }).then((made) => {
    if (made) for (const told of watchers) told(made)
    return made
  })

/** every agent run this desprawl started, with everything said in it */
export const talksNow = (): Promise<Talk[]> => ask<Talk[]>("/api/agent/talks", [])

/** thrown away on purpose: a run is kept until asked to go */
export const closeTalk = (id: string): Promise<{ closed: boolean; why?: string }> =>
  ask(`/api/agent/close?id=${encodeURIComponent(id)}`, { closed: false, why: "not live" })

/** one more thing said into a stopped run */
export const sayToAgent = (said: {
  id: string
  text: string
  install: string
  trust: string
}): Promise<Talk | null> =>
  ask<Talk | null>("/api/agent/say", null, { method: "POST", body: JSON.stringify(said) })
