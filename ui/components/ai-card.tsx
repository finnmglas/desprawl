// owner: finn
// goal: show which assistants touched repo

import { Badge } from "./badge.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./card.tsx"
import { CopyButton } from "./copy-button.tsx"
import { Tip } from "./tip.tsx"
import { num, pct } from "../lib/format.ts"
import { HINTS } from "../lib/hints.ts"
import { NOTES } from "../../src/notes.ts"
import type { Ai } from "../../src/stack.ts"

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
      <CardHeader className="flex-row flex-wrap items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle>Assistance</CardTitle>
          <span className="text-muted-foreground text-xs">
            {rows.length ? share : "no assistant left a trace here"}
          </span>
        </div>
        {rows.length > 0 && (
          <CopyButton
            className="ml-auto"
            text={() => rows.map(([label, items]) => `${label}: ${items.join(", ")}`).join("\n")}
            message="Assistance copied"
            note="Tools, signatures and rule files"
          />
        )}
      </CardHeader>

      {rows.length > 0 && (
        <CardContent className="flex flex-wrap gap-x-10 gap-y-3 pt-1">
          {rows.map(([label, items]) => (
            <div key={label} className="flex flex-wrap items-center gap-2">
              <Tip text={HINTS[label]} className="text-muted-foreground text-xs">
                {label}
              </Tip>
              {items.map((item) => (
                <Tip key={item} text={NOTES[item.split(" ")[0]]}>
                  <Badge variant="secondary" className="font-normal">
                    {item}
                  </Badge>
                </Tip>
              ))}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}
