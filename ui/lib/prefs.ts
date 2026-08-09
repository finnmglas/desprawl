// owner: finn
// goal: settings

import type { Brands, Curve, Scale } from "./display.tsx"
import type { Choice } from "./locale.ts"
import type { Theme } from "./theme.tsx"

export interface Prefs {
  theme: Theme
  scale: Scale
  curve: Curve
  region: Choice
  brands: Brands
}

export const FALLBACK: Prefs = {
  theme: "system",
  scale: "simple",
  curve: "linear",
  region: "auto",
  brands: "focus",
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
