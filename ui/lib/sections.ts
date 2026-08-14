// owner: finn
// goal: which section ids exist per tab, and which are hidden right now

import { useSyncExternalStore } from "react"
import { readPrefs, savePrefs } from "./prefs.ts"

// must match the Section ids used in ui/views/*.tsx
export const TAB_SECTIONS: Record<string, string[]> = {
  Overview: [
    "kpis_overview",
    "system_overview",
    "actions_overview",
    "timeline_overview",
    "table_languages",
    "table_contributors",
    "ai_overview",
    "card_tests",
    "table_deps",
  ],
  Modules: [
    "kpis_modules_imports",
    "kpis_modules_groups",
    "table_modules",
    "card_dependency_grid",
    "card_dependency_levels",
    "table_cycles",
    "card_loops",
    "table_loop_cuts",
  ],
  Execution: [
    "kpis_execution_general",
    "kpis_execution_reach",
    "table_declarations",
    "table_unreachable",
    "table_only_exported",
    "table_unresolved",
    "table_repeated_names",
    "card_recursion",
  ],
  History: ["history_commits"],
  Graph: ["network_graph"],
  Tasks: ["kpis_tasks", "card_agents", "table_tasks"],
  Files: ["tree_files", "distribution_languages"],
}

const listeners = new Set<() => void>()
let cache = readPrefs().hidden

/** a fresh disk pull can carry hidden ids from another device */
export function syncHidden(hidden: string[]): void {
  cache = hidden
  listeners.forEach((fn) => fn())
}

/** shared across every Section and the footer, so a reveal there shows here */
export function useHidden(): [string[], (id: string, on: boolean) => void] {
  const hidden = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => cache,
  )
  const set = (id: string, on: boolean) => {
    cache = on ? [...cache, id] : cache.filter((h) => h !== id)
    savePrefs({ ...readPrefs(), hidden: cache })
    listeners.forEach((fn) => fn())
  }
  return [hidden, set]
}
