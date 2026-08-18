// owner: finn
// goal: what an agent said and did, in the order it happened

import { cn } from "../../../lib/app/ui.ts"
import type { Turn } from "../../../../src/serve/talk.ts"

const MARK: Record<Turn["who"], string> = {
  you: "›",
  agent: "⏺",
  tool: "⎿",
  note: "!",
}

const TONE: Record<Turn["who"], string> = {
  you: "text-foreground",
  agent: "text-foreground",
  tool: "text-muted-foreground",
  note: "text-amber-600 dark:text-amber-400",
}

export function Transcript({ turns, className }: { turns: Turn[]; className?: string }) {
  if (!turns.length) return <p className="text-muted-foreground px-1 text-xs">nothing said yet</p>
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {turns.map((turn, at) => (
        <div key={at} className={cn("flex gap-2 text-xs", TONE[turn.who])}>
          <span className="w-3 shrink-0 opacity-60">{MARK[turn.who]}</span>
          {turn.tool ? (
            <span className="min-w-0 truncate">
              <span className="font-medium">{turn.tool}</span>
              <span className="opacity-70">({turn.text})</span>
            </span>
          ) : (
            <span className="min-w-0 break-words whitespace-pre-wrap">{turn.text}</span>
          )}
        </div>
      ))}
    </div>
  )
}
