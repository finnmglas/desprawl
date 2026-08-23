// owner: finn
// goal: view state in the url, so back and links work

import { useEffect, useState } from "react"

export type View = {
  tab: string
  path: string[]
  lang: string
  kind: string // code, comment or blank
  from: string
  to: string
  pick: string // file, folder, group or file#name
  panel: string // section to land on
  dialog: string // the one opened over the page, so it can be linked to and reloaded into
}

const MOVED: Record<string, [string, string]> = {
  Files: ["Overview", "tree_files"],
  History: ["Overview", "history_commits"],
  Modules: ["Graph", "table_modules"],
  Execution: ["Graph", "table_declarations"],
}

/** the tab and panel a name that used to be a tab of its own means now, for a link that
 *  still calls it by that name. Sending somebody to `tab=History` sends them nowhere */
export const whereIs = (name: string): [string, string] | undefined => MOVED[name]

// every move counts, the ones landing where you already stand included: a card that says
// it opens a panel has to take you there again, however many times you ask it to
let moves = 0

const read = (fallback: View): View => {
  const q = new URLSearchParams(location.hash.slice(1))
  const asked = q.get("tab") || fallback.tab
  const moved = MOVED[asked]
  return {
    tab: moved ? moved[0] : asked,
    path: (q.get("path") || "").split("/").filter(Boolean),
    lang: q.get("lang") || "",
    kind: q.get("kind") || "",
    from: q.get("from") || "",
    to: q.get("to") || "",
    pick: q.get("pick") || "",
    panel: q.get("panel") || (moved ? moved[1] : ""),
    dialog: q.get("dialog") || "",
  }
}

const write = (view: View): string => {
  const q = new URLSearchParams()
  q.set("tab", view.tab)
  if (view.path.length) q.set("path", view.path.join("/"))
  if (view.lang) q.set("lang", view.lang)
  if (view.kind) q.set("kind", view.kind)
  if (view.from) q.set("from", view.from)
  if (view.to) q.set("to", view.to)
  if (view.pick) q.set("pick", view.pick)
  if (view.panel) q.set("panel", view.panel)
  if (view.dialog) q.set("dialog", view.dialog)
  return `#${q}`
}

// the entry behind this one, so back can name where it goes
const behind = (): View | null => (history.state as { from?: View } | null)?.from ?? null

export function useView(initial: View): [View, (next: Partial<View>) => void, View | null, number] {
  const [view, setView] = useState(() => read(initial))
  const [was, setWas] = useState<View | null>(behind)
  const [went, setWent] = useState(0)

  useEffect(() => {
    // fires after popstate, so history.state is already the entry landed on
    const onPop = () => {
      setView(read(initial))
      setWas(behind())
      setWent(++moves)
    }
    addEventListener("hashchange", onPop)
    return () => removeEventListener("hashchange", onPop)
  }, [initial])

  const go = (next: Partial<View>) => {
    const merged = { ...view, ...next }
    setView(merged)
    setWas(view)
    history.pushState({ from: view }, "", write(merged))
    // asking for a panel is a move to it, whether or not it is the one already named
    if (next.panel !== undefined) setWent(++moves)
  }

  return [view, go, was, went]
}
