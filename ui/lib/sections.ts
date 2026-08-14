// owner: finn
// goal: which section ids exist per tab, their order, and which are hidden right now

import { useSyncExternalStore } from "react"
import { readPrefs, savePrefs, type Prefs } from "./prefs.ts"

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

// which tab a section id belongs to, read off TAB_SECTIONS rather than passed in
const SECTION_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_SECTIONS).flatMap(([tab, ids]) => ids.map((id) => [id, tab])),
)
export const tabOf = (id: string): string => SECTION_TAB[id] ?? ""

/** a tab's ids in the order they were saved, drift-repaired: gone ids drop out,
 * a section added since keeps landing at the end instead of vanishing */
export function orderOf(tab: string, saved: Record<string, string[]>): string[] {
  const known = TAB_SECTIONS[tab] ?? []
  const kept = (saved[tab] ?? []).filter((id) => known.includes(id))
  return [...kept, ...known.filter((id) => !kept.includes(id))]
}

/** one prefs field, read once and kept live across every subscriber without a context */
function fieldStore<K extends keyof Prefs>(key: K) {
  const listeners = new Set<() => void>()
  let cache = readPrefs()[key]
  const notify = () => listeners.forEach((fn) => fn())
  return {
    sync(next: Prefs[K]) {
      cache = next
      notify()
    },
    get: () => cache,
    use(): [Prefs[K], (next: Prefs[K]) => void] {
      const value = useSyncExternalStore(
        (fn) => {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
        () => cache,
      )
      const set = (next: Prefs[K]) => {
        cache = next
        savePrefs({ ...readPrefs(), [key]: next })
        notify()
      }
      return [value, set]
    },
  }
}

/** ephemeral UI state, live across subscribers but never written to prefs */
function liveStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      listeners.forEach((fn) => fn())
    },
    use(): T {
      return useSyncExternalStore(
        (fn) => {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
        () => value,
      )
    },
  }
}

const draggedStore = liveStore<string | null>(null)
const dropStore = liveStore<{ before: string; after: boolean } | null>(null)

/** the id being dragged, so its own card can grey out where it used to sit */
export const useDragging = (): string | null => draggedStore.use()
/** which gap a drag is currently over, so a line can mark it, distinct from
 * where the drag started, since that card stays put until the drop lands */
export const useDropTarget = (): { before: string; after: boolean } | null => dropStore.use()

export const dragStart = (id: string) => draggedStore.set(id)
export const dragOver = (before: string, after: boolean) => {
  const dragging = draggedStore.get()
  if (!dragging || dragging === before) return
  dropStore.set({ before, after })
}

const hiddenStore = fieldStore("hidden")
const orderStore = fieldStore("order")

/** a fresh disk pull can carry hidden ids or an order from another device */
export const syncHidden = hiddenStore.sync
export const syncOrder = orderStore.sync

/** every tab back to its default panels, in their default order, in one go */
export function resetSections(): void {
  savePrefs({ ...readPrefs(), hidden: [], order: {} })
  hiddenStore.sync([])
  orderStore.sync({})
}

const isDefaultOrder = (tab: string, saved: string[]): boolean => {
  const known = TAB_SECTIONS[tab] ?? []
  return saved.length === known.length && saved.every((id, i) => id === known[i])
}

/** whether anything is hidden or out of its default order right now, so a reset
 * only offers itself when it would actually change something */
export function useCustomized(): boolean {
  const [hidden] = hiddenStore.use()
  const [order] = orderStore.use()
  if (hidden.length > 0) return true
  return Object.entries(order).some(([tab, saved]) => !isDefaultOrder(tab, saved))
}

/** shared across every Section and the footer, so a reveal there shows here */
export function useHidden(): [string[], (id: string, on: boolean) => void] {
  const [hidden, set] = hiddenStore.use()
  const toggle = (id: string, on: boolean) =>
    set(on ? [...hidden, id] : hidden.filter((h) => h !== id))
  return [hidden, toggle]
}

/** a tab's order, and a mover that swaps past the nearest still-visible neighbour, so
 * moving past sections hidden in between reads as one step rather than none.
 * takes hidden from the caller, which already reads it, rather than subscribing twice */
export function useOrder(tab: string, hidden: string[]) {
  const [all, set] = orderStore.use()
  const list = orderOf(tab, all)
  const move = (id: string, dir: -1 | 1) => {
    const visible = list.filter((one) => !hidden.includes(one))
    const at = visible.indexOf(id) + dir
    if (at < 0 || at >= visible.length) return
    const other = visible[at]
    const next = [...list]
    const i = next.indexOf(id)
    const j = next.indexOf(other)
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ ...all, [tab]: next })
  }
  /** the drop landed: place the dragged id at the last gap the pointer marked */
  const drop = () => {
    const id = draggedStore.get()
    const target = dropStore.get()
    draggedStore.set(null)
    dropStore.set(null)
    if (!id || !target || id === target.before) return
    const without = list.filter((one) => one !== id)
    const at = without.indexOf(target.before) + (target.after ? 1 : 0)
    if (at < 0) return // the gap belonged to another tab's drag
    set({ ...all, [tab]: [...without.slice(0, at), id, ...without.slice(at)] })
  }
  return { list, move, drop }
}
