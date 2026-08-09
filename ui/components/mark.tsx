// owner: finn
// goal: the brand mark for a label, when we have one

import { File, Folder } from "./icons.tsx"
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

/** what a row is, in the colour of what it holds */
export function Kind({ folder, lang }: { folder: boolean; lang: string }) {
  const { brands } = useDisplay()
  const Shape = folder ? Folder : File
  return (
    <span
      title={folder ? `mostly ${lang || "mixed"}` : lang || "no known language"}
      className="flex opacity-80"
      style={{ color: brands === "on" ? tint(lang) : "var(--muted-foreground)" }}
    >
      <Shape />
    </span>
  )
}
