// owner: finn
// goal: language bar + pickable list

import { Card, CardContent, CardHeader, CardTitle } from "./card.tsx"
import { tint } from "../lib/tint.ts"
import { num } from "../lib/format.ts"
import { cn } from "../lib/ui.ts"

export interface DistributionProps {
  title: string
  /** Language to loc for the current scope. */
  langs: Record<string, number>
  /** Currently highlighted language, if any. */
  selected: string
  onSelect: (lang: string) => void
}

export function Distribution({ title, langs, selected, onSelect }: DistributionProps) {
  const entries = Object.entries(langs).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, loc]) => sum + loc, 0)

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
              onClick={() => onSelect(lang === selected ? "" : lang)}
              className="cursor-pointer transition-opacity hover:opacity-80"
              style={{
                width: `${(loc / (total || 1)) * 100}%`,
                background: tint(lang),
                opacity: selected && selected !== lang ? 0.25 : 1,
              }}
            />
          ))}
        </div>

        <ul className="divide-border flex flex-col divide-y text-sm">
          {entries.map(([lang, loc]) => (
            <li key={lang}>
              <button
                onClick={() => onSelect(lang === selected ? "" : lang)}
                className={cn(
                  "hover:bg-muted/50 flex w-full cursor-pointer items-center gap-2 px-1 py-1.5 text-left",
                  lang === selected && "bg-muted/70",
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: tint(lang) }}
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
      </CardContent>
    </Card>
  )
}
