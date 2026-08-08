// owner: finn
// goal: light, dark, system, plus ctrl shift d

import { useEffect, useState } from "react"

export type Theme = "light" | "dark" | "system"
export const THEMES: Theme[] = ["light", "dark", "system"]

const KEY = "desprawl-theme"
const DARK = "(prefers-color-scheme: dark)"

export interface ThemeState {
  theme: Theme
  /** What is actually on screen, system already answered. */
  resolved: "light" | "dark"
  setTheme: (theme: Theme) => void
}

export function useTheme(theme: Theme, setTheme: (theme: Theme) => void): ThemeState {
  const [prefersDark, setPrefersDark] = useState(() => matchMedia(DARK).matches)

  useEffect(() => {
    const media = matchMedia(DARK)
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark")
    localStorage.setItem(KEY, theme) // the pre paint script in index.html reads this one
  }, [resolved, theme])

  return { theme, resolved, setTheme }
}

const typing = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

/** Ctrl shift d flips light and dark, never while somebody is typing. */
export function useThemeHotkey({ resolved, setTheme }: ThemeState): void {
  useEffect(() => {
    let latched = false

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return
      // code is the physical key, key is what the layout produced, either alone misses someone
      if (event.code !== "KeyD" && event.key.toLowerCase() !== "d") return
      if (typing(event.target)) return
      event.preventDefault()
      if (event.repeat || latched) return
      latched = true
      setTheme(resolved === "dark" ? "light" : "dark")
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyD" || event.key.toLowerCase() === "d") latched = false
    }

    addEventListener("keydown", onKeyDown)
    addEventListener("keyup", onKeyUp)
    return () => {
      removeEventListener("keydown", onKeyDown)
      removeEventListener("keyup", onKeyUp)
    }
  }, [resolved, setTheme])
}
