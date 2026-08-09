// owner: finn
// goal: fact, explanation, and where it came from

import { Badge } from "./badge.tsx"
import { Glyph } from "./mark.tsx"
import { Tip } from "./tip.tsx"
import { BRANDS } from "../lib/brands.ts"
import { useDisplay } from "../lib/display.tsx"
import { cn } from "../lib/ui.ts"
import { SITES } from "../lib/sites.ts"
import { NOTES } from "../../src/notes.ts"

/** "Next.js" and "Claude Code 658" both find the note, and the mark, for Claude Code */
export function Chip({ label, from }: { label: string; from?: string }) {
  const { brands } = useDisplay()
  const name = BRANDS[label] ? label : label.replace(/\s+\S+$/, "")
  const brand = brands === "on" && BRANDS[name]
  // the ink is picked for the brand colour, so the theme does not decide it.
  // the colour itself comes down a little on dark, where full saturation glares
  const paint = brand
    ? ({ "--brand": `#${brand[0]}`, color: `#${brand[1]}` } as React.CSSProperties)
    : undefined

  const href = from ? `https://www.npmjs.com/package/${from}` : SITES[name]

  const badge = (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 font-normal",
        brand && "bg-[var(--brand)] dark:bg-[color-mix(in_oklab,var(--brand),black_22%)]",
      )}
      style={paint}
    >
      <Glyph label={name} />
      {label}
    </Badge>
  )

  return (
    <Tip
      text={
        from
          ? `${NOTES[label] ?? NOTES[name] ?? ""} · from ${from}`.trim()
          : (NOTES[label] ?? NOTES[name])
      }
    >
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {badge}
        </a>
      ) : (
        badge
      )}
    </Tip>
  )
}
