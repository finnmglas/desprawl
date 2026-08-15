// owner: finn
// goal: view state in the url, so back and links work

import { useEffect, useState } from "react"

export type View = {
  tab: string
  path: string[]
  lang: string
  /** which line kind the files tree is shaded by, mutually exclusive with lang */
  kind: string
  from: string
  to: string
  /** what the reader picked to get here: a file, a folder, a group or a file#name.
   * Every tab that can say something about it highlights it rather than opening blank */
  pick: string
  /** the section to land on, since a tab holds more panels than fit a screen */
  panel: string
}

const read = (fallback: View): View => {
  const q = new URLSearchParams(location.hash.slice(1))
  // Files became a panel on Overview, so a link written before that still lands on the tree
  const asked = q.get("tab") || fallback.tab
  return {
    tab: asked === "Files" ? "Overview" : asked,
    path: (q.get("path") || "").split("/").filter(Boolean),
    lang: q.get("lang") || "",
    kind: q.get("kind") || "",
    from: q.get("from") || "",
    to: q.get("to") || "",
    pick: q.get("pick") || "",
    panel: q.get("panel") || (asked === "Files" ? "tree_files" : ""),
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
  return `#${q}`
}

// the view that was current when this entry was pushed, so a back link can name where it
// goes without keeping a stack of its own: the browser already holds one
const behind = (): View | null => (history.state as { from?: View } | null)?.from ?? null

export function useView(initial: View): [View, (next: Partial<View>) => void, View | null] {
  const [view, setView] = useState(() => read(initial))
  const [was, setWas] = useState<View | null>(behind)

  useEffect(() => {
    // fires after popstate, so history.state is already the entry landed on
    const onPop = () => {
      setView(read(initial))
      setWas(behind())
    }
    addEventListener("hashchange", onPop)
    return () => removeEventListener("hashchange", onPop)
  }, [initial])

  const go = (next: Partial<View>) => {
    const merged = { ...view, ...next }
    setView(merged)
    setWas(view)
    history.pushState({ from: view }, "", write(merged))
  }

  return [view, go, was]
}
