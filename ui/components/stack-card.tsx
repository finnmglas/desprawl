// owner: finn
// goal: what this repo is, at a glance

import { Badge } from "./badge.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./card.tsx"
import { CopyButton } from "./copy-button.tsx"
import { Tip } from "./tip.tsx"
import { num } from "../lib/format.ts"
import { HINTS } from "../lib/hints.ts"
import { NOTES } from "../../src/notes.ts"
import type { Stack } from "../../src/stack.ts"

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
        ["Tools", [...stack.build, ...stack.bundlers]],
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
        ["APIs", stack.apis],
        ["Config", stack.env],
      ],
    },
  ]
}

const kept = (rows: [string, Items][]) =>
  rows.map(([label, items]) => [label, items.filter(Boolean)] as const).filter(([, i]) => i.length)

function Group({ title, rows }: Section) {
  const shown = kept(rows)
  if (!shown.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {title}
      </span>
      {shown.map(([label, items]) => (
        <div key={label} className="flex items-start gap-2">
          <Tip
            text={HINTS[label]}
            className="text-muted-foreground w-20 shrink-0 pt-1 text-xs leading-4"
          >
            {label}
          </Tip>
          <span className="flex flex-wrap gap-1">
            {items.map((item) => (
              <Tip key={String(item)} text={NOTES[String(item)]}>
                <Badge variant="secondary" className="font-normal">
                  {item}
                </Badge>
              </Tip>
            ))}
          </span>
        </div>
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
      <CardHeader className="flex-row flex-wrap items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle>Project metadata</CardTitle>
          <span className="text-muted-foreground text-xs">{identity}</span>
        </div>
        {stack.parts.map((part) => (
          <Badge key={part} variant="outline">
            {part}
          </Badge>
        ))}
        <CopyButton
          className="ml-auto"
          text={asText}
          message="Metadata copied"
          note="Every detected fact, as text"
        />
      </CardHeader>

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
            <Group key={section.title} {...section} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
