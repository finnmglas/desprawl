// owner: finn
// goal: view state in the url, so back and links work

import { useEffect, useState } from "react"

export type View = { tab: string; path: string[]; lang: string }

const read = (fallback: View): View => {
  const q = new URLSearchParams(location.hash.slice(1))
  return {
    tab: q.get("tab") || fallback.tab,
    path: (q.get("path") || "").split("/").filter(Boolean),
    lang: q.get("lang") || "",
  }
}

const write = (view: View): string => {
  const q = new URLSearchParams()
  q.set("tab", view.tab)
  if (view.path.length) q.set("path", view.path.join("/"))
  if (view.lang) q.set("lang", view.lang)
  return `#${q}`
}

export function useView(initial: View): [View, (next: Partial<View>) => void] {
  const [view, setView] = useState(() => read(initial))

  useEffect(() => {
    const onPop = () => setView(read(initial))
    addEventListener("hashchange", onPop)
    return () => removeEventListener("hashchange", onPop)
  }, [initial])

  const go = (next: Partial<View>) => {
    const merged = { ...view, ...next }
    setView(merged)
    history.pushState(null, "", write(merged))
  }

  return [view, go]
}
