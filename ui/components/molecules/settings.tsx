// owner: finn
// goal: everything the header menu offers

import { Copy, Download, Refresh } from "../atoms/icons.tsx"
import { Menu, MenuItem, MenuSection } from "./menu.tsx"
import { Tabs } from "../atoms/tabs.tsx"
import { toast } from "../atoms/toast.tsx"
import { copy, download, named } from "../../lib/export.ts"
import { resetSections, useCustomized } from "../../lib/sections.ts"
import { CHOICES, LABELS, locale, setLocale } from "../../lib/locale.ts"
import {
  BRANDINGS,
  CURVES,
  EXPLAIN,
  SCALES,
  type Brands,
  type Curve,
  type Scale,
} from "../../lib/display.tsx"
import { num } from "../../lib/format.ts"
import { callGraph, importGraph, isLive, staticPage } from "../../lib/live.ts"
import { notes } from "../../lib/paper.ts"
import { slides } from "../../lib/slides.ts"
import type { Prefs } from "../../lib/prefs.ts"
import type { Stats } from "../../../src/model.ts"

/** a graph offered as json, live or carried by a static page */
function Pull<T>({
  held,
  ask,
  file,
  label,
  said,
}: {
  held: T | null | undefined
  ask: () => Promise<T | null>
  file: string
  label: string
  said: (got: T) => string
}) {
  if (!isLive() && !held) return null
  return (
    <MenuItem
      onClick={async () => {
        const got = await ask()
        if (!got) return
        const name = named(file)
        download(name, JSON.stringify(got, null, 2), "application/json")
        toast(name, said(got))
      }}
    >
      <Download />
      {label}
    </MenuItem>
  )
}

/** a labelled row of choices, the shape every setting here takes */
function Choice({
  label,
  hint,
  tabs,
  value,
  onChange,
}: {
  label: string
  hint: string
  tabs: string[]
  value: string
  onChange: (next: string) => void
}) {
  return (
    <MenuSection label={label} hint={hint}>
      <Tabs grow tabs={tabs} value={value} onChange={onChange} />
    </MenuSection>
  )
}

export function Settings({
  stats,
  prefs,
  change,
  reload,
  onPaper,
}: {
  stats: Stats
  prefs: Prefs
  change: (next: Partial<Prefs>) => void
  reload?: () => void
  /** renders every tab at once and paints them into one file */
  onPaper?: (kind: "pdf" | "pptx") => void
}) {
  const { scale, curve, region, brands } = prefs
  const customized = useCustomized()

  const share = async () =>
    toast(
      (await copy(location.href)) ? "Link copied" : "Copy blocked by the browser",
      "Opens on this exact folder and language",
    )

  return (
    <Menu>
      {reload && (
        <MenuItem onClick={reload}>
          <Refresh />
          refresh contents
        </MenuItem>
      )}
      <MenuItem onClick={share}>
        <Copy />
        copy link to this page
      </MenuItem>
      {customized && (
        <MenuItem
          onClick={() => {
            resetSections()
            toast("Panels reset", "every tab back to its default panels, in order")
          }}
        >
          <Refresh />
          reset panel layout
        </MenuItem>
      )}
      <div className="bg-border my-1 h-px" />
      <MenuItem
        onClick={() => {
          const file = named("stats.json")
          download(file, JSON.stringify(stats, null, 2), "application/json")
          toast(file, "The whole report, tree and series included")
        }}
      >
        <Download />
        git-stats (json)
      </MenuItem>
      <Pull
        held={window.__DESPRAWL_GRAPH__}
        ask={importGraph}
        file="imports.json"
        label="import-graph (json)"
        said={(got) => `${num(got.stats.edges)} imports between ${num(got.stats.files)} files`}
      />
      <Pull
        held={window.__DESPRAWL_CALLS__}
        ask={callGraph}
        file="calls.json"
        label="call-graph (json)"
        said={(got) =>
          `${num(got.stats.symbols)} declarations, ${num(got.stats.edges)} calls between them`
        }
      />
      {isLive() && (
        <MenuItem
          onClick={async () => {
            const made = await staticPage()
            if (!made) return
            const file = named("desprawl.html")
            download(file, made, "text/html")
            toast(file, "The whole report in one file, with both graphs inside it")
          }}
        >
          <Download />
          full static desprawl (html)
        </MenuItem>
      )}
      {onPaper && (
        <>
          <MenuItem onClick={() => onPaper("pdf")}>
            <Download />
            every tab (pdf)
          </MenuItem>
          <MenuItem onClick={() => onPaper("pptx")}>
            <Download />
            every tab (pptx)
          </MenuItem>
        </>
      )}
      <MenuItem
        onClick={async () => {
          const graph = window.__DESPRAWL_GRAPH__ ?? (isLive() ? await importGraph() : null)
          const made = slides(stats, graph)
          const file = named("desprawl-notes.pptx")
          await notes(made, stats.repo, file)
          toast(file, `${made.length} slides, the numbers as text`)
        }}
      >
        <Download />
        panels as text (pptx)
      </MenuItem>
      <div className="bg-border my-1 h-px" />
      <Choice
        label="Number relation"
        hint={EXPLAIN[scale]}
        tabs={SCALES}
        value={scale}
        onChange={(next) => change({ scale: next as Scale })}
      />
      <Choice
        label="Bar scale"
        hint={curve === "log" ? "small values stay visible" : "true proportions"}
        tabs={CURVES}
        value={curve}
        onChange={(next) => change({ curve: next as Curve })}
      />
      <Choice
        label="Brand colours"
        hint={
          brands === "flashy"
            ? "every logo, in its own colour"
            : brands === "focus"
              ? "logos on tools, plain colour swatches on languages"
              : "colours that carry meaning only"
        }
        tabs={BRANDINGS}
        value={brands}
        onChange={(next) => change({ brands: next as Brands })}
      />
      <Choice
        label="Numbers and dates"
        hint={`${locale()} · ${num(1234.5)}`}
        tabs={CHOICES.map((c) => LABELS[c])}
        value={LABELS[region]}
        onChange={(next) => {
          const found = CHOICES.find((c) => LABELS[c] === next) ?? "auto"
          setLocale(found)
          change({ region: found })
        }}
      />
    </Menu>
  )
}
