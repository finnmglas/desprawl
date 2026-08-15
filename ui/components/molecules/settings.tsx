// owner: finn
// goal: everything the header menu offers

import { useState } from "react"
import { Copy, Download, Refresh } from "../atoms/icons.tsx"
import { Menu, MenuItem, MenuSection } from "./menu.tsx"
import { Exports } from "./exports.tsx"
import { Tabs } from "../atoms/tabs.tsx"
import { toast } from "../atoms/toast.tsx"
import { copy } from "../../lib/export.ts"
import { resetSections, useCustomized } from "../../lib/sections.ts"
import { CHOICES, LABELS, locale, setLocale } from "../../lib/locale.ts"
import {
  BRANDINGS,
  CURVES,
  EXPLAIN,
  SCALES,
  SHOWN,
  type Brands,
  type Curve,
  type Scale,
  type Shown,
} from "../../lib/display.tsx"
import { num } from "../../lib/format.ts"
import { THEMES, type ThemeState } from "../../lib/theme.tsx"
import type { Prefs } from "../../lib/prefs.ts"
import type { Stats } from "../../../src/model.ts"

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
  themed,
}: {
  stats: Stats
  prefs: Prefs
  change: (next: Partial<Prefs>) => void
  reload?: () => void
  /** renders every tab at once and paints them into one file */
  onPaper?: (kind: "pdf" | "pptx") => void
  themed: ThemeState
}) {
  const { scale, curve, region, brands, rows } = prefs
  const customized = useCustomized()
  const [exporting, setExporting] = useState(false)

  const share = async () =>
    toast(
      (await copy(location.href)) ? "Link copied" : "Copy blocked by the browser",
      "Opens on this exact folder and language",
    )

  return (
    <>
      <Exports
        open={exporting}
        onClose={() => setExporting(false)}
        stats={stats}
        onPaper={onPaper}
      />
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
        <MenuItem onClick={() => setExporting(true)}>
          <Download />
          export data
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
        <Choice
          label="Theme"
          hint={
            themed.theme === "system"
              ? `follows your device, now ${themed.resolved}`
              : "your choice"
          }
          tabs={[...THEMES]}
          value={themed.theme}
          onChange={(next) => themed.setTheme(next as ThemeState["theme"])}
        />
        <Choice
          label="Show rows"
          hint={
            rows === "virtual"
              ? "ten rows tall, scrolled, all of them in there"
              : rows === "all"
                ? "every row printed, however many that is"
                : `${rows} rows, the rest behind a row that opens them`
          }
          tabs={SHOWN}
          value={rows}
          onChange={(next) => change({ rows: next as Shown })}
        />
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
    </>
  )
}
