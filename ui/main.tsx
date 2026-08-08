// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"
import { DisplayControls } from "./components/display-controls.tsx"
import { Menu, MenuItem, MenuSection } from "./components/menu.tsx"
import { ThemeToggle } from "./components/theme-toggle.tsx"
import { Tabs } from "./components/tabs.tsx"
import { Toaster, toast } from "./components/toast.tsx"
import { Explorer } from "./views/explorer.tsx"
import { Graph } from "./views/graph.tsx"
import { Overview } from "./views/overview.tsx"
import { CHOICES, LABELS, setLocale, stored, type Choice } from "./lib/locale.ts"
import { locale } from "./lib/locale.ts"
import { copy, download } from "./lib/export.ts"
import { num } from "./lib/format.ts"
import { DisplayProvider, type Curve, type Scale } from "./lib/display.tsx"
import { useView } from "./lib/hash.ts"
import { useTheme, useThemeHotkey } from "./lib/theme.tsx"
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
  const [scale, setScale] = useState<Scale>("abs")
  const [curve, setCurve] = useState<Curve>("linear")
  const [region, setRegion] = useState<Choice>(stored)
  const themed = useTheme()
  useThemeHotkey(themed)

  const explore = (picked: string) => {
    go({ lang: picked, path: [], tab: "Explorer" })
    toast(`Showing ${picked}`, "Each row is shaded by its share of that language")
  }

  // overview places it between the chart and the tables, per the layout
  const controls = (
    <DisplayControls scale={scale} curve={curve} setScale={setScale} setCurve={setCurve} />
  )

  const share = async () =>
    toast(
      (await copy(location.href)) ? "Link copied" : "Copy blocked by the browser",
      "Opens on this exact folder and language",
    )

  return (
    <DisplayProvider value={{ scale, curve }}>
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
              {stats.commits.toLocaleString(locale())} commits · desprawl {stats.version}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs tabs={TABS} value={tab} onChange={(next) => go({ tab: next })} />
            <ThemeToggle {...themed} />
            <Menu>
              {reload && <MenuItem onClick={reload}>refresh</MenuItem>}
              <MenuItem onClick={share}>share link</MenuItem>
              <MenuItem
                onClick={() => {
                  download("desprawl.json", JSON.stringify(stats, null, 2), "application/json")
                  toast("desprawl.json", "The whole report, tree and series included")
                }}
              >
                export json
              </MenuItem>
              <div className="bg-border my-1 h-px" />
              <MenuSection label="Numbers and dates" hint={`${locale()} · ${num(1234.5)}`}>
                <Tabs
                  tabs={CHOICES.map((c) => LABELS[c])}
                  value={LABELS[region]}
                  onChange={(next) => {
                    const picked = CHOICES.find((c) => LABELS[c] === next) ?? "auto"
                    setLocale(picked)
                    setRegion(picked)
                  }}
                />
              </MenuSection>
            </Menu>
          </div>
        </header>

        {tab === "History" ? (
          <>
            {controls}
            <Graph stats={stats} />
          </>
        ) : tab === "Overview" ? (
          <Overview stats={stats} onLang={explore} controls={controls} />
        ) : (
          <>
            {controls}
            <Explorer
              stats={stats}
              path={path}
              setPath={(next) => go({ path: next })}
              lang={lang}
              setLang={(next) => go({ lang: next })}
            />
          </>
        )}
      </div>
    </DisplayProvider>
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
