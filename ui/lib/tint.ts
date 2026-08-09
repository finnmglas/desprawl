// owner: finn
// goal: one rule for what colour a label is drawn in

import { BRANDS } from "./brands.ts"

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** a near black mark vanishes on a dark page, and an unknown label has no colour to give */
export function tint(label: string): string {
  const hex = BRANDS[label]?.[0]
  if (!hex) return "var(--muted-foreground)"
  const luminance = [0, 2, 4]
    .map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
  return luminance > 0.05 ? `#${hex}` : "currentColor"
}

/** the language a folder is mostly written in */
export const mainly = (langs: Record<string, number>): string =>
  Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
