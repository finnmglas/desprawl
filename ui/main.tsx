// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
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

function App({ stats }: { stats: Stats }) {
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
            {stats.commits.toLocaleString("en-US")} commits
          </p>
        </div>
        <div className="flex items-center gap-2">
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
