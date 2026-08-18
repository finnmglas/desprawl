// owner: finn
// goal: what a folder and a group are shaped like, in words

/** what opening it shows: a pile, or too small to be a folder */
export function spread(
  entries: number,
  folders?: number,
  /** a root earns more room: config and docs live loose in it */
  roomy = false,
): { label: "bloated" | "oversize" | "healthy" | "thin"; why: string } {
  const held =
    folders === undefined ? "" : folders ? `, ${folders} of them folders` : " and not one subfolder"
  const allowed = roomy ? ", and a repo root was already allowed more than a folder inside it" : ""
  if (entries >= (roomy ? 100 : 60))
    return {
      label: "bloated",
      why: `${entries} entries side by side${held}. This is not a folder any more, it is a directory listing${allowed}`,
    }
  if (entries >= (roomy ? 40 : 26))
    return {
      label: "oversize",
      why: `${entries} entries${held}. Past what anyone scans at once, though still a list you could sort out in an afternoon${allowed}`,
    }
  if (entries >= 4)
    return {
      label: "healthy",
      why: `${entries} entries, a folder you can open and take in at once`,
    }
  return {
    label: "thin",
    why: `${entries} entries. Not a problem, but a folder this small may belong inside its neighbour`,
  }
}

export interface Shape {
  label: string
  band: "entry" | "middle" | "base"
  why: string
  /** no single import could move it elsewhere, so the label is not a coin flip */
  sure: boolean
  /** what it was decided on, so four imports never read like four thousand */
  edges: number
}

/** imports only itself: a module. Otherwise placed by which way its edges lean */
function read(
  inside: number,
  out: number,
  into: number,
  reach: number,
): Omit<Shape, "sure" | "edges"> & { firm?: boolean } {
  if (!inside && !out)
    return {
      label: "Module",
      band: "base",
      firm: true,
      why: into
        ? "it imports nothing at all and the rest imports it, so it stands on its own"
        : "it imports nothing and nothing imports it, so it stands apart from the repo",
    }
  const kept = (inside / (inside + out)) * 100

  if (kept >= 100)
    return {
      label: "Module",
      band: "base",
      firm: true,
      why: "every import stays inside it, so it can be lifted out as it stands",
    }
  if (kept >= 80)
    return {
      label: "Module*",
      band: "base",
      why: "four imports in five stay inside. A module once the last few are dealt with",
    }

  // everything left is placed by which way it leans, so nothing turns on one import
  const arriving = into + out ? (into / (into + out)) * 100 : 0
  if (arriving >= 55)
    return {
      label: "Shared",
      band: "base",
      why: `${Math.round(arriving)}% of its edges arrive, so it is what the rest stands on`,
    }
  // a leaf hanging off the tree, never a top of the stack
  if (kept >= 50 && reach <= 1)
    return {
      label: "Module*",
      band: "base",
      why: `half its imports stay inside and it leans on ${reach ? "one other group" : "nothing"}, so it is a leaf. Almost nothing here uses it`,
    }
  if (arriving <= 0)
    return {
      label: "Entrypoint",
      band: "entry",
      firm: true,
      why: "nothing here imports it, and it imports the rest. A top of the stack",
    }
  if (arriving < 10)
    return {
      label: "Entrypoint*",
      band: "entry",
      why: `${Math.round(arriving)}% of its edges arrive, the rest leave, so it mostly composes`,
    }
  if (arriving < 45)
    return {
      label: "Collection",
      band: "middle",
      why: `${Math.round(arriving)}% of its edges arrive, so it leans on more than leans on it. Hard to move or to name`,
    }
  return {
    label: "Shared*",
    band: "middle",
    why: `${Math.round(arriving)}% of its edges arrive, which is even. Nearly a foundation, and it would take little to make it one`,
  }
}

/** the shape, and whether one import each way would change it */
export function shapeOf(inside: number, out: number, into = 0, reach = 2): Shape {
  const { firm, ...shape } = read(inside, out, into, reach)
  const less = (n: number) => Math.max(0, n - 1)
  const nearby = [
    read(inside + 1, less(out), into, reach),
    read(less(inside), out + 1, into, reach),
    read(inside, out + 1, less(into), reach),
    read(inside, less(out), into + 1, reach),
  ]
  return {
    ...shape,
    // an exact answer is not a near miss: nothing imports it, or nothing leaves it
    sure: !!firm || nearby.every((one) => one.label === shape.label),
    edges: inside + out + into,
  }
}
