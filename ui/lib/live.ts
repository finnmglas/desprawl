// owner: finn
// goal: parts too big to ship up front, asked for once the ui is painted

import { toast } from "../components/toast.tsx"
import type { Graph } from "../../src/graph.ts"
import type { Detail, Timeline } from "../../src/history.ts"
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

/** holds a stream open, so the server sees the tab close */
export function attach(): void {
  // a static file has no server to tell, and must never try to reach one
  if (!isLive()) return
  // the browser drops this the moment the tab goes, and reopens it after a sleep
  new EventSource(`/api/session?t=${token()}`)
}

export const filesIn = (path: string): Promise<Node[]> =>
  ask(`/api/files?path=${encodeURIComponent(path)}`, [])

export const commitDetail = (hash: string): Promise<Detail | null> =>
  ask<Detail | null>(`/api/commit?hash=${hash}`, null)

export const olderCommits = (skip: number, count: number): Promise<Commit[]> =>
  ask(`/api/log?skip=${skip}&count=${count}`, [])

export const allTime = (): Promise<Timeline | null> => ask<Timeline | null>("/api/timeline", null)

/** built on the first ask, held by the server after */
export const importGraph = (): Promise<Graph | null> => ask<Graph | null>("/api/graph", null)

export interface Sample {
  date: string
  bytes: number
}

export const sizeCurve = (): Promise<Sample[]> => ask<Sample[]>("/api/size", [])

export const trueCount = (): Promise<number> =>
  ask<{ commits: number }>("/api/count", { commits: 0 }).then((r) => r.commits)
