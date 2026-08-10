// owner: finn
// goal: language bar + pickable list

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../atoms/card.tsx"
import { useDisplay } from "../../lib/display.tsx"
import { tint } from "../../lib/tint.ts"
import { num } from "../../lib/format.ts"
import { cn } from "../../lib/ui.ts"

export interface DistributionProps {
  title: string
  /** Language to loc for the current scope. */
  langs: Record<string, number>
  /** Currently highlighted language, if any. */
  selected?: string
  onSelect?: (lang: string) => void
  /** the colour of a slice, when it is not a language with a brand behind it */
  paint?: (key: string) => string
}

// a repo of forty languages is a list nobody reads, and the tail is all rounding
const FEW = 8

export function Distribution({
  title,
  langs,
  selected = "",
  onSelect,
  paint: given,
}: DistributionProps) {
  const [open, setOpen] = useState(false)
  const { brands } = useDisplay()
  const paint =
    given ?? ((lang: string) => (brands === "off" ? "var(--muted-foreground)" : tint(lang)))
  const entries = Object.entries(langs).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, loc]) => sum + loc, 0)
  // the bar always shows every language, only the list folds
  const listed = open ? entries : entries.slice(0, FEW)
  const hidden = entries.length - listed.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-3">
        <div className="flex h-2 overflow-hidden rounded-full">
          {entries.map(([lang, loc]) => (
            <button
              key={lang}
              title={`${lang} ${((loc / (total || 1)) * 100).toFixed(1)}%`}
              onClick={() => onSelect?.(lang === selected ? "" : lang)}
              className={cn("transition-opacity", onSelect && "cursor-pointer hover:opacity-80")}
              style={{
                width: `${(loc / (total || 1)) * 100}%`,
                background: paint(lang),
                opacity: selected && selected !== lang ? 0.25 : 1,
              }}
            />
          ))}
        </div>

        <ul className="divide-border flex flex-col divide-y text-sm">
          {listed.map(([lang, loc]) => (
            <li key={lang}>
              <button
                onClick={() => onSelect?.(lang === selected ? "" : lang)}
                className={cn(
                  "flex w-full items-center gap-2 px-1 py-1.5 text-left",
                  onSelect && "hover:bg-muted/50 cursor-pointer",
                  lang === selected && "bg-muted/70",
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: paint(lang) }}
                />
                <span className="truncate">{lang}</span>
                <span className="text-muted-foreground ml-auto tabular-nums">{num(loc)}</span>
                <span className="text-muted-foreground w-12 text-right tabular-nums">
                  {((loc / (total || 1)) * 100).toFixed(1)}%
                </span>
              </button>
            </li>
          ))}
        </ul>

        {entries.length > FEW && (
          <button
            onClick={() => setOpen(!open)}
            className="text-muted-foreground hover:text-foreground cursor-pointer text-left text-xs"
          >
            {open
              ? "show less"
              : `+${num(hidden)} more, ${((entries.slice(FEW).reduce((sum, [, loc]) => sum + loc, 0) / (total || 1)) * 100).toFixed(1)}% together`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
