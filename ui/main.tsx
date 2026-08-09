// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"
import { Clock, FolderMark } from "./components/icons.tsx"
import { Settings } from "./components/settings.tsx"
import { RemoteLink } from "./components/remote-link.tsx"
import { ThemeToggle } from "./components/theme-toggle.tsx"
import { Tabs } from "./components/tabs.tsx"
import { Toaster, toast } from "./components/toast.tsx"
import { Explorer } from "./views/explorer.tsx"
import { Graph } from "./views/graph.tsx"
import { Overview } from "./views/overview.tsx"
import { setLocale } from "./lib/locale.ts"
import { pullPrefs, readPrefs, savePrefs, type Prefs } from "./lib/prefs.ts"
import { copy } from "./lib/export.ts"
import { num, setSimple } from "./lib/format.ts"
import { DisplayProvider } from "./lib/display.tsx"
import { loadFaces } from "./lib/faces.ts"
import { useView } from "./lib/hash.ts"
import { attach, isLive, onBusy, token } from "./lib/live.ts"
import { useTheme, useThemeHotkey } from "./lib/theme.tsx"
import "./styles/tokens.css"
import type { Stats } from "../src/model.ts"

// desprawl view swaps placeholder for data
declare global {
  interface Window {
    __DESPRAWL__?: Stats
  }
}

const TABS = ["Overview", "Files", "History"]

const MARKS: Record<string, React.ReactNode> = { Files: <FolderMark />, History: <Clock /> }

function App({ stats, reload }: { stats: Stats; reload?: () => void }) {
  // view state lives in the url, so back works and a link carries the place
  const [{ tab, path, lang, from, to }, go] = useView({
    tab: TABS[0],
    path: [],
    lang: "",
    from: "",
    to: "",
  })
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [busy, setBusy] = useState(0)
  useEffect(() => onBusy(setBusy), [])
  const { scale, curve, brands } = prefs
  // one writer for every setting
  const change = (next: Partial<Prefs>) => {
    const merged = { ...prefs, ...next }
    setPrefs(merged)
    savePrefs(merged)
    if (next.region) setLocale(next.region)
  }

  // disk wins, it outlives the port
  useEffect(() => {
    void pullPrefs().then((saved) => {
      if (!saved) return
      setPrefs(saved)
      setLocale(saved.region)
    })
  }, [])
  setSimple(scale === "simple") // before the tree below renders

  useEffect(() => {
    scrollTo({ top: 0 })
  }, [tab])
  const [faces, setFaces] = useState<Record<string, string>>({})
  useEffect(() => {
    void loadFaces(stats).then(setFaces)
  }, [stats.repo])

  const themed = useTheme(prefs.theme, (theme) => change({ theme }))
  useThemeHotkey(themed)

  const explore = (picked: string) => {
    go({ lang: picked, path: [], tab: "Files" })
    toast(`Showing ${picked}`, "Each row is shaded by its share of that language")
  }

  return (
    <DisplayProvider value={{ scale, curve, brands }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          {/* min-w-0 lets a long path truncate */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              {/* folder name is the repo name */}
              <button
                onClick={() => go({ tab: TABS[0], path: [], lang: "" })}
                className="hover:text-muted-foreground cursor-pointer truncate text-2xl font-semibold"
              >
                {stats.repo.split("/").filter(Boolean).pop()}
              </button>
              {stats.remotes.map((remote) => (
                <RemoteLink key={remote.url} remote={remote} />
              ))}
            </div>
            <button
              onClick={async () =>
                toast(
                  (await copy(stats.repo)) ? "Path copied" : "Copy blocked by the browser",
                  stats.repo,
                )
              }
              title="Copy the path"
              className="text-muted-foreground hover:text-foreground w-fit max-w-full cursor-pointer truncate text-left font-mono text-xs"
            >
              {stats.repo}
            </button>
            <p className="text-muted-foreground text-xs">
              @{stats.head} · {stats.first.slice(0, 10)} to {stats.last.slice(0, 10)} ·{" "}
              {num(stats.commits)} commits · desprawl {stats.version}
              {busy > 0 && <span className="text-foreground"> · working…</span>}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Tabs
              grow
              icons={MARKS}
              className="sm:w-auto"
              tabs={TABS}
              value={tab}
              onChange={(next) => go({ tab: next })}
            />
            <ThemeToggle {...themed} />
            <Settings stats={stats} prefs={prefs} change={change} reload={reload} />
          </div>
        </header>

        {tab === "History" ? (
          <Graph
            stats={stats}
            from={from}
            to={to}
            onRange={(a, b) => go({ from: a, to: b })}
            onTab={(next) => go({ tab: next })}
            onPath={(path) => {
              go({ tab: "Files", path })
              toast("Opened in Files", path.join("/") || "the repo root")
            }}
            faces={faces}
          />
        ) : tab === "Overview" ? (
          <Overview
            stats={stats}
            onLang={explore}
            onTab={(next) => go({ tab: next })}
            onCommits={(a, b) => {
              go({ tab: "History", from: a, to: b })
              toast("Opened in History", `${a} to ${b}`)
            }}
            faces={faces}
          />
        ) : (
          <Explorer
            stats={stats}
            onTab={(next) => go({ tab: next })}
            path={path}
            setPath={(next) => go({ path: next })}
            lang={lang}
            setLang={(next) => go({ lang: next })}
          />
        )}
      </div>
    </DisplayProvider>
  )
}

// inlined by view --static, fetched when served
function Root() {
  const [stats, setStats] = useState<Stats | null>(window.__DESPRAWL__ ?? null)
  const [error, setError] = useState("")
  const [waited, setWaited] = useState(0)
  const live = isLive()

  const load = () => {
    setError("")
    fetch(`/api/stats?t=${token()}`)
      // server explains itself in body, status code alone says nothing
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (r.ok) return body as Stats
        throw new Error(body?.error ?? `${r.status} ${r.statusText}`)
      })
      .then((next) => {
        setStats(next)
        toast("Reanalysed", next.repo)
      })
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    if (live) load()
  }, [])

  // large repo passes
  useEffect(() => {
    if (stats || error) return
    const tick = setInterval(() => setWaited((s) => s + 1), 1000)
    return () => clearInterval(tick)
  }, [stats, error])

  if (error) return <p className="text-destructive p-6 text-sm">Could not load stats: {error}</p>
  if (!stats) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        {live
          ? `Analysing, ${waited}s so far. Every tracked file is read once, then the history` +
            (waited > 20 ? ". A repo this size takes a few minutes the first time" : "…")
          : "No stats inlined. Run `desprawl view` or `desprawl serve`."}
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

attach() // the served run ends when this tab does
createRoot(document.getElementById("root")!).render(<Root />)
