// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"
import { Blocks, Clock, FolderMark } from "./components/atoms/icons.tsx"
import { Settings } from "./components/molecules/settings.tsx"
import { RemoteLink } from "./components/molecules/remote-link.tsx"
import { ThemeToggle } from "./components/molecules/theme-toggle.tsx"
import { Waiting } from "./components/atoms/waiting.tsx"
import { Tabs } from "./components/atoms/tabs.tsx"
import { Toaster, toast } from "./components/atoms/toast.tsx"
import { Explorer } from "./views/explorer.tsx"
import { Graph } from "./views/graph.tsx"
import { Modules } from "./views/modules.tsx"
import { Overview } from "./views/overview.tsx"
import { setLocale } from "./lib/locale.ts"
import { pullPrefs, readPrefs, savePrefs, type Prefs } from "./lib/prefs.ts"
import { copy, describes } from "./lib/export.ts"
import { num, setSimple } from "./lib/format.ts"
import { DisplayProvider } from "./lib/display.tsx"
import { loadFaces } from "./lib/faces.ts"
import { useView } from "./lib/hash.ts"
import { attach, isLive, onBusy, token } from "./lib/live.ts"
import { useTheme, useThemeHotkey } from "./lib/theme.tsx"
import "./styles/tokens.css"
import type { Calls as Called } from "../src/calls.ts"
import type { Graph as Imports } from "../src/graph.ts"
import type { Stats } from "../src/model.ts"

// desprawl view swaps placeholder for data
declare global {
  interface Window {
    __DESPRAWL__?: Stats
    /** a static export carries both graphs too, since there is no server to ask */
    __DESPRAWL_GRAPH__?: Imports
    __DESPRAWL_CALLS__?: Called
  }
}

const TABS = ["Overview", "Modules", "Files", "History"]

const MARKS: Record<string, React.ReactNode> = {
  Modules: <Blocks />,
  Files: <FolderMark />,
  History: <Clock />,
}

function App({
  stats,
  prefs,
  change,
  themed,
  reload,
}: {
  stats: Stats
  prefs: Prefs
  change: (next: Partial<Prefs>) => void
  themed: ReturnType<typeof useTheme>
  reload?: () => void
}) {
  // view state lives in the url, so back works and a link carries the place
  const [{ tab, path, lang, from, to }, go] = useView({
    tab: TABS[0],
    path: [],
    lang: "",
    from: "",
    to: "",
  })
  const [busy, setBusy] = useState(0)
  useEffect(() => onBusy(setBusy), [])
  const { scale, curve, brands } = prefs
  setSimple(scale === "simple") // before the tree below renders

  useEffect(() => {
    scrollTo({ top: 0 })
  }, [tab])
  const [faces, setFaces] = useState<Record<string, string>>({})
  useEffect(() => {
    void loadFaces(stats).then(setFaces)
  }, [stats.repo])

  const name = stats.repo.split("/").filter(Boolean).pop() || "repo"
  useEffect(() => {
    describes(stats.repo)
    document.title = `${name} · desprawl`
  }, [stats.repo])

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
                {name}
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
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
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
            metadata={prefs.metadata}
            onMetadata={(open) => change({ metadata: open })}
            onLang={explore}
            onTab={(next) => go({ tab: next })}
            onCommits={(a, b) => {
              go({ tab: "History", from: a, to: b })
              toast("Opened in History", `${a} to ${b}`)
            }}
            faces={faces}
          />
        ) : tab === "Modules" ? (
          <Modules
            stats={stats}
            faces={faces}
            onTab={(next) => go({ tab: next })}
            onPath={(path) => {
              go({ tab: "Files", path })
              toast("Opened in Files", path.join("/") || "the repo root")
            }}
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
  const live = isLive()

  // settings live here, not in App: a repo that takes a minute to read should not
  // spend that minute in the wrong theme
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
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
  const themed = useTheme(prefs.theme, (theme) => change({ theme }))
  useThemeHotkey(themed)

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

  if (error) return <p className="text-destructive p-6 text-sm">Could not load stats: {error}</p>
  if (!stats) {
    if (!live)
      return (
        <p className="text-muted-foreground p-6 text-sm">
          No stats inlined. Run `desprawl view` or `desprawl serve`.
        </p>
      )
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Waiting
          what="Analysing, every tracked file read once and then the history,"
          slow="A repo this size takes a few minutes the first time."
          rows={5}
        />
      </div>
    )
  }
  return (
    <>
      <App
        stats={stats}
        prefs={prefs}
        change={change}
        themed={themed}
        reload={live ? load : undefined}
      />
      <Toaster />
    </>
  )
}

attach() // the served run ends when this tab does
createRoot(document.getElementById("root")!).render(<Root />)
