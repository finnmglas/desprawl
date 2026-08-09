// owner: finn
// goal: the brand mark for a label, when we have one

import { BRANDS } from "../lib/brands.ts"
import { useDisplay } from "../lib/display.tsx"
import { tint } from "../lib/tint.ts"
import { cn } from "../lib/ui.ts"

/** the glyph alone, in whatever colour it inherits */
export function Glyph({ label, className }: { label: string; className?: string }) {
  const { brands } = useDisplay()
  const path = BRANDS[label]?.[2]
  if (!path || brands === "off") return null
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-3 shrink-0 fill-current", className)}>
      <path d={path} />
    </svg>
  )
}

/** the glyph in its own colour, for a row that keeps the page's background */
export function Mark({ label }: { label: string }) {
  const { brands } = useDisplay()
  const brand = brands === "on" && BRANDS[label]
  // a language we have no colour for still gets a chip, in grey
  if (!brand) return <span className="bg-muted-foreground/40 size-2.5 shrink-0 rounded-[3px]" />
  const path = brand[2]
  return path ? (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-3.5 shrink-0"
      style={{ fill: tint(label) }}
    >
      <path d={path} />
    </svg>
  ) : (
    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: tint(label) }} />
  )
}

// a filled folder and a page with a turned corner, drawn here rather than depended on
const FOLDER = "M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"
const FILE = "M6 2h8l6 6v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V9h5.5L14 3.5Z"

/** what a row is, in the colour of what it holds */
export function Kind({ folder, lang }: { folder: boolean; lang: string }) {
  const { brands } = useDisplay()
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-3.5 shrink-0 opacity-80"
      style={{ fill: brands === "on" ? tint(lang) : "var(--muted-foreground)" }}
    >
      <title>{folder ? `mostly ${lang || "mixed"}` : lang || "no known language"}</title>
      <path d={folder ? FOLDER : FILE} />
    </svg>
  )
}
