// owner: finn
// goal: the graph itself, every node inside the module holding it

import { useEffect, useMemo, useRef, useState } from "react"
import { Back } from "../components/atoms/back.tsx"
import { Section } from "../components/atoms/section.tsx"
import { Loading } from "../components/molecules/onward.tsx"
import { Save } from "../components/molecules/save.tsx"
import { usePainting } from "../lib/draw/painting.ts"
import { colouring, legendOf } from "../lib/draw/hues.ts"
import { useCamera } from "../lib/draw/camera.ts"
import { useReading } from "../lib/draw/reading.ts"
import { pointing } from "../lib/draw/pointing.ts"
import {
  file as asFile,
  group as asGroup,
  holds,
  isFile,
  symbol,
  useGoing,
} from "../lib/app/going.tsx"
import { useKept } from "../lib/app/kept.ts"
import { plural } from "../lib/text/format.ts"
import { hands, worked } from "../lib/app/people.ts"
import { type Grain, type Spot, type Wire } from "../lib/draw/network.ts"
import { grainOf } from "../../src/facts/knowledge.ts"
import { bundled, seating, type Held } from "../lib/draw/wires.ts"
import { hitting } from "../lib/draw/hitting.ts"
import { carrying, linked } from "../lib/draw/carried.tsx"
import { ApiTables } from "../components/molecules/graph/api-tables.tsx"
import { GraphCard } from "../components/molecules/graph/graph-card.tsx"
import { NetCaption } from "../components/molecules/graph/net-caption.tsx"
import { NetToolbar, type Flag } from "../components/molecules/graph/net-toolbar.tsx"
import { asRows, knowledge } from "../../src/facts/knowledge.ts"
import type { Stats } from "../../src/read/model.ts"

export function Network({ stats, repos = [] }: { stats: Stats; repos?: string[] }) {
  const going = useGoing()
  // a picture somebody set up is the work
  const [lang, setLang] = useKept("net.lang", "")
  // a run before the declaration grain was named after what it holds remembered "function"
  const [held, setGrain] = useKept<Grain>("net.grain", "module")
  const grain = grainOf(held) || "module"
  const [imports, setImports] = useKept("net.imports", true)
  const [wired, setWired] = useKept("net.calls", true)
  const [http, setHttp] = useKept("net.http", true)
  const [bounds, setBounds] = useKept("net.bounds", true)
  const [names, setNames] = useKept("net.names", true)
  const [find, setFind] = useKept("net.find", "")
  const [numbers, setNumbers] = useKept("net.numbers", false)
  const [bundle, setBundle] = useKept("net.bundle", false)
  const [paint, setPaint] = useKept("net.paint", "")
  const [edges, setEdges] = useKept("net.edges", "kind")
  const [only, setOnly] = useKept("net.only", "")
  const [near, setNear] = useState<Spot | null>(null)
  const [edge, setEdge] = useState<(Wire & { held: number }) | null>(null)
  const [go, setGo] = useState(false)
  const [moves, setMoves] = useKept("net.moves", true)
  const [plan, setPlan] = useKept("net.plan", false)

  const board = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)

  // js and ts are one language written two ways
  const multi = (held: string[]) => held.filter((one) => one !== "ts").length > 0 && held.length > 1
  const {
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
  } = useReading({ lang, grain, bounds, repos, frame, anyway: go })

  const { view, drawing, schedule, rushed, seats, frames, moving, busy, whole, zoomTo } = useCamera(
    {
      drawn,
      board,
      room: wide - 24,
      tall,
      moves,
      only,
      grain,
      fresh: () => setNear(null),
    },
  )

  // frame the module, light the dot
  useEffect(() => {
    const pick = going.at.pick
    if (!pick || !layout) return
    const unit = holds(
      pick,
      layout.units.map((u) => u.path),
    )
    if (unit) setOnly(unit)
    const path = pick.split("#")[0]
    if (isFile(path)) setFind(path.split("/").pop() ?? "")
    const box = unit ? drawn?.boxes.find((b) => b.id === unit) : null
    if (box) zoomTo(box)
  }, [going.at.pick, layout, drawn])

  const where = useMemo(() => worked(stats.tree), [stats.tree])
  const owner = (path: string) => hands(path, where, stats.contributors)[0]?.who.name ?? ""
  // what everything here is measured against
  const deepest = useMemo(
    () => Math.max(1, ...(layout?.units ?? []).map((one) => one.level)),
    [layout],
  )
  const biggest = useMemo(
    () => Math.max(1, ...(drawn?.spots ?? []).map((s) => Math.log1p(s.weight))),
    [drawn],
  )
  const boxAt = useMemo(() => new Map((drawn?.boxes ?? []).map((b) => [b.id, b])), [drawn])
  const at = useMemo(() => new Map((drawn?.spots ?? []).map((s) => [s.id, s])), [drawn])
  // said once the graph is read: several languages want telling apart, one wants its shape
  const painted = paint || (multi(langs) ? "language" : "shape")
  const hue = { painted, grain, graph, units, called, boxAt, deepest, biggest }
  const colourOf = colouring(hue)
  const legend = useMemo(() => legendOf(hue, drawn), [drawn, painted, grain, units, called])

  // the module a node belongs to, which is what a bundled line is drawn between
  const unitOfNode = (id: string) => {
    const spot = at.get(id)
    if (!spot) return boxAt.get(id)?.parent ?? id
    return grain === "declaration" ? (boxAt.get(spot.box)?.parent ?? spot.box) : spot.box
  }
  // the wires as they are drawn, which is what a cursor can land on
  const shown: Held[] = useMemo(
    () =>
      !drawn
        ? []
        : bundle || plan
          ? bundled(drawn.wires, unitOfNode)
          : drawn.wires.map((wire) => ({ ...wire, held: 1 })),
    [drawn, bundle, plan, grain],
  )
  const sits = useMemo(() => seating(at, boxAt), [at, boxAt])
  const bows = (): [unknown, number][] => [
    [imports, 1],
    [wired, -1],
    [http, 0],
  ]

  const carries = carrying(grain, split, routes)

  const hunted = find.trim().toLowerCase()

  // react listens passively, so bind the wheel by hand

  usePainting({
    board,
    wide,
    tall,
    view,
    drawing,
    schedule,
    seats,
    frames,
    moving,
    busy,
    scene: drawn && {
      drawn,
      at,
      boxAt,
      shown,
      sits,
      show: { grain, imports, calls: wired, http, bounds, names, numbers, bundle, plan, edges },
      picked: { only, near, edge, hunted },
      called,
      units,
      colourOf,
      owner,
    },
  })

  const { boxUnder, dotAt, lineAt, boxSpot } = hitting({ drawn, grain, view, shown, sits, bows })

  // the click says which, rather than picking
  const walk = (spot: Spot) =>
    going.open(
      grain === "declaration"
        ? symbol(spot.id, undefined, `declared in ${spot.box}`)
        : grain === "file"
          ? asFile(spot.id, `${plural(spot.weight, "line")}`)
          : asGroup(spot.id, called.get(spot.id)),
    )

  const opening = (wire: Held & { held: number }) => {
    const { said, asked } = carries(wire)
    going.open(linked(wire, said, asked, called))
  }

  const pointed = pointing({
    drawn,
    board,
    view,
    rushed,
    boxUnder,
    boxSpot,
    dotAt,
    lineAt,
    near,
    edge,
    setNear,
    setEdge,
    onSpot: walk,
    onLine: opening,
    onBox: (box) => {
      if (!box) return setOnly("")
      const same = box.id === only
      setOnly(same ? "" : box.id)
      if (same) whole()
      else zoomTo(box)
    },
  })

  if (!graph)
    return (
      <Loading stats={stats} current="Graph" what="Reading every import," rows={5} onward={false} />
    )

  const flags = { imports, calls: wired, http, bounds, names, numbers, bundle, moves, plan }
  const flipping: Record<Flag, (next: boolean) => void> = {
    imports: setImports,
    calls: setWired,
    http: setHttp,
    bounds: setBounds,
    names: setNames,
    numbers: setNumbers,
    bundle: setBundle,
    moves: setMoves,
    plan: setPlan,
  }
  const flip = (flag: Flag) => flipping[flag](!flags[flag])

  return (
    // contents, so every panel here is an item of the tab that holds it
    <div className="contents">
      <div className="flex flex-wrap items-center gap-2">
        <Back />
        <Save
          className="ml-auto"
          name="graph"
          picture={() => board.current}
          rows={() => [
            ["from", "to", "imports", "calls", "type only"],
            ...(drawn?.wires ?? []).map((w) => [w.from, w.to, w.imports, w.calls, String(w.types)]),
          ]}
          note={`${plural(drawn?.wires.length ?? 0, "link")} between ${plural(drawn?.spots.length ?? 0, "node")}, as`}
          extra={
            graph && layout && split
              ? [
                  {
                    name: "knowledge-graph",
                    label: "Knowledge graph",
                    note: "every module, file, declaration and install, and what relates them, at this grain, as",
                    rows: () =>
                      asRows(knowledge(stats.repo, { grain, split, graph, calls, layout })),
                  },
                ]
              : undefined
          }
        />
      </div>

      <NetToolbar
        grain={grain}
        setGrain={setGrain}
        langs={langs}
        lang={lang}
        setLang={setLang}
        paint={paint}
        setPaint={setPaint}
        edges={edges}
        setEdges={setEdges}
        find={find}
        setFind={setFind}
        api={!!routes?.links.length}
        on={flags}
        flip={flip}
      />

      <Section id="network_graph" className="flex flex-col gap-4">
        <GraphCard
          grain={grain}
          bounds={bounds}
          legend={legend}
          drawn={!!drawn}
          only={only}
          named={called.get(only) ?? only}
          onClear={() => {
            setOnly("")
            // the pick came from another tab
            if (going.at.pick) going.go({ pick: "" })
            whole()
          }}
          onFit={whole}
          heavy={heavy}
          size={size}
          onAnyway={() => setGo(true)}
          frame={frame}
          board={
            <canvas
              ref={board}
              className="block cursor-crosshair touch-none select-none"
              {...pointed}
            />
          }
        />

        <NetCaption
          drawn={drawn}
          near={near}
          edge={edge}
          said={(wire) => carries(wire as Held).said}
          called={called}
          bounds={bounds}
          api={!!routes?.links.length}
        />
      </Section>

      <ApiTables routes={routes} />
    </div>
  )
}
