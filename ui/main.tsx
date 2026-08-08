// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"
import { Button } from "./components/button.tsx"
import { Tabs } from "./components/tabs.tsx"
import { Toaster, toast } from "./components/toast.tsx"
import { Explorer } from "./views/explorer.tsx"
import { Graph } from "./views/graph.tsx"
import { Overview } from "./views/overview.tsx"
import { copy, download } from "./lib/export.ts"
import { useView } from "./lib/hash.ts"
import "./styles/tokens.css"
import type { Stats } from "../src/model.ts"

// desprawl view swaps placeholder for data
declare global {
  interface Window {
    __DESPRAWL__?: Stats
  }
}

const TABS = ["Overview", "Explorer", "History"]

function App({ stats, reload }: { stats: Stats; reload?: () => void }) {
  // view state lives in the url, so back works and a link carries the place
  const [{ tab, path, lang }, go] = useView({ tab: TABS[0], path: [], lang: "" })

  const explore = (picked: string) => {
    go({ lang: picked, path: [], tab: "Explorer" })
    toast(`Showing ${picked}`, "Each row is shaded by its share of that language")
  }

  const share = async () =>
    toast(
      (await copy(location.href)) ? "Link copied" : "Copy blocked by the browser",
      "Opens on this exact folder and language",
    )

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            onClick={() => go({ tab: TABS[0], path: [], lang: "" })}
            className="hover:text-muted-foreground cursor-pointer font-mono text-lg font-semibold"
          >
            {stats.repo}
          </button>
          <p className="text-muted-foreground text-xs">
            @{stats.head} · {stats.first.slice(0, 10)} to {stats.last.slice(0, 10)} ·{" "}
            {stats.commits.toLocaleString("en-US")} commits · desprawl {stats.version}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reload && (
            <Button variant="outline" size="sm" onClick={reload}>
              refresh
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={share}>
            share
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              download("desprawl.json", JSON.stringify(stats, null, 2), "application/json")
              toast("desprawl.json", "The whole report, tree and series included")
            }}
          >
            export
          </Button>
          <Tabs tabs={TABS} value={tab} onChange={(next) => go({ tab: next })} />
        </div>
      </header>

      {tab === "History" ? (
        <Graph stats={stats} />
      ) : tab === "Overview" ? (
        <Overview stats={stats} onLang={explore} />
      ) : (
        <Explorer
          stats={stats}
          path={path}
          setPath={(next) => go({ path: next })}
          lang={lang}
          setLang={(next) => go({ lang: next })}
        />
      )}
    </div>
  )
}

// inlined by `desprawl view`, fetched from `desprawl serve`, nothing otherwise
function Root() {
  const [stats, setStats] = useState<Stats | null>(window.__DESPRAWL__ ?? null)
  const [error, setError] = useState("")
  const token = new URLSearchParams(location.search).get("t")
  const live = !window.__DESPRAWL__ && !!token

  const load = () => {
    setError("")
    fetch(`/api/stats?t=${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((next: Stats) => {
        setStats(next)
        toast("Reanalysed", next.repo)
      })
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    if (live) load()
  }, [])

  if (error) return <p className="text-destructive p-6 text-sm">Could not load stats: {error}</p>
  if (!stats) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        {live ? "Analysing…" : "No stats inlined. Run `desprawl view` or `desprawl serve`."}
      </p>
    )
  }
  return (
    <>
      <App stats={stats} reload={live ? load : undefined} />
      <Toaster />
    </>
  )
}

createRoot(document.getElementById("root")!).render(<Root />)
