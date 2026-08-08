// owner: finn
// goal: one view at a time
// inspo: shadcn

import * as React from "react"
import { cn } from "../lib/ui.ts"

export interface TabsProps {
  /** Tab keys in display order, rendered as their own labels. */
  tabs: string[]
  value: string
  onChange: (tab: string) => void
  className?: string
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn("bg-muted text-muted-foreground inline-flex gap-1 rounded-lg p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors",
            tab === value ? "bg-background text-foreground shadow-xs" : "hover:text-foreground",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
