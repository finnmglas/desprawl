// owner: finn
// goal: settings

import type { Curve, Scale } from "./display.tsx"
import type { Choice } from "./locale.ts"
import type { Theme } from "./theme.tsx"

export interface Prefs {
  theme: Theme
  scale: Scale
  curve: Curve
  region: Choice
}

export const FALLBACK: Prefs = { theme: "system", scale: "simple", curve: "linear", region: "auto" }

const KEY = "desprawl-prefs"
const token = () => new URLSearchParams(location.search).get("t")

// localStorage is per origin and the port moves, disk is the real one
export function readPrefs(): Prefs {
  try {
    return { ...FALLBACK, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) }
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
    const saved = (await res.json()) as Partial<Prefs>
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
