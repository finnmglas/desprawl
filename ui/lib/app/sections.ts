// owner: finn
// goal: which section ids exist per tab, their order, and which are hidden right now

import { useSyncExternalStore } from "react"
import { readPrefs, savePrefs, type Prefs } from "./prefs.ts"

/** one panel: where it lives, what it is called, and what someone would search for it by */
export interface Panel {
  id: string
  tab: string
  /** which view mounts it, so searching mounts only the views it needs */
  view: string
  title: string
  words: string
}

// must match the Section ids used in ui/views/*.tsx, in the order each tab shows them
// prettier-ignore
export const PANELS: Panel[] = [
  { id: "kpis_overview", tab: "Overview", view: "Overview", title: "Summary",              words: "lines of code loc sloc comments blank tokens chars commits size summary how big overview kpi numbers" },
  { id: "system_overview", tab: "Overview", view: "Overview", title: "Project architecture", words: "architecture modules services layers levels entrypoints stack frameworks metadata licence license structure diagram c4 system" },
  { id: "timeline_overview", tab: "Overview", view: "Overview", title: "Timeline",             words: "timeline over time chart history graph commits churn devs net lines growth activity hour day week month year when" },
  { id: "tree_files", tab: "Overview", view: "Overview", title: "Files",                words: "files file tree folders directories explorer browse languages loc size spread nesting paths" },
  { id: "table_languages", tab: "Overview", view: "Overview", title: "Languages",            words: "languages language typescript javascript python rust go java loc per language polyglot" },
  { id: "table_contributors", tab: "Overview", view: "Overview", title: "Contributors",         words: "contributors people authors devs developers who wrote ownership churn identities email names team" },
  { id: "history_commits", tab: "Overview", view: "Overview", title: "History",              words: "history commits log git branch rails messages hashes authors when changed revisions" },
  { id: "ai_overview", tab: "Overview", view: "Overview", title: "Assistance",           words: "ai assistant assistants claude copilot cursor codex agent generated signed rules instructions" },
  { id: "table_deps", tab: "Overview", view: "Overview", title: "External dependencies",words: "dependencies deps packages libraries licence licences license licenses advisories vulnerabilities security cve versions outdated npm cargo pypi registry supply chain third party external" },
  { id: "card_tests", tab: "Overview", view: "Overview", title: "Tests",                words: "tests test suite coverage cases spec specs vitest jest pytest run green" },
  { id: "actions_overview", tab: "Overview", view: "Overview", title: "Actions",              words: "actions run scripts commands git pull push fetch build dev servers tasks npm pnpm" },

  { id: "network_graph", tab: "Graph", view: "Network", title: "Graph",                   words: "graph picture map drawing dots nodes wires edges imports calls grain force layout visual network diagram" },
  { id: "table_endpoints", tab: "Graph", view: "Network", title: "Endpoints served here",   words: "api endpoints routes http rest url urls paths handlers controllers views serves server routing router get post put patch delete" },
  { id: "table_requests", tab: "Graph", view: "Network", title: "Call sites",              words: "api requests call sites fetch axios http client calls out endpoints consumed reaches outside third party" },
  { id: "kpis_modules_imports", tab: "Graph", view: "Modules", title: "Imports",                 words: "imports import edges dependencies resolution external depth per file coupling" },
  { id: "kpis_modules_groups", tab: "Graph", view: "Modules", title: "Module groups",           words: "modules module groups levels cohesion depth auto grouping structure layers" },
  { id: "table_modules", tab: "Graph", view: "Modules", title: "Module groups",           words: "modules module groups folders units files owner imports levels structure boundaries" },
  { id: "card_dependency_grid", tab: "Graph", view: "Modules", title: "Dependency grid",         words: "dependency grid matrix adjacency who imports whom cells coupling structure" },
  { id: "card_dependency_levels", tab: "Graph", view: "Modules", title: "Dependency levels",       words: "dependency levels layers stack bands order topological depth architecture" },
  { id: "table_cycles", tab: "Graph", view: "Modules", title: "Cycles",                  words: "cycles cycle loops circular dependencies rings tangles import loop" },
  { id: "card_loops", tab: "Graph", view: "Modules", title: "Folders that import each other", words: "cycles loops rings circular folders that import each other tangles" },
  { id: "table_loop_cuts", tab: "Graph", view: "Modules", title: "Imports to remove",       words: "cuts cut break cycles loops circular fix untangle imports to remove" },
  { id: "kpis_execution_general", tab: "Graph", view: "Execution", title: "Declarations and calls",  words: "declarations functions classes components calls call graph resolution unreachable execution reach" },
  { id: "kpis_execution_reach", tab: "Graph", view: "Execution", title: "Reach",                   words: "reach reachable only exported most called recursion repeated names hotspots execution" },
  { id: "table_declarations", tab: "Graph", view: "Execution", title: "Declarations",            words: "declarations functions classes components symbols callers calls lines hotspots execution call graph" },
  { id: "table_unreachable", tab: "Graph", view: "Execution", title: "Nothing arrives at these", words: "unreachable dead code unused orphan never called delete remove entry points reach" },
  { id: "table_only_exported", tab: "Graph", view: "Execution", title: "Only exported",           words: "only exported public surface api handed out never called here unused exports" },
  { id: "table_unresolved", tab: "Graph", view: "Execution", title: "Calls we could not place", words: "unresolved calls we could not place global dynamic unknown missing" },
  { id: "table_repeated_names", tab: "Graph", view: "Execution", title: "Repeated names",          words: "repeated duplicate names same name several files duplication copies" },
  { id: "card_recursion", tab: "Graph", view: "Execution", title: "Recursion",               words: "recursion recursive rings declarations call each other cycles" },

  { id: "kpis_tasks", tab: "Tasks", view: "Tasks", title: "Tasks",                   words: "tasks work cleanup estimate effort mechanical reaches todo backlog" },
  { id: "card_agents", tab: "Tasks", view: "Tasks", title: "Hand it to an agent",     words: "agent agents ai claude fix run automate hand it over cleanup" },
  { id: "table_tasks", tab: "Tasks", view: "Tasks", title: "What there is to do",     words: "tasks work cleanup todo backlog estimate effort what to do" },
]

const BY_ID = new Map(PANELS.map((one) => [one.id, one]))
export const panelOf = (id: string): Panel | undefined => BY_ID.get(id)

export const TAB_SECTIONS: Record<string, string[]> = PANELS.reduce<Record<string, string[]>>(
  (all, one) => ({ ...all, [one.tab]: [...(all[one.tab] ?? []), one.id] }),
  {},
)

export const tabOf = (id: string): string => BY_ID.get(id)?.tab ?? ""

/** whether a tab holds anything this search could show */
export const onTab = (said: string, tab: string): boolean =>
  PANELS.some((one) => one.tab === tab && hits(one, said))

/** the views a tab is drawn from */
export const viewsOf = (tab: string): string[] => [
  ...new Set(PANELS.filter((one) => one.tab === tab).map((one) => one.view)),
]

/** which views a search needs mounted, so a query never builds a graph it will not show */
export const viewsFor = (said: string): Set<string> =>
  new Set(PANELS.filter((one) => hits(one, said)).map((one) => one.view))

/** every word typed has to appear somewhere in the panel */
export const hits = (panel: Panel, said: string): boolean => {
  const hay = `${panel.title} ${panel.words} ${panel.id} ${panel.tab}`.toLowerCase()
  return said
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

/** drift-repaired: gone ids drop out, new ones land at the end */
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

const huntStore = liveStore("")

/** what is typed into the panel search, empty when it is closed */
export const useHunt = (): string => huntStore.use()
export const hunt = (said: string): void => huntStore.set(said)

// a panel that matched but does not exist in this repo never mounts, so the count of
// answers is the count of what is actually on the page
const onScreen = new Set<string>()
const shownStore = liveStore(0)
export const useShownCount = (): number => shownStore.use()
export const showing = (id: string, on: boolean): void => {
  if (on === onScreen.has(id)) return
  on ? onScreen.add(id) : onScreen.delete(id)
  shownStore.set(onScreen.size)
}

const draggedStore = liveStore<string | null>(null)
const dropStore = liveStore<{ before: string; after: boolean } | null>(null)
const landedStore = liveStore<string | null>(null)

/** the id a link just scrolled to */
export const useLanded = (): string | null => landedStore.use()

const LANDED_MS = 2000
let clearing: ReturnType<typeof setTimeout> | undefined

/** ring a panel, briefly */
export function land(id: string | null): void {
  clearTimeout(clearing)
  landedStore.set(id)
  if (id) clearing = setTimeout(() => landedStore.set(null), LANDED_MS)
}

/** the id being dragged, so its own card can grey out where it used to sit */
export const useDragging = (): string | null => draggedStore.use()
/** distinct from where the drag started, which stays put */
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

/** so a reset only offers itself when it would change something */
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

/** swaps past the nearest visible neighbour, so a hidden one is not a step */
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
