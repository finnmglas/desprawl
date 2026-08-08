// owner: finn
// goal: number modes

import { Card, CardContent } from "./card.tsx"
import { Tabs } from "./tabs.tsx"
import { CURVES, SCALES, type Curve, type Display, type Scale } from "../lib/display.tsx"

const EXPLAIN: Record<Scale, string> = {
  abs: "counts as they are",
  repo: "share of the column total",
  row: "share of the row's own lines",
}

export interface DisplayControlsProps extends Display {
  setScale: (scale: Scale) => void
  setCurve: (curve: Curve) => void
}

export function DisplayControls({ scale, curve, setScale, setCurve }: DisplayControlsProps) {
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-10 gap-y-4 p-3">
        {/* title, tabs, then the caption, so a longer caption cannot move the tabs */}
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs font-medium">Numbers</span>
          <Tabs tabs={SCALES} value={scale} onChange={(next) => setScale(next as Scale)} />
          <span className="text-muted-foreground h-4 text-xs whitespace-nowrap">
            {EXPLAIN[scale]}
          </span>
        </div>

        <div className="flex flex-col items-start gap-1">
          <span className="text-xs font-medium">Bar scale</span>
          <Tabs tabs={CURVES} value={curve} onChange={(next) => setCurve(next as Curve)} />
          <span className="text-muted-foreground h-4 text-xs whitespace-nowrap">
            {curve === "log" ? "small values stay visible" : "true proportions"}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
