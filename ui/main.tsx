// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
import { useEffect, useMemo, useState } from "react"
import { MARKS } from "./components/atoms/icons.tsx"
import { Onward } from "./components/molecules/onward.tsx"
import { Banners } from "./components/molecules/panels/banners.tsx"
import { Masthead } from "./components/molecules/panels/masthead.tsx"
import { Waiting } from "./components/atoms/waiting.tsx"
import { useSlow } from "./components/atoms/working.tsx"
import { Toaster, toast } from "./components/atoms/toast.tsx"
import { Button } from "./components/atoms/button.tsx"
import { Card, CardContent } from "./components/atoms/card.tsx"
import { Execution } from "./views/execution.tsx"
import { Network } from "./views/network.tsx"
import { Tasks } from "./views/tasks.tsx"
import { Modules } from "./views/modules.tsx"
import { Overview } from "./views/overview.tsx"
import { setLocale } from "./lib/say/locale.ts"
import { pullPrefs, readPrefs, savePrefs, type Prefs } from "./lib/app/prefs.ts"
import {
  hunt,
  land,
  onTab,
  syncHidden,
  syncOrder,
  useHunt,
  useShownCount,
  viewsFor,
  viewsOf,
} from "./lib/app/sections.ts"
import { describes } from "./lib/app/export.ts"
import { setSimple } from "./lib/say/format.ts"
import { cn } from "./lib/app/ui.ts"
import { pdf, pptx } from "./lib/app/paper.ts"
import { download, named } from "./lib/app/export.ts"
import { canPrint, printed, printing as paperOnly } from "./lib/app/live.ts"
import { DisplayProvider } from "./lib/app/display.tsx"
import { loadFaces } from "./lib/app/faces.ts"
import { useView } from "./lib/app/hash.ts"
import { GoingProvider, type Target } from "./lib/app/going.tsx"
import { Picked } from "./components/molecules/panels/picked.tsx"
import { allRepos, attach, isLive, onBusy, onConnection, readRepo, token } from "./lib/app/live.ts"
import { useTheme, useThemeHotkey } from "./lib/app/theme.tsx"
import "./styles/tokens.css"
import type { Calls as Called } from "../src/read/calls.ts"
import type { Deps as Depended } from "../src/facts/deps.ts"
import type { Suite as Suited } from "../src/facts/tests.ts"
import type { Graph as Imports } from "../src/read/graph.ts"
import type { Api as Routed } from "../src/read/routes.ts"
import type { Sprawl as Sprawled } from "../src/facts/work.ts"
import type { Stats } from "../src/read/model.ts"

// desprawl view swaps placeholder for data
declare global {
  interface Window {
    __DESPRAWL__?: Stats
    /** a static export carries both graphs too, since there is no server to ask */
    __DESPRAWL_GRAPH__?: Imports
    __DESPRAWL_CALLS__?: Called
    __DESPRAWL_ROUTES__?: Routed
    __DESPRAWL_DEPS__?: Depended
    __DESPRAWL_TESTS__?: Suited
    __DESPRAWL_SPRAWL__?: Sprawled
  }
}

const TABS = ["Overview", "Graph", "Tasks"]

// one object, not a literal per render: useView listens on identity
const START = {
  tab: TABS[0],
  path: [],
  lang: "",
  kind: "",
  from: "",
  to: "",
  pick: "",
  panel: "",
}

/** past this many repos, the page asks which one before reading them all */
const MANY = 8

// words that land on a panel every repo has
const SUGGEST = ["licences", "dead code", "contributors", "coverage", "timeline"]

// the summary wears its name alone up here, whatever it is known by elsewhere
const BAR = { ...MARKS, Overview: undefined }

function App({
  stats,
  prefs,
  change,
  themed,
  reload,
  repos = [],
  only = "",
  onRepo,
}: {
  stats: Stats
  prefs: Prefs
  change: (next: Partial<Prefs>) => void
  themed: ReturnType<typeof useTheme>
  reload?: () => void
  /** the repos in the folder this was pointed at, empty for a single repo */
  repos?: string[]
  only?: string
  onRepo?: (name: string) => void
}) {
  // view state lives in the url, so back works and a link carries the place
  const [at, go, was] = useView(START)
  const { tab, panel, pick } = at
  const said = useHunt()
  const found = useShownCount()
  // the box answers every keystroke, the page waits for the typing to stop: each change
  // mounts and unmounts whole views, and on a large repo that is seconds of work
  const [typed, setTyped] = useState("")
  useEffect(() => {
    if (typed === said) return
    const wait = setTimeout(() => hunt(typed), 250)
    return () => clearTimeout(wait)
  }, [typed])
  useEffect(() => {
    if (!said) setTyped("")
  }, [said])
  // only the views holding a match are mounted, or a search builds every graph in the repo.
  // once mounted a view stays: rebuilding a call graph costs seconds, hiding it costs nothing
  const [built, setBuilt] = useState<string[]>([])
  const needed = useMemo(() => (said ? viewsFor(said) : null), [said])
  useEffect(() => {
    if (!needed) return
    const fresh = [...needed].filter((one) => !built.includes(one))
    if (fresh.length) setBuilt([...built, ...fresh])
  }, [needed, built])
  const wanted = (name: string) => !needed || needed.has(name) || built.includes(name)
  // what the reader pointed at, answered with everywhere it leads rather than one guess
  const [target, setTarget] = useState<Target | null>(null)
  const [busy, setBusy] = useState(0)
  useEffect(() => onBusy(setBusy), [])
  const slow = useSlow(busy > 0)
  const [online, setOnline] = useState(true)
  useEffect(() => onConnection(setOnline), [])

  // every tab at once while a file is being made
  const [printing, setPrinting] = useState(paperOnly)
  const paper = async (kind: "pdf" | "pptx") => {
    // a browser prints text, a canvas of it cannot
    if (kind === "pdf" && (await canPrint())) {
      toast("Printing every tab", "Your browser is drawing it, so the text stays text")
      const made = await printed()
      if (made) {
        download(named(`${stats.repo.split("/").filter(Boolean).pop() ?? "repo"}.pdf`), made)
        return toast("Saved", "Selectable text, real fonts")
      }
      toast("Could not print", "Falling back to a picture of the page")
    }
    setPrinting(true)
    toast(`Building the ${kind}`, "Every tab, painted as it looks right now")
    // each has to mount and paint before it is shot
    await new Promise((done) => setTimeout(done, 1800))
    const shots = TABS.map((title) => ({
      title,
      node: document.querySelector<HTMLElement>(`[data-shot="${title}"]`),
    })).filter((one): one is { title: string; node: HTMLElement } => !!one.node)
    const name = stats.repo.split("/").filter(Boolean).pop() ?? "repo"
    try {
      if (kind === "pdf") await pdf(shots, named(`${name}.pdf`))
      else await pptx(shots, stats.repo, named(`${name}.pptx`))
      toast(`${name}.${kind}`, `${shots.length} tabs, in the theme you are reading in`)
    } catch (err) {
      toast("Could not build it", String(err))
    }
    setPrinting(false)
  }
  const { scale, curve, brands } = prefs
  setSimple(scale === "simple") // before the tree below renders

  // panels above load late and push it down
  useEffect(() => {
    if (!panel) {
      land(null)
      scrollTo({ top: 0 })
      setTarget(null)
      return
    }
    let last = Infinity
    const settle = setInterval(() => {
      const spot = document.querySelector<HTMLElement>(`[data-section="${panel}"]`)
      if (!spot) return
      land(panel)
      // the table scrolls to its own row
      if (pick) return clearInterval(settle)
      const top = Math.round(spot.getBoundingClientRect().top)
      if (Math.abs(top - last) < 2) return clearInterval(settle)
      last = top
      spot.scrollIntoView({ block: "start", behavior: "smooth" })
    }, 250)
    const give = setTimeout(() => clearInterval(settle), 4000)
    // the panel is about where you were standing, so leaving that place closes it
    setTarget(null)
    return () => {
      clearInterval(settle)
      clearTimeout(give)
    }
  }, [tab, panel, pick])
  const [faces, setFaces] = useState<Record<string, string>>({})
  useEffect(() => {
    void loadFaces(stats).then(setFaces)
  }, [stats.repo])

  const name = stats.repo.split("/").filter(Boolean).pop() || "repo"
  useEffect(() => {
    describes(stats.repo)
    document.title = `${name} · desprawl`
  }, [stats.repo])

  // the repos this page is about, and none of them when it is about one
  const chosen = only ? only.split(",").filter(Boolean) : repos
  const read = chosen.length === 1 ? [] : chosen

  const view = (one: string) =>
    one === "Tasks" ? (
      <Tasks stats={stats} faces={faces} />
    ) : one === "Graph" ? (
      <>
        {wanted("Network") && <Network stats={stats} repos={read} />}
        {wanted("Modules") && <Modules stats={stats} faces={faces} repos={read} />}
        {wanted("Execution") && <Execution stats={stats} />}
        <Onward stats={stats} current="Graph" />
      </>
    ) : (
      <Overview
        stats={stats}
        metadata={prefs.metadata || printing}
        onMetadata={(open) => change({ metadata: open })}
        faces={faces}
        repos={read}
      />
    )

  return (
    <DisplayProvider value={{ scale, curve, brands, rows: prefs.rows }}>
      <GoingProvider value={{ at, go, was, open: setTarget }}>
        <div
          data-hunting={said || undefined}
          className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:gap-6 sm:p-6"
        >
          <Banners name={name} repo={stats.repo} online={online} />

          <Masthead
            stats={stats}
            name={name}
            tabs={TABS}
            icons={BAR}
            tab={tab}
            onTab={(next) => go({ tab: next, panel: "", pick: "" })}
            typed={typed}
            setTyped={setTyped}
            said={said}
            found={found}
            slow={slow}
            repos={repos}
            only={only}
            onRepo={onRepo}
            onHome={() => {
              setTyped("")
              hunt("")
              go({
                tab: TABS[0],
                path: [],
                lang: "",
                kind: "",
                pick: "",
                panel: "",
                from: "",
                to: "",
              })
            }}
            prefs={prefs}
            change={change}
            reload={reload}
            onPaper={paper}
            themed={themed}
          />

          {/* searching answers with panels, so every tab is mounted and each one shows
              only what matched */}
          {(printing
            ? TABS
            : said
              ? TABS.filter(
                  (one) => onTab(said, one) || viewsOf(one).some((v) => built.includes(v)),
                )
              : [tab]
          ).map((one, i) => (
            <section
              key={one}
              className={cn("flex flex-col gap-4", i > 0 && "print:break-before-page")}
            >
              {printing && (
                <h2 className="mt-2 border-b pb-1 text-lg font-semibold print:mt-0">{one}</h2>
              )}
              <div
                data-shot={one}
                className={cn("flex flex-col gap-4 sm:gap-6", printing && "p-6")}
              >
                {view(one)}
              </div>
            </section>
          ))}

          {said && found === 0 && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6">
                <p className="text-sm">
                  Nothing here matches <span className="font-medium">{said}</span>.
                </p>
                <p className="text-muted-foreground text-xs">
                  A panel answers to what it is called and what it holds, and one this repo has
                  nothing for is not here at all. Try{" "}
                  {SUGGEST.map((one, i) => (
                    <span key={one}>
                      {i > 0 && ", "}
                      <button
                        onClick={() => setTyped(one)}
                        className="hover:text-foreground cursor-pointer underline decoration-dotted"
                      >
                        {one}
                      </button>
                    </span>
                  ))}
                  .
                </p>
                <Button variant="outline" size="sm" onClick={() => setTyped("")}>
                  Clear search
                </Button>
              </CardContent>
            </Card>
          )}

          <Picked target={target} stats={stats} onClose={() => setTarget(null)} />
        </div>
      </GoingProvider>
    </DisplayProvider>
  )
}

// inlined by view --static, fetched when served
function Root() {
  const [stats, setStats] = useState<Stats | null>(window.__DESPRAWL__ ?? null)
  const [error, setError] = useState("")
  const live = isLive()
  // a folder of repos: the names in it, and which one is being read
  const [repos, setRepos] = useState<string[]>([])
  const [only, setOnly] = useState("")
  const [picked, setPicked] = useState(false)
  useEffect(() => {
    if (live) void allRepos().then(setRepos)
  }, [live])

  // here, not in App: a slow read should not spend it in the wrong theme
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const change = (next: Partial<Prefs>) => {
    // read back, since the fix panel saves without coming through here
    const merged = { ...readPrefs(), ...next }
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
      syncHidden(saved.hidden)
      syncOrder(saved.order)
    })
  }, [])
  const themed = useTheme(prefs.theme, (theme) => change({ theme }))
  useThemeHotkey(themed)

  const load = (repo = only) => {
    setError("")
    fetch(`/api/stats?t=${token()}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`)
      // server explains itself in body, status code alone says nothing
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (r.ok) return body as Stats
        throw new Error(body?.error ?? `${r.status} ${r.statusText}`)
      })
      .then((next) => {
        setStats(next)
        const named = repo.split(",").filter(Boolean)
        toast(
          named.length > 1 ? `${named.length} repos` : (named[0] ?? "Every repo"),
          named.length > 1 ? named.join(", ") : next.repo,
        )
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
  // past a handful, reading every repo at once is minutes of work for a picture nobody
  // can follow, so the choice comes first
  if (live && repos.length > MANY && !only && !picked)
    return (
      <>
        <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
          <h1 className="text-2xl font-semibold">{repos.length} repos here</h1>
          <p className="text-muted-foreground text-sm">
            Reading all of them at once takes a while and draws a picture nobody can follow. Pick
            one, or take the lot anyway.
          </p>
          <div className="flex flex-col gap-1">
            {repos.map((one) => (
              <button
                key={one}
                onClick={() => {
                  readRepo(one)
                  setOnly(one)
                  setPicked(true)
                  load(one)
                }}
                className="hover:bg-muted/60 hover:border-ring cursor-pointer rounded-md border border-transparent px-3 py-2 text-left text-sm"
              >
                {one}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPicked(true)}
            className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs underline decoration-dotted"
          >
            read all {repos.length} anyway
          </button>
        </div>
        <Toaster />
      </>
    )

  return (
    <>
      <App
        key={only}
        stats={stats}
        prefs={prefs}
        change={change}
        themed={themed}
        reload={live ? () => load() : undefined}
        repos={repos}
        only={only}
        onRepo={(name) => {
          readRepo(name)
          setOnly(name)
          load(name)
        }}
      />
      <Toaster />
    </>
  )
}

attach() // the served run ends when this tab does
createRoot(document.getElementById("root")!).render(<Root />)
