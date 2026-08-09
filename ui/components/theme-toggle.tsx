// owner: finn
// goal: three way switch, with the two way one on top of it

import { useState } from "react"
import { Moon, Sun } from "./icons.tsx"
import { Menu, MenuItem } from "./menu.tsx"
import { THEMES, type ThemeState } from "../lib/theme.tsx"

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
