// owner: finn
// goal: what this repo is, at a glance

import { useState } from "react"
import { Badge } from "./badge.tsx"
import { Card, CardContent } from "./card.tsx"
import { Chip } from "./chip.tsx"
import { CardHead } from "./card-head.tsx"
import { CopyButton } from "./copy-button.tsx"
import { DownloadButton } from "./download-button.tsx"
import { Tip } from "./tip.tsx"
import { named } from "../lib/export.ts"
import { num } from "../lib/format.ts"
import { HINTS } from "../lib/hints.ts"
import { byWeight } from "../lib/rank.ts"
import type { Stack } from "../../src/model.ts"

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
          <Chip key={item} label={item} from={from[item]} />
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

export function StackCard({ stack }: { stack: Stack }) {
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

  return (
    <Card>
      <CardHead title="Project metadata" hint={identity} wrap>
        {/* centred on the card, not on the gap left between the title and the button */}
        <div className="order-last flex w-full flex-wrap justify-center gap-1 sm:absolute sm:inset-x-0 sm:order-none sm:mx-auto sm:w-fit">
          {stack.parts.map((part) => (
            <Tip key={part} text={HINTS[part]} side="bottom">
              <Badge variant="outline">{part}</Badge>
            </Tip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton text={asText} message="Metadata copied" note="Every detected fact, as text" />
          <DownloadButton
            name={named("project-metadata.json")}
            text={() => JSON.stringify(stack, null, 2)}
            note="Every detected fact, as json"
          />
        </div>
      </CardHead>

      <CardContent className="pt-1">
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
      </CardContent>
    </Card>
  )
}
