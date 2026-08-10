// owner: finn
// goal: what this repo is, at a glance

import { useState } from "react"
import { Badge } from "../atoms/badge.tsx"
import { Caret } from "../atoms/icons.tsx"
import { Card, CardContent } from "../atoms/card.tsx"
import { Chip } from "./chip.tsx"
import { CardHead } from "./card-head.tsx"
import { CopyButton } from "./copy-button.tsx"
import { DownloadButton } from "./download-button.tsx"
import { Tip } from "../atoms/tip.tsx"
import { named } from "../../lib/export.ts"
import { num } from "../../lib/format.ts"
import { HINTS } from "../../lib/hints.ts"
import { byWeight } from "../../lib/rank.ts"
import { cn } from "../../lib/ui.ts"
import type { Stack } from "../../../src/model.ts"

type Items = (string | number | false | 0 | undefined)[]
type Section = { title: string; rows: [string, Items][] }

/** One description of the repo, rendered as cards and copied as text */
function describe(stack: Stack): Section[] {
  const { containers: box, pinning: pin, strict } = stack
  const tsconfigs = strict.on + strict.off
  const ranged = pin.caret + pin.tilde

  return [
    {
      title: "Language",
      rows: [
        ["TypeScript", stack.typescript],
        ["Strict", [tsconfigs > 0 && `${strict.on} of ${tsconfigs} tsconfigs`]],
        ["Modules", [...stack.modules, ...stack.runtimes]],
        ["Node", stack.node],
      ],
    },
    {
      title: "Packages",
      rows: [
        ["Manager", [...stack.managers, ...(stack.lockfiles.length ? [] : ["no lockfile"])]],
        ["Manifests", [stack.manifests.length > 1 && `${stack.manifests.length} packages`]],
        [
          "Pinning",
          [
            stack.dependencies > 0 && `${num(stack.dependencies)} deps`,
            pin.exact > 0 && `${num(pin.exact)} pinned`,
            ranged > 0 && `${num(ranged)} ranged`,
            pin.linked > 0 && `${num(pin.linked)} linked`,
          ],
        ],
      ],
    },
    {
      title: "Application",
      rows: [
        ["Frameworks", stack.frameworks],
        ["State", stack.state],
        ["UI", [...new Set([...stack.ui, ...stack.styling])]],
        ["Content", stack.content],
        ["Visuals", stack.visuals],
      ],
    },
    {
      title: "Connected",
      rows: [
        ["Data", stack.connects],
        ["Auth", stack.auth],
        ["Telemetry", stack.observability],
        ["Ports", stack.ports],
      ],
    },
    {
      title: "Build",
      rows: [
        ["Tools", [...new Set([...stack.build, ...stack.bundlers])]],
        ["Testing", stack.testing],
        ["Lint", stack.linters],
        ["Format", stack.formatters],
      ],
    },
    {
      title: "Operations",
      rows: [
        ["CI", stack.ci],
        [
          "Containers",
          [
            box.dockerfiles > 0 && `${box.dockerfiles} Dockerfile`,
            box.compose > 0 && `${box.compose} compose`,
            box.kubernetes > 0 && `${box.kubernetes} kubernetes`,
            box.terraform > 0 && `${box.terraform} terraform`,
          ],
        ],
        ["Hosting", stack.hosts],
        ["APIs", stack.apis],
        ["Config", stack.env],
      ],
    },
  ]
}

const kept = (rows: [string, Items][]) =>
  rows.map(([label, items]) => [label, items.filter(Boolean)] as const).filter(([, i]) => i.length)

const SHOWN = 3

/** the structural ones first, the rest behind a count until asked for */
function Row({
  label,
  items,
  from,
}: {
  label: string
  items: string[]
  from: Record<string, string>
}) {
  const [all, setAll] = useState(false)
  const sorted = byWeight(items)
  const hidden = sorted.length - SHOWN

  return (
    <div className="flex items-start gap-2">
      <Tip
        text={HINTS[label]}
        className="text-muted-foreground w-20 shrink-0 pt-1 text-xs leading-4"
      >
        {label}
      </Tip>
      <span className="flex flex-wrap gap-1">
        {(all ? sorted : sorted.slice(0, SHOWN)).map((item) => (
          <Chip
            key={item}
            label={item}
            from={from[item]}
            // a port is somewhere you can actually go, as long as the thing is running
            href={label === "Ports" ? `http://localhost:${item}` : undefined}
            note={
              label === "Ports" ? `opens http://localhost:${item}, if it is running` : undefined
            }
          />
        ))}
        {hidden > 0 && (
          <Badge
            variant="outline"
            onClick={() => setAll(!all)}
            className="cursor-pointer font-normal"
            title={all ? "show fewer" : `show ${hidden} more`}
          >
            {all ? "less" : `+${hidden}`}
          </Badge>
        )}
      </span>
    </div>
  )
}

function Group({ title, rows, from }: Section & { from: Record<string, string> }) {
  const shown = kept(rows)
  if (!shown.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {title}
      </span>
      {shown.map(([label, items]) => (
        <Row key={label} label={label} items={items.map(String)} from={from} />
      ))}
    </div>
  )
}

export function StackCard({
  stack,
  folded,
  open: told,
  onOpen,
}: {
  stack: Stack
  folded?: boolean
  /** kept by the caller when it should outlive a reload */
  open?: boolean
  onOpen?: (open: boolean) => void
}) {
  const [own, setOwn] = useState(!folded)
  const open = told ?? own
  const setOpen = (next: boolean) => (onOpen ? onOpen(next) : setOwn(next))
  const sections = describe(stack)
  const identity = [
    stack.name,
    stack.version,
    stack.kind === "none" ? `no manifest, ${stack.primary || "no recognised language"}` : "",
    stack.license ?? (stack.private ? "private, no licence" : "no licence declared"),
    stack.vendored > 0 && `${stack.vendored} vendored licences`,
  ]
    .filter(Boolean)
    .join(" · ")

  const asText = () =>
    [
      identity,
      ...sections.flatMap(({ title, rows }) =>
        kept(rows).length
          ? [`\n${title}`, ...kept(rows).map(([label, items]) => `  ${label}: ${items.join(", ")}`)]
          : [],
      ),
    ].join("\n")

  const badges = (
    // centred on the card, not on the gap left between the title and the button
    <div className="order-last flex w-full flex-wrap justify-center gap-1 sm:absolute sm:inset-x-0 sm:order-none sm:mx-auto sm:w-fit">
      {stack.parts.map((part) => (
        <Tip key={part} text={HINTS[part]} side="bottom">
          <Badge variant="outline">{part}</Badge>
        </Tip>
      ))}
    </div>
  )

  const buttons = (
    <div className="ml-auto flex items-center gap-1">
      <CopyButton text={asText} message="Metadata copied" note="Every detected fact, as text" />
      <DownloadButton
        name={named("project-metadata.json")}
        text={() => JSON.stringify(stack, null, 2)}
        note="Every detected fact, as json"
      />
    </div>
  )

  const head = folded ? (
    <div className="relative flex flex-row flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex cursor-pointer items-center gap-1 text-sm leading-none"
        >
          Project metadata
          <Caret className={cn("transition-transform", !open && "-rotate-90")} />
        </button>
        <span className="text-muted-foreground text-xs">{identity}</span>
      </div>
      {badges}
      {buttons}
    </div>
  ) : (
    <CardHead
      title={
        folded ? (
          <button onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1">
            Project metadata
            <Caret className={cn("transition-transform", !open && "-rotate-90")} />
          </button>
        ) : (
          "Project metadata"
        )
      }
      hint={identity}
      wrap
    >
      {badges}
      {buttons}
    </CardHead>
  )

  const body = (
    <>
      {stack.kind === "none" && (
        <p className="text-muted-foreground mb-3 text-xs">
          No package manifest or tsconfig here, so this is not a node project.{" "}
          {stack.primary ? (
            <>
              Its largest language is <span className="font-medium">{stack.primary}</span>.
            </>
          ) : (
            "Nothing tracked here is a language desprawl recognises."
          )}
        </p>
      )}

      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Group key={section.title} {...section} from={stack.from} />
        ))}
      </div>
    </>
  )

  if (folded)
    // the rule runs the whole width of the card, the content inside it does not
    return (
      <div className="-mx-4 mt-4 border-t px-4 pt-4">
        <div className="flex flex-col gap-3">
          {head}
          {open && body}
        </div>
      </div>
    )

  return (
    <Card>
      {head}
      <CardContent className="pt-1">{body}</CardContent>
    </Card>
  )
}
