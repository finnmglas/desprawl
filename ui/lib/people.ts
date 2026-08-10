// owner: finn
// goal: who works where, read off the tree the history already filled in

import type { Contributor, Node } from "../../src/model.ts"

export interface Hand {
  who: Contributor
  commits: number
  /** of the commits inside that folder, not of the repo */
  share: number
}

/** folder path to the commits each contributor made inside it */
export function worked(tree: Node): Map<string, Record<number, number>> {
  const found = new Map<string, Record<number, number>>()
  const walk = (node: Node, path: string[]) => {
    if (path.length) found.set(path.join("/"), node.by)
    for (const kid of node.children ?? []) walk(kid, [...path, kid.name])
  }
  walk(tree, [])
  return found
}

/** who has committed there, most first. A remainder group answers for its folder */
export function hands(
  at: string,
  where: Map<string, Record<number, number>>,
  people: Contributor[],
): Hand[] {
  const by = where.get(at.replace(/\/?\*$/, ""))
  const found = Object.entries(by ?? {})
    .map(([seat, commits]) => ({ who: people[Number(seat)], commits }))
    .filter((one) => one.who)
    .sort((a, b) => b.commits - a.commits)
  const whole = found.reduce((sum, one) => sum + one.commits, 0) || 1
  return found.map((one) => ({ ...one, share: one.commits / whole }))
}
