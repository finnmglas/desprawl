// owner: finn
// goal: show which assistants touched repo

import { Card, CardContent } from "./card.tsx"
import { Chip } from "./chip.tsx"
import { CardHead } from "./card-head.tsx"
import { CopyButton } from "./copy-button.tsx"
import { Tip } from "./tip.tsx"
import { num, pct } from "../lib/format.ts"
import { HINTS } from "../lib/hints.ts"
import type { Ai } from "../../src/model.ts"

/** The rows, shared by the panel and the copy */
function describe(ai: Ai): [string, string[]][] {
  const rows: [string, string[]][] = [
    ["Assistants", ai.tools],
    [
      "Signed",
      Object.entries(ai.by)
        .sort((a, b) => b[1] - a[1])
        .map(([tool, n]) => `${tool} ${num(n)}`),
    ],
    ["Rules", Object.entries(ai.files).map(([file, n]) => (n > 1 ? `${file} ×${n}` : file))],
  ]
  return rows.filter(([, items]) => items.length)
}

export function AiCard({ ai }: { ai: Ai }) {
  const rows = describe(ai)
  const share = ai.scanned
    ? `${num(ai.signed)} of ${num(ai.scanned)}${ai.capped ? " read" : ""} commits signed, ${pct(ai.signed, ai.scanned)}`
    : "no history to read"

  return (
    <Card>
      <CardHead
        title="Assistance"
        hint={rows.length ? share : "no assistant left a trace here"}
        wrap
      >
        {rows.length > 0 && (
          <CopyButton
            className="ml-auto"
            text={() => rows.map(([label, items]) => `${label}: ${items.join(", ")}`).join("\n")}
            message="Assistance copied"
            note="Tools, signatures and rule files"
          />
        )}
      </CardHead>

      {/* nothing to list still needs a floor, or the card ends on its header */}
      {rows.length === 0 && <div className="pb-4" />}
      {rows.length > 0 && (
        <CardContent className="flex flex-wrap gap-x-10 gap-y-3 pt-1">
          {rows.map(([label, items]) => (
            <div key={label} className="flex flex-wrap items-center gap-2">
              <Tip text={HINTS[label]} className="text-muted-foreground text-xs">
                {label}
              </Tip>
              {items.map((item) => (
                <Chip key={item} label={item} />
              ))}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
