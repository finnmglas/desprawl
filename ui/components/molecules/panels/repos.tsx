// owner: finn
// goal: which repos in the folder the page is about

import { Button } from "../../atoms/button.tsx"
import { Menu, MenuSection } from "../menu.tsx"
import { cn } from "../../../lib/app/ui.ts"

interface Props {
  /** every repo in the folder, and the ones being read: none means all of them */
  all: string[]
  chosen: string[]
  onChange: (next: string[]) => void
}

export function Repos({ all, chosen, onChange }: Props) {
  const every = chosen.length === 0 || chosen.length === all.length
  const held = every ? all : chosen
  const said = every
    ? "every repo"
    : held.length === 1
      ? held[0]
      : `${held.length} of ${all.length} repos`

  // unticking the last one would leave a page about nothing, so it reads as all of them
  const toggle = (one: string) => {
    const next = held.includes(one) ? held.filter((held_) => held_ !== one) : [...held, one]
    onChange(next.length === all.length || !next.length ? [] : next)
  }

  return (
    <Menu
      wide
      className="shrink-0"
      title="Which repos this page is about"
      trigger={
        <span className="flex max-w-40 items-center gap-1.5">
          <span className="truncate">{said}</span>
          <span className="text-muted-foreground">▾</span>
        </span>
      }
    >
      {(close) => (
        <MenuSection label="Repos" hint="tick to compare, the arrow opens one on its own">
          <div className="flex flex-col">
            <button
              onClick={() => {
                onChange([])
                close()
              }}
              className={cn(
                "hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                every ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="w-3">{every ? "✓" : ""}</span>
              every repo
            </button>
            {all.map((one) => (
              <span key={one} className="flex items-center gap-1">
                <button
                  onClick={() => toggle(one)}
                  title={held.includes(one) ? `leave ${one} out` : `read ${one} too`}
                  className={cn(
                    "hover:bg-muted flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                    held.includes(one) ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px]",
                      held.includes(one) &&
                        !every &&
                        "bg-foreground/85 text-background border-transparent",
                      held.includes(one) && every && "border-foreground/50",
                    )}
                  >
                    {held.includes(one) ? "✓" : ""}
                  </span>
                  <span className="truncate">{one}</span>
                </button>
                {/* the whole page about this one, which is a different thing from ticking it */}
                <Button
                  variant="ghost"
                  size="icon"
                  title={`only ${one}`}
                  className="size-7 shrink-0"
                  onClick={() => {
                    onChange([one])
                    close()
                  }}
                >
                  →
                </Button>
              </span>
            ))}
          </div>
        </MenuSection>
      )}
    </Menu>
  )
}
