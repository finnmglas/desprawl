// owner: finn
// goal: what the graph draws, as controls

import { Button } from "../../atoms/button.tsx"
import { Input } from "../../atoms/input.tsx"
import { Tabs } from "../../atoms/tabs.tsx"
import { Menu, MenuSection } from "../menu.tsx"
import { CALL, IMPORT, REQUEST } from "../../../lib/draw/paint.ts"
import { cn } from "../../../lib/app/ui.ts"
import type { Grain } from "../../../lib/draw/network.ts"

const GRAINS: Grain[] = ["module", "file", "function"]
const PAINTS = ["module", "language", "size", "shape", "level", "kind", "one colour"]
const WIRED = ["kind", "module", "leaving"]

export type Flag =
  "imports" | "calls" | "http" | "bounds" | "names" | "numbers" | "bundle" | "moves" | "plan"

interface Props {
  grain: Grain
  setGrain: (next: Grain) => void
  langs: string[]
  lang: string
  setLang: (next: string) => void
  paint: string
  setPaint: (next: string) => void
  edges: string
  setEdges: (next: string) => void
  find: string
  setFind: (next: string) => void
  /** anything serving http here, so the api toggle is worth showing */
  api: boolean
  on: Record<Flag, boolean>
  flip: (flag: Flag) => void
}

/** one of a list, ticked */
const picker = (all: string[], value: string, set: (next: string) => void) => (
  <div className="flex flex-col">
    {all.map((one) => (
      <button
        key={one}
        onClick={() => set(one)}
        className={cn(
          "hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
          one === value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="w-3">{one === value ? "✓" : ""}</span>
        {one}
      </button>
    ))}
  </div>
)

export function NetToolbar(props: Props) {
  const { grain, setGrain, langs, lang, setLang, find, setFind, api, on, flip } = props

  const toggle = (flag: Flag, label: string, tone?: string) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => flip(flag)}
      className={cn("gap-1.5", !on[flag] && "text-muted-foreground opacity-60")}
    >
      {tone && (
        <span
          className="size-2 rounded-full"
          style={{ background: `rgb(${tone})`, opacity: on[flag] ? 1 : 0.4 }}
        />
      )}
      {label}
    </Button>
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs tabs={GRAINS} value={grain} onChange={(next) => setGrain(next as Grain)} />
      {langs.length > 1 && (
        <Tabs
          tabs={["every language", ...langs]}
          value={lang || "every language"}
          onChange={(next) => setLang(next === "every language" ? "" : next)}
        />
      )}
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {toggle("imports", "imports", IMPORT)}
        {toggle("calls", "calls", CALL)}
        {api && toggle("http", "api", REQUEST)}
        {toggle("bounds", "bounds")}
        <Menu title="What to draw">
          <MenuSection
            label="Colour by"
            hint="language reads off the extension, module off the folder it was grouped into"
          >
            {picker(PAINTS, props.paint, props.setPaint)}
          </MenuSection>
          <MenuSection
            label="Colour lines by"
            hint="module takes the colour of the one it leaves, leaving greys out everything that stays inside one"
          >
            {picker(WIRED, props.edges, props.setEdges)}
          </MenuSection>
          <MenuSection label="Show">
            <div className="flex flex-wrap gap-1">
              {toggle("names", "labels")}
              {toggle("numbers", "numbers")}
              {toggle("bundle", "bundle")}
              {toggle("moves", "motion")}
              {toggle("plan", "architecture")}
            </div>
          </MenuSection>
        </Menu>
        <Input
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder="Find"
          className="w-32"
        />
      </div>
    </div>
  )
}
