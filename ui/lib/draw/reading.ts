// owner: finn
// goal: the graphs behind the picture, read once and folded into what is drawn

import { useEffect, useMemo, useState, type RefObject } from "react"
import { apiGraph, callGraph, importGraph } from "../app/live.ts"
import { net, type Grain, type Net } from "./network.ts"
import { onlyIn } from "../../../src/read/dialects.ts"
import { balanced, fold } from "../../../src/read/layers.ts"
import { namesUnder } from "../../../src/read/naming.ts"
import type { Api } from "../../../src/read/specs.ts"
import type { Calls } from "../../../src/read/calls.ts"
import type { Graph } from "../../../src/read/graph.ts"

// a graph reads by its shape, so it gets the screen
const TALLEST = 0.78

// past this a layout is slower than anyone waits, so it is offered rather than run
const MOST = 9000

interface What {
  lang: string
  grain: Grain
  bounds: boolean
  repos: string[]
  /** the drawing is measured against the panel holding it */
  frame: RefObject<HTMLDivElement | null>
  /** laid out anyway, however many nodes it has */
  anyway: boolean
}

export function useReading({ lang, grain, bounds, repos, frame, anyway }: What) {
  const [read, setGraph] = useState<Graph | null>(window.__DESPRAWL_GRAPH__ ?? null)
  const [calls, setCalls] = useState<Calls | null>(window.__DESPRAWL_CALLS__ ?? null)
  const [routes, setRoutes] = useState<Api | null>(window.__DESPRAWL_ROUTES__ ?? null)
  const [wide, setWide] = useState(900)
  const [tall, setTall] = useState(640)

  useEffect(() => {
    if (!read) void importGraph().then(setGraph)
    if (!calls) void callGraph().then(setCalls)
    if (!routes) void apiGraph().then(setRoutes)
  }, [])

  const langs = useMemo(
    () =>
      [
        ...new Set(
          Object.values(read?.modules ?? {})
            .map((m) => m.lang)
            .filter(Boolean),
        ),
      ].sort(),
    [read],
  )
  const graph = useMemo(() => (read && lang ? onlyIn(read, lang) : read), [read, lang])

  useEffect(() => {
    const measure = () => {
      setWide(frame.current?.clientWidth ?? 900)
      // the layout viewport, not innerHeight
      setTall(Math.max(420, Math.round(document.documentElement.clientHeight * TALLEST)))
    }
    measure()
    addEventListener("resize", measure)
    return () => removeEventListener("resize", measure)
  }, [graph])

  const split = useMemo(() => (graph ? balanced(graph) : null), [graph])
  const layout = useMemo(() => (graph && split ? fold(graph, split) : null), [graph, split])
  const called = useMemo(
    () => (layout ? namesUnder(layout.units, repos) : new Map<string, string>()),
    [layout, repos],
  )
  const units = useMemo(() => new Map((layout?.units ?? []).map((u) => [u.path, u])), [layout])

  const size =
    grain === "function"
      ? Object.values(calls?.symbols ?? {}).filter((s) => s.kind !== "module").length
      : grain === "file"
        ? Object.keys(graph?.modules ?? {}).length
        : (layout?.units.length ?? 0)
  const heavy = size > MOST && !anyway

  const drawn: Net | null = useMemo(
    () =>
      layout && graph && split && !heavy
        ? net(layout, graph, calls, routes, grain, split, wide - 24, tall, !bounds, repos)
        : null,
    [layout, graph, split, calls, routes, grain, wide, tall, heavy, bounds],
  )

  return {
    read,
    graph,
    calls,
    routes,
    langs,
    split,
    layout,
    called,
    units,
    size,
    heavy,
    drawn,
    wide,
    tall,
  }
}
