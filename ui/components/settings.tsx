// owner: finn
// goal: everything the header menu offers

import { Copy, Download, Refresh } from "./icons.tsx"
import { Menu, MenuItem, MenuSection } from "./menu.tsx"
import { Tabs } from "./tabs.tsx"
import { toast } from "./toast.tsx"
import { copy, download, named } from "../lib/export.ts"
import { CHOICES, LABELS, locale, setLocale } from "../lib/locale.ts"
import {
  BRANDINGS,
  CURVES,
  EXPLAIN,
  SCALES,
  type Brands,
  type Curve,
  type Scale,
} from "../lib/display.tsx"
import { num } from "../lib/format.ts"
import { callGraph, importGraph, isLive } from "../lib/live.ts"
import type { Prefs } from "../lib/prefs.ts"
import type { Stats } from "../../src/model.ts"

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
}: {
  stats: Stats
  prefs: Prefs
  change: (next: Partial<Prefs>) => void
  reload?: () => void
}) {
  const { scale, curve, region, brands } = prefs

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
      {isLive() && (
        <MenuItem
          onClick={async () => {
            const graph = await callGraph()
            if (!graph) return
            const file = named("calls.json")
            download(file, JSON.stringify(graph, null, 2), "application/json")
            toast(
              file,
              `${num(graph.stats.symbols)} declarations, ${num(graph.stats.edges)} calls between them`,
            )
          }}
        >
          <Download />
          call-graph (json)
        </MenuItem>
      )}
      {isLive() && (
        <MenuItem
          onClick={async () => {
            const graph = await importGraph()
            if (!graph) return
            const file = named("imports.json")
            download(file, JSON.stringify(graph, null, 2), "application/json")
            toast(file, `${num(graph.stats.edges)} imports between ${num(graph.stats.files)} files`)
          }}
        >
          <Download />
          import-graph (json)
        </MenuItem>
      )}
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
