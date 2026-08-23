// owner: finn
// goal: the buttons the header ends with, and what each of them opens

import { Download, Refresh, Sliders } from "../../atoms/icons.tsx"
import { Button } from "../../atoms/button.tsx"
import { MenuSection } from "../menu.tsx"
import { Dialog } from "../../atoms/dialog.tsx"
import { Note } from "../../atoms/card.tsx"
import { Exports } from "../exports.tsx"
import { Tabs } from "../../atoms/tabs.tsx"
import { toast } from "../../atoms/toast.tsx"
import { useGoing } from "../../../lib/app/going.tsx"
import { resetSections, useArranging, useCustomized } from "../../../lib/app/sections.ts"
import { CHOICES, LABELS, locale, setLocale } from "../../../lib/text/locale.ts"
import {
  BRANDINGS,
  COMPARES,
  CURVES,
  EXPLAIN,
  SCALES,
  SHOWN,
  SINCE,
  type Brands,
  type Compare,
  type Curve,
  type Scale,
  type Shown,
} from "../../../lib/app/display.tsx"
import { num } from "../../../lib/text/format.ts"
import { THEMES, type ThemeState } from "../../../lib/app/theme.tsx"
import type { Prefs } from "../../../lib/app/prefs.ts"
import type { Stats } from "../../../../src/read/model.ts"

/** a labelled row of choices, the shape every setting here takes */
function Choice({
  label,
  hint,
  tabs,
  value,
  onChange,
  tight,
}: {
  label: string
  hint: string
  tabs: string[]
  value: string
  onChange: (next: string) => void
  /** six of them: a strip that scrolls hides the last choice from a reader looking for it */
  tight?: boolean
}) {
  return (
    <MenuSection label={label} hint={hint}>
      <Tabs
        grow
        tabs={tabs}
        value={value}
        onChange={onChange}
        className={tight ? "[&>button]:px-1.5" : undefined}
      />
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
  const { scale, curve, region, brands, rows, compare } = prefs
  const customized = useCustomized()
  const [arranging, setArranging] = useArranging()
  // which one is open lives in the url beside the tab, so it is linkable and survives a reload
  const { at, go } = useGoing()
  const show = (which: string) => go({ dialog: which })
  const close = () => go({ dialog: "" })

  return (
    <>
      <Exports open={at.dialog === "export"} onClose={close} stats={stats} onPaper={onPaper} />
      <Dialog
        open={at.dialog === "settings"}
        onClose={close}
        title={
          <>
            <div className="text-base font-semibold">Settings</div>
            <Note>Kept as you pick them, on every tab and the next time you open this</Note>
          </>
        }
      >
        <Choice
          label="Arrange panels"
          hint={
            arranging
              ? "each panel offers move, hide and drag on hover"
              : "panels stay where they are"
          }
          tabs={["off", "on"]}
          value={arranging ? "on" : "off"}
          onChange={(next) => setArranging(next === "on")}
        />
        {customized && (
          <div className="flex items-center justify-between gap-3 px-2">
            <Note>a panel was moved or hidden on one of the tabs</Note>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetSections()
                toast("Panels reset", "every tab back to its default panels, in order")
              }}
            >
              <Refresh />
              reset layout
            </Button>
          </div>
        )}
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
          tight
          label="KPI comparison"
          hint={SINCE[compare]}
          tabs={COMPARES}
          value={compare}
          onChange={(next) => change({ compare: next as Compare })}
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
      </Dialog>
      {/* on dark the page behind is darker, so an unfilled button reads as a hole */}
      {reload && (
        <Button
          variant="outline"
          size="icon"
          className="bg-card"
          title="Refresh contents"
          onClick={reload}
        >
          <Refresh className="size-4" />
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        className="bg-card"
        title="Export data"
        onClick={() => show("export")}
      >
        <Download className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="bg-card"
        title="Settings"
        onClick={() => show("settings")}
      >
        <Sliders />
      </Button>
    </>
  )
}
