// owner: finn
// goal: mount, ui

import { createRoot } from "react-dom/client"
import { useEffect, useMemo, useState } from "react"
import { MARKS, NpmMark } from "./components/atoms/icons.tsx"
import { Onward } from "./components/molecules/onward.tsx"
import { Settings } from "./components/molecules/settings.tsx"
import { RemoteLink } from "./components/molecules/remote-link.tsx"
import { Waiting } from "./components/atoms/waiting.tsx"
import { useSlow } from "./components/atoms/working.tsx"
import { Tabs } from "./components/atoms/tabs.tsx"
import { Toaster, toast } from "./components/atoms/toast.tsx"
import { Button } from "./components/atoms/button.tsx"
import { Card, CardContent } from "./components/atoms/card.tsx"
import { Execution } from "./views/execution.tsx"
import { Network } from "./views/network.tsx"
import { Tasks } from "./views/tasks.tsx"
import { Modules } from "./views/modules.tsx"
import { Overview } from "./views/overview.tsx"
import { setLocale } from "./lib/locale.ts"
import { pullPrefs, readPrefs, savePrefs, type Prefs } from "./lib/prefs.ts"
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
} from "./lib/sections.ts"
import { Find } from "./components/molecules/find.tsx"
import { copy, describes } from "./lib/export.ts"
import { num, setSimple } from "./lib/format.ts"
import { cn } from "./lib/ui.ts"
import { pdf, pptx } from "./lib/paper.ts"
import { download, named } from "./lib/export.ts"
import { canPrint, printed, printing as paperOnly } from "./lib/live.ts"
import { DisplayProvider } from "./lib/display.tsx"
import { loadFaces } from "./lib/faces.ts"
import { useView } from "./lib/hash.ts"
import { GoingProvider, type Target } from "./lib/going.tsx"
import { Picked } from "./components/molecules/picked.tsx"
import { allRepos, attach, isLive, onBusy, onConnection, readRepo, token } from "./lib/live.ts"
import { CopyButton } from "./components/molecules/copy-button.tsx"
import { useTheme, useThemeHotkey } from "./lib/theme.tsx"
import "./styles/tokens.css"
import type { Calls as Called } from "../src/calls.ts"
import type { Deps as Depended } from "../src/deps.ts"
import type { Suite as Suited } from "../src/tests.ts"
import type { Graph as Imports } from "../src/graph.ts"
import type { Api as Routed } from "../src/routes.ts"
import type { Sprawl as Sprawled } from "../src/work.ts"
import type { Stats } from "../src/model.ts"

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

  const view = (one: string) =>
    one === "Tasks" ? (
      <Tasks stats={stats} faces={faces} />
    ) : one === "Graph" ? (
      <>
        {wanted("Network") && <Network stats={stats} repos={only ? [] : repos} />}
        {wanted("Modules") && <Modules stats={stats} faces={faces} repos={only ? [] : repos} />}
        {wanted("Execution") && <Execution stats={stats} />}
        <Onward stats={stats} current="Graph" />
      </>
    ) : (
      <Overview
        stats={stats}
        metadata={prefs.metadata || printing}
        onMetadata={(open) => change({ metadata: open })}
        faces={faces}
        repos={only ? [] : repos}
      />
    )

  return (
    <DisplayProvider value={{ scale, curve, brands, rows: prefs.rows }}>
      <GoingProvider value={{ at, go, was, open: setTarget }}>
        <div
          data-hunting={said || undefined}
          className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:gap-6 sm:p-6"
        >
          {/* a saved file is read by someone who did not run it, so it says what it is */}
          {!isLive() && (
            <div
              data-print="hide"
              className="bg-card flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-medium">
                  {name === "desprawl"
                    ? "A static demo of desprawl on its own source."
                    : `A static desprawl report for ${name}.`}
                </span>{" "}
                <span className="text-muted-foreground">Run it on your own project:</span>
              </p>
              {/* the command and the button stay one row, whatever the text above them does */}
              <div className="flex shrink-0 items-center gap-2">
                <code className="bg-muted flex-1 rounded-md px-3 py-1.5 font-mono text-sm select-all">
                  npx desprawl
                </code>
                <CopyButton
                  text={() => "npx desprawl"}
                  message="Copied npx desprawl"
                  note="Run it in any git repo"
                />
              </div>
            </div>
          )}

          {/* Ctrl+C on the terminal it runs in kills this without a word to the tab */}
          {!online && (
            <div
              data-print="hide"
              className="border-destructive/50 bg-card flex flex-col gap-3 rounded-lg border p-3"
            >
              <p className="flex items-center gap-2 text-sm">
                <span className="bg-destructive size-2 shrink-0 rounded-full" />
                <span>
                  <span className="font-medium">Disconnected.</span>{" "}
                  <span className="text-muted-foreground">
                    The desprawl server behind this tab stopped answering. This starts it again, on
                    the same address, so the tab picks back up on its own:
                  </span>
                </span>
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-muted min-w-0 flex-1 overflow-x-auto rounded-md px-3 py-1.5 font-mono text-sm text-nowrap select-all">
                  npx desprawl "{stats.repo}" --token={token()} --port={location.port}
                </code>
                <CopyButton
                  text={() =>
                    `npx desprawl "${stats.repo}" --token=${token()} --port=${location.port}`
                  }
                  message="Copied the reconnect command"
                  note="This tab reconnects on its own once the server answers again"
                />
              </div>
            </div>
          )}

          <header className="flex flex-wrap items-center justify-between gap-3">
            {/* min-w-0 lets a long path truncate */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                {/* folder name is the repo name */}
                <button
                  onClick={() => {
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
                  className="hover:text-muted-foreground cursor-pointer truncate text-2xl font-semibold"
                >
                  {name}
                </button>
                {stats.remotes.map((remote) => (
                  <RemoteLink key={remote.url} remote={remote} />
                ))}
                {/* a manifest that is not private is one npm would take, so its page exists */}
                {stats.stack.name && !stats.stack.private && (
                  <a
                    href={`https://www.npmjs.com/package/${stats.stack.name}`}
                    target="_blank"
                    rel="noreferrer"
                    title={`${stats.stack.name} on npm, read off package.json rather than the registry`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <NpmMark className="size-5" />
                  </a>
                )}
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
                {stats.thin && (
                  <span
                    className="text-amber-600 dark:text-amber-400"
                    title="cloned with --filter=blob:none, so git holds no file contents to diff. Commits, authors, dates and renames are right, every added or removed line reads 0"
                  >
                    {" "}
                    · partial clone, no line counts
                  </span>
                )}
                {slow && <span className="text-foreground"> · working…</span>}
              </p>
            </div>
            {/* seven tabs, a theme switch and a menu need most of a laptop, so they keep a
                row of their own until there is room for the repo name beside them */}
            <div data-print="hide" className="flex w-full min-w-0 items-center gap-2 xl:w-auto">
              {said ? (
                <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                  {found === 0
                    ? `nothing here matches ${said}`
                    : `${found === 1 ? "1 panel" : `${found} panels`} matching ${said}`}
                </p>
              ) : (
                <Tabs
                  grow
                  icons={BAR}
                  className="xl:w-auto"
                  tabs={TABS}
                  value={TABS.includes(tab) ? tab : TABS[0]}
                  // by hand means the whole tab
                  onChange={(next) => go({ tab: next, panel: "", pick: "" })}
                />
              )}
              <Find value={typed} onChange={setTyped} placeholder="Search panels" />
              {repos.length > 0 && onRepo && (
                <select
                  value={only}
                  onChange={(event) => onRepo(event.target.value)}
                  title="Which repo in this folder"
                  className="bg-card h-9 max-w-40 shrink-0 rounded-md border px-2 text-sm"
                >
                  <option value="">every repo</option>
                  {repos.map((one) => (
                    <option key={one} value={one}>
                      {one}
                    </option>
                  ))}
                </select>
              )}
              <Settings
                stats={stats}
                prefs={prefs}
                change={change}
                reload={reload}
                onPaper={paper}
                themed={themed}
              />
            </div>
          </header>

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
        toast(repo || "Every repo", next.repo)
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
