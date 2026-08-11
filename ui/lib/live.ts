// owner: finn
// goal: parts too big to ship up front, asked for once the ui is painted

import { toast } from "./toast.ts"
import type { Calls } from "../../src/calls.ts"
import type { Deps } from "../../src/deps.ts"
import type { Suite } from "../../src/tests.ts"
import type { Graph } from "../../src/graph.ts"
import type { Detail, Moved, Timeline } from "../../src/history.ts"
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

async function ask<T>(path: string, fallback: T): Promise<T> {
  const t = token()
  if (!t) return fallback
  busy(1)
  try {
    const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}t=${t}`)
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

/** held open, so the server sees the tab close */
export function attach(): void {
  // a static file has no server to tell, and must never try to reach one
  if (!isLive()) return
  // a headless printer waits on a stream that never ends, and is not a tab worth keeping
  if (printing()) return
  // the browser drops this the moment the tab goes, and reopens it after a sleep
  new EventSource(`/api/session?t=${token()}`)
}

/** opened to be printed, not read */
export const printing = (): boolean => new URLSearchParams(location.search).has("paper")

export const filesIn = (path: string): Promise<Node[]> =>
  ask(`/api/files?path=${encodeURIComponent(path)}`, [])

export const commitDetail = (hash: string): Promise<Detail | null> =>
  ask<Detail | null>(`/api/commit?hash=${hash}`, null)

export const olderCommits = (skip: number, count: number): Promise<Commit[]> =>
  ask(`/api/log?skip=${skip}&count=${count}`, [])

export const allTime = (): Promise<Timeline | null> => ask<Timeline | null>("/api/timeline", null)

/** built on the first ask, or carried by a static page */
export const importGraph = (): Promise<Graph | null> =>
  window.__DESPRAWL_GRAPH__
    ? Promise.resolve(window.__DESPRAWL_GRAPH__)
    : ask<Graph | null>("/api/graph", null)

/** every declaration and what calls it */
export const callGraph = (): Promise<Calls | null> =>
  window.__DESPRAWL_CALLS__
    ? Promise.resolve(window.__DESPRAWL_CALLS__)
    : ask<Calls | null>("/api/calls", null)

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

/** licences off disk and advisories from osv, carried by a saved page or asked for once */
export const dependencies = (): Promise<Deps | null> =>
  window.__DESPRAWL_DEPS__
    ? Promise.resolve(window.__DESPRAWL_DEPS__)
    : ask<Deps | null>("/api/deps", null)

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
