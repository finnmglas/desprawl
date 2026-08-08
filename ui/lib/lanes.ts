// owner: finn
// goal: which rail a commit is drawn on

import type { Commit } from "../../src/model.ts"

export interface Placed {
  commit: Commit
  lane: number
  /** drawn through the row */
  active: number[]
  /** edges down into the next row */
  edges: { from: number; to: number }[]
  /** a child drew in from above */
  linked: boolean
}

// lanes, newest first, reused once the child is drawn
export function place(log: Commit[]): Placed[] {
  const heads: (string | null)[] = [] // lane -> hash it is waiting for
  const rows: Placed[] = []

  const claim = (hash: string): number => {
    const open = heads.indexOf(hash)
    if (open !== -1) return open
    const free = heads.indexOf(null)
    if (free !== -1) {
      heads[free] = hash
      return free
    }
    heads.push(hash)
    return heads.length - 1
  }

  for (const commit of log) {
    const linked = heads.includes(commit.hash) // a child above pointed here
    const lane = claim(commit.hash)
    // every lane still waiting on something else is drawn through this row
    const active = heads.map((h, i) => (h ? i : -1)).filter((i) => i !== -1 && i !== lane)
    const edges: { from: number; to: number }[] = []

    heads[lane] = null
    commit.parents.forEach((parent, i) => {
      // a parent another lane waits for joins that lane, never claimed twice
      const waiting = heads.indexOf(parent)
      let to: number
      if (waiting !== -1) to = waiting
      else if (i === 0)
        to = ((heads[lane] = parent), lane) // first parent keeps this lane
      else to = claim(parent)
      edges.push({ from: lane, to })
    })

    rows.push({ commit, lane, active, edges, linked })
  }
  return rows
}
