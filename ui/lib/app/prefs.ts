// owner: finn
// goal: settings

import type { Brands, Curve, Scale, Shown } from "./display.tsx"
import type { Choice } from "../say/locale.ts"
import type { Theme } from "./theme.tsx"

export interface Prefs {
  theme: Theme
  scale: Scale
  curve: Curve
  region: Choice
  brands: Brands
  /** how many rows every table shows before it folds, scrolls or prints the lot */
  rows: Shown
  /** open by default: it answers what is this repo */
  metadata: boolean
  /** what the fix panel was last set to: nobody picks a different cli every time */
  agent: { install: string; model: string; mode: string; trust: string }
  /** section ids folded away by the eye toggle, reactivated from the tab's footer */
  hidden: string[]
  /** each tab's sections, in the order the move arrows left them */
  order: Record<string, string[]>
}

export const FALLBACK: Prefs = {
  theme: "system",
  scale: "simple",
  curve: "linear",
  region: "auto",
  brands: "flashy",
  rows: "virtual",
  metadata: true,
  agent: { install: "", model: "", mode: "local", trust: "auto" },
  hidden: [],
  order: {},
}

const KEY = "desprawl-prefs"
const token = () => new URLSearchParams(location.search).get("t")

/** settings saved before a choice existed, kept meaning what they meant then */
const mended = (saved: Partial<Prefs>): Partial<Prefs> =>
  (saved.brands as string) === "on" ? { ...saved, brands: "flashy" } : saved

// localStorage is per origin and the port moves, disk is the real one
export function readPrefs(): Prefs {
  try {
    return {
      ...FALLBACK,
      ...mended(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>),
    }
  } catch {
    return FALLBACK
  }
}

export async function pullPrefs(): Promise<Prefs | null> {
  const t = token()
  if (!t) return null // a static file has nowhere to ask
  try {
    const res = await fetch(`/api/prefs?t=${t}`)
    if (!res.ok) return null
    const saved = mended((await res.json()) as Partial<Prefs>)
    const merged = { ...readPrefs(), ...saved }
    localStorage.setItem(KEY, JSON.stringify(merged))
    return merged
  } catch {
    return null
  }
}

export function savePrefs(prefs: Prefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs))
  const t = token()
  if (!t) return
  void fetch(`/api/prefs?t=${t}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prefs),
  }).catch(() => {})
}
