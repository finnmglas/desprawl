// owner: finn
// goal: parts too big to ship up front, asked for once the ui is painted

import type { Timeline } from "../../src/history.ts"
import type { Commit, Node } from "../../src/model.ts"

const token = () => new URLSearchParams(location.search).get("t")

// served mode only, a static file already holds everything
export const isLive = (): boolean => !!token() && !window.__DESPRAWL__

async function ask<T>(path: string, fallback: T): Promise<T> {
  const t = token()
  if (!t) return fallback
  try {
    const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}t=${t}`)
    return res.ok ? ((await res.json()) as T) : fallback
  } catch {
    return fallback
  }
}

export const filesIn = (path: string): Promise<Node[]> =>
  ask(`/api/files?path=${encodeURIComponent(path)}`, [])

export const olderCommits = (skip: number, count: number): Promise<Commit[]> =>
  ask(`/api/log?skip=${skip}&count=${count}`, [])

export const allTime = (): Promise<Timeline | null> => ask<Timeline | null>("/api/timeline", null)

export interface Sample {
  date: string
  bytes: number
}

export const sizeCurve = (): Promise<Sample[]> => ask<Sample[]>("/api/size", [])

export const trueCount = (): Promise<number> =>
  ask<{ commits: number }>("/api/count", { commits: 0 }).then((r) => r.commits)
