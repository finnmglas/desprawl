// owner: finn
// goal: fact, explanation, and where it came from

import { Badge } from "../atoms/badge.tsx"
import { Glyph } from "./mark.tsx"
import { Tip } from "../atoms/tip.tsx"
import { BRANDS } from "../../lib/brands.ts"
import { useDisplay } from "../../lib/display.tsx"
import { cn } from "../../lib/ui.ts"
import { SITES } from "../../lib/sites.ts"
import { REGISTRIES, linkTo } from "../../../src/registries.ts"
import { NOTES } from "../../../src/notes.ts"

/** "Next.js" and "Claude Code 658" both find the note, and the mark, for Claude Code */
export function Chip({
  label,
  from,
  registry,
  href: given,
  note,
}: {
  label: string
  from?: string
  /** the registry the package lives in, since not every one of them is npm */
  registry?: string
  /** where clicking it goes, when that is not the package or the project's own site */
  href?: string
  note?: string
}) {
  const { brands } = useDisplay()
  const name = BRANDS[label] ? label : label.replace(/\s+\S+$/, "")
  const brand = brands === "flashy" && BRANDS[name]
  // picked for the brand, and toned down on dark
  const paint = brand
    ? ({ "--brand": `#${brand[0]}`, color: `#${brand[1]}` } as React.CSSProperties)
    : undefined

  const href = (given ?? (from ? linkTo(from, registry || "npm") : "")) || SITES[name]

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
        note ??
        (from
          ? `${NOTES[label] ?? NOTES[name] ?? ""} · from ${from}${registry && registry !== "npm" ? ` on ${REGISTRIES[registry]?.label ?? registry}` : ""}`.trim()
          : (NOTES[label] ?? NOTES[name]))
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
