// owner: finn
// goal: three way switch, with the two way one on top of it

import { useState } from "react"
import { Menu, MenuItem } from "./menu.tsx"
import { THEMES, type ThemeState } from "../lib/theme.tsx"

const Sun = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

const Moon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
)

// ctrl click flips without opening
export function ThemeToggle({ theme, resolved, setTheme }: ThemeState) {
  const [flip, setFlip] = useState(0)

  return (
    <Menu
      key={flip}
      trigger={resolved === "dark" ? <Moon /> : <Sun />}
      title="Theme. Ctrl click to switch light and dark, Ctrl Shift D from anywhere"
      onTriggerClick={(event) => {
        if (!event.ctrlKey && !event.metaKey) return false
        setTheme(resolved === "dark" ? "light" : "dark")
        setFlip((n) => n + 1)
        return true // handled, do not open
      }}
    >
      {THEMES.map((name) => (
        <MenuItem key={name} onClick={() => setTheme(name)}>
          <span className="w-4">{theme === name ? "✓" : ""}</span>
          {name}
        </MenuItem>
      ))}
    </Menu>
  )
}
