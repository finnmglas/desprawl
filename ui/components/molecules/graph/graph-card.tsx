// owner: finn
// goal: the framed drawing, its legend and the two buttons over it

import type { ReactNode, RefObject } from "react"
import { Button } from "../../atoms/button.tsx"
import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { num } from "../../../lib/text/format.ts"
import type { Grain } from "../../../lib/draw/network.ts"

interface Props {
  grain: Grain
  bounds: boolean
  legend: { label: string; colour: string | null }[]
  /** whether anything is drawn yet, since an empty legend is not the same as none */
  drawn: boolean
  /** the module kept alone, and how it is named on the button that clears it */
  only: string
  named: string
  onClear: () => void
  onFit: () => void
  /** too many nodes to lay out unasked */
  heavy: boolean
  size: number
  onAnyway: () => void
  frame: RefObject<HTMLDivElement | null>
  board: ReactNode
}

export function GraphCard(props: Props) {
  const { grain, bounds, legend, drawn, only, named, heavy, size, frame, board } = props
  return (
    <Card>
      <CardHead
        title="Graph"
        hint={
          !bounds
            ? "no bounds, so the whole graph arranges itself and the modules show as colour"
            : grain === "module"
              ? "every module a box, sitting on the level its imports put it on"
              : grain === "file"
                ? "every file a dot, bounded by the module holding it"
                : "every declaration a dot, bounded by its file, bounded by its module"
        }
        wrap
      >
        <div className="ml-auto flex items-center gap-1">
          {only && (
            <Button variant="outline" size="sm" onClick={props.onClear}>
              {named} ✕
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={props.onFit}>
            fit
          </Button>
        </div>
      </CardHead>
      <CardContent>
        {/* what the colours mean, said where the drawing is rather than in a menu */}
        {!!drawn && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {legend.map((one) => (
              <span key={one.label} className="flex items-center gap-1.5 text-xs">
                <span
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ background: one.colour ?? "var(--muted-foreground)" }}
                />
                <span className="text-muted-foreground">{one.label}</span>
              </span>
            ))}
          </div>
        )}
        <div ref={frame} className="w-full">
          {heavy ? (
            <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-3 text-sm">
              <span>
                {num(size)} nodes at this grain. Laying that out takes a while, and reading it takes
                longer.
              </span>
              <Button variant="outline" size="sm" onClick={props.onAnyway}>
                draw it anyway
              </Button>
            </div>
          ) : (
            board
          )}
        </div>
      </CardContent>
    </Card>
  )
}
