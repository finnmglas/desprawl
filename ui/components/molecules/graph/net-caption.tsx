// owner: finn
// goal: what is under the cursor, said under the graph

import { HEADS, REQUEST } from "../../../lib/draw/paint.ts"
import { plural, shortPath } from "../../../lib/text/format.ts"
import type { Net, Spot, Wire } from "../../../lib/draw/network.ts"

interface Props {
  drawn: Net | null
  near: Spot | null
  edge: (Wire & { held: number }) | null
  /** what a line carries, in words */
  said: (wire: Wire) => string[]
  called: Map<string, string>
  bounds: boolean
  api: boolean
}

export function NetCaption({ drawn, near, edge, said, called, bounds, api }: Props) {
  const links = (id: string, way: "from" | "to") =>
    (drawn?.wires ?? []).filter((w) => w[way] === id).length

  return (
    // fixed height: a caption that grows on hover moves the graph under the cursor
    <p className="text-muted-foreground min-h-10 text-xs">
      {edge && !near ? (
        <>
          <span className="text-foreground font-mono">{shortPath(edge.from, 42)}</span> to{" "}
          <span className="text-foreground font-mono">{shortPath(edge.to, 42)}</span> ·{" "}
          {said(edge).join(" · ")}
          {edge.held > 1 && <> · {plural(edge.held, "pair")} bundled</>} · click to open it
        </>
      ) : near ? (
        <>
          <span className="text-foreground font-mono">{near.label}</span>
          {near.box && <> in {called.get(near.box) ?? near.box}</>} · {plural(near.weight, "line")}{" "}
          · {plural(links(near.id, "from"), "link")} out, {links(near.id, "to")} in · click to read
          it or follow it
        </>
      ) : drawn ? (
        <>
          {plural(drawn.spots.length, "node")} and {plural(drawn.wires.length, "link")},{" "}
          {bounds
            ? "each inside the module holding it, click a module name to keep only it"
            : "arranged loose, since bounds are off"}
          . Drag or one finger to move, wheel or pinch to zoom, hover to keep only what one touches.
          An import bows one way and a call the other, so a pair with both shows both.
          {api && (
            <>
              {" "}
              <span style={{ color: `rgb(${REQUEST})` }}>Red and dashed</span> is an http request
              from a call site to the file serving that path: the one edge here that crosses a repo,
              and the one nothing in either repo binds together.{" "}
            </>
          )}
          A faint line is a type only import, and{" "}
          {drawn.wires.length > HEADS
            ? "arrows are drawn on hover only at this size"
            : "the arrow sits at the end it arrives at"}
          . {drawn.passes < 60 && `Laid out in ${drawn.passes} passes, fewer than usual for size.`}
        </>
      ) : (
        "Nothing to draw yet."
      )}
    </p>
  )
}
