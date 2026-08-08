// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
import { useState } from "react"
import { Tabs } from "./components/tabs.tsx"
import { Toaster, toast } from "./components/toast.tsx"
import { Explorer } from "./views/explorer.tsx"
import { Overview } from "./views/overview.tsx"
import "./styles/tokens.css"
import type { Stats } from "../src/model.ts"

// desprawl view swaps placeholder for data
declare global {
  interface Window {
    __DESPRAWL__?: Stats
  }
}

const TABS = ["Overview", "Explorer"]

function App({ stats }: { stats: Stats }) {
  const [tab, setTab] = useState(TABS[0])
  // path and lang live here so switching tabs keeps your place
  const [path, setPath] = useState<string[]>([])
  const [lang, setLang] = useState("")

  const explore = (picked: string) => {
    setLang(picked)
    setPath([])
    setTab("Explorer")
    toast(`Showing ${picked}`, "Each row is shaded by its share of that language")
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold">{stats.repo}</h1>
          <p className="text-muted-foreground text-xs">
            @{stats.head} · {stats.first.slice(0, 10)} to {stats.last.slice(0, 10)} ·{" "}
            {stats.commits.toLocaleString("en-US")} commits
          </p>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </header>

      {tab === "Overview" ? (
        <Overview stats={stats} onLang={explore} />
      ) : (
        <Explorer stats={stats} path={path} setPath={setPath} lang={lang} setLang={setLang} />
      )}
      <Toaster />
    </div>
  )
}

const stats = window.__DESPRAWL__
const root = createRoot(document.getElementById("root")!)
root.render(
  stats ? (
    <App stats={stats} />
  ) : (
    <p className="text-muted-foreground p-6 text-sm">No stats inlined. Run `desprawl view`.</p>
  ),
)
