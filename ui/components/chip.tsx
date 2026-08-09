// owner: finn
// goal: fact + explanation

import { Badge } from "./badge.tsx"
import { Tip } from "./tip.tsx"
import { NOTES } from "../../src/notes.ts"

/** "Next.js" and "Claude Code 658" both find the note for Claude Code */
export function Chip({ label }: { label: string }) {
  return (
    <Tip text={NOTES[label] ?? NOTES[label.replace(/\s+\S+$/, "")]}>
      <Badge variant="secondary" className="font-normal">
        {label}
      </Badge>
    </Tip>
  )
}
