// owner: finn
// goal: every installed package, its licence and what is filed against it

import { useEffect, useMemo, useState } from "react"
import { Badge } from "../../atoms/badge.tsx"
import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { Section } from "../../atoms/section.tsx"
import { Tabs } from "../../atoms/tabs.tsx"
import { Tip } from "../../atoms/tip.tsx"
import { Waiting } from "../../atoms/waiting.tsx"
import { DataTable, type Column } from "./data-table.tsx"
import { REGISTRIES, linkTo } from "../../../../src/facts/registries.ts"
import { dependencies } from "../../../lib/app/live.ts"
import { ago, day, plural, weight } from "../../../lib/text/format.ts"
import { OUTLINE, RANK, familyOf, worst } from "../../../lib/text/verdict.ts"
import { cn } from "../../../lib/app/ui.ts"
import type { Dep, Deps } from "../../../../src/facts/deps.ts"

// prettier-ignore
/** the pinned row at the bottom, which answers for the list rather than for a package */
type Row = Dep & { every?: Dep[] }

// what this repo asked for, against everything that arrived with it
const SCOPE = ["direct deps", "all deps"]
/** two years without a release: not dead, but worth knowing before leaning on it */
const quiet = (released: string) => !!released && Date.now() - Date.parse(released) > 730 * 864e5

const FAMILY: Record<string, string> = {
  permissive: OUTLINE.good,
  weak: OUTLINE.warn,
  strong: OUTLINE.bad,
  closed: "border-foreground/40",
  unknown: OUTLINE.quiet,
}

const WHERE: Column<Row> = {
  key: "ecosystem",
  label: "Registry",
  get: (one) => one.ecosystem,
  cell: (one) =>
    one.every ? (
      <span className="text-muted-foreground">
        {new Set(one.every.map((d) => d.ecosystem)).size} of them
      </span>
    ) : (
      <span className="text-muted-foreground text-xs">
        {REGISTRIES[one.ecosystem]?.label ?? one.ecosystem}
      </span>
    ),
  hint: "which package registry it is installed from, since a repo of several languages draws from several",
}

const DEPS: Column<Row>[] = [
  {
    key: "name",
    label: "Package",
    get: (one) => one.name,
    cell: (one) =>
      one.every ? (
        <span className="font-medium">{plural(one.every.length, "package")}</span>
      ) : (
        <a
          href={linkTo(one.name, one.ecosystem)}
          target="_blank"
          rel="noreferrer"
          title={`${one.name} on ${REGISTRIES[one.ecosystem]?.label ?? one.ecosystem}`}
          className="hover:text-foreground underline decoration-dotted"
        >
          {one.name}
        </a>
      ),
  },
  {
    key: "version",
    label: "Version",
    get: (one) => one.version || one.range,
    cell: (one) =>
      one.every ? (
        <span className="text-muted-foreground">
          {new Set(one.every.map((d) => d.name)).size} named
        </span>
      ) : (
        <Tip
          text={
            one.version
              ? `${one.range} in the manifest, ${one.version} on disk`
              : "not installed here, so the range is all there is"
          }
        >
          <span className="font-mono text-xs">{one.version || one.range}</span>
        </Tip>
      ),
    hint: "installed, or what the manifest asks for",
  },
  {
    key: "license",
    label: "Licence",
    get: (one) => one.license || "unknown",
    cell: (one) => {
      if (!one.every)
        return one.license ? (
          <Badge variant="outline" className={FAMILY[familyOf(one.license)]}>
            {one.license}
          </Badge>
        ) : (
          <span className="text-muted-foreground">unknown</span>
        )
      // what the whole list asks of the code around it, counted rather than judged
      const by = new Map<string, number>()
      for (const dep of one.every)
        by.set(familyOf(dep.license), (by.get(familyOf(dep.license)) ?? 0) + 1)
      const named = new Map<string, number>()
      for (const dep of one.every)
        named.set(dep.license || "unknown", (named.get(dep.license || "unknown") ?? 0) + 1)
      return (
        <Tip
          text={[...named]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => `${name}: ${n}`)
            .join(" · ")}
        >
          <span className="flex flex-wrap gap-1">
            {(["permissive", "weak", "strong", "closed", "unknown"] as const)
              .filter((kind) => by.get(kind))
              .map((kind) => (
                <Badge key={kind} variant="outline" className={FAMILY[kind]}>
                  {by.get(kind)} {kind}
                </Badge>
              ))}
          </span>
        </Tip>
      )
    },
    hint: "off the installed package, never guessed. Permissive asks for attribution, weak asks for changes to the package back, strong asks about the code around it, closed licensed you nothing",
  },
  {
    key: "bytes",
    label: "Size",
    num: true,
    get: (one) => (one.every ? one.every.reduce((n, d) => n + d.bytes, 0) : one.bytes),
    cell: (one) => {
      const bytes = one.every ? one.every.reduce((n, d) => n + d.bytes, 0) : one.bytes
      return bytes ? (
        <Tip
          text={
            one.every
              ? "every package here added up, each counted once"
              : "its own files, without whatever it installed under itself"
          }
        >
          <span>{weight(bytes)}</span>
        </Tip>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
    hint: "its own files on disk: what it pulled in weighs its own row",
  },
  {
    key: "released",
    label: "Last release",
    num: true,
    flat: true,
    get: (one) => one.released.slice(0, 10),
    cell: (one) => {
      if (one.every)
        return (
          <span className="text-muted-foreground">
            {one.every.filter((d) => quiet(d.released)).length} over 2 years
          </span>
        )
      if (!one.released)
        return (
          <Tip text="asked for the packages this repo names, not for everything they pull in">
            <span className="text-muted-foreground">—</span>
          </Tip>
        )
      return (
        <Tip text={`npm last published anything for it on ${day(one.released)}`}>
          <span className={quiet(one.released) ? "text-amber-600 dark:text-amber-400" : ""}>
            {ago(one.released)}
          </span>
        </Tip>
      )
    },
    hint: "when npm last saw a release, for the packages this repo names. Two quiet years is worth a look, not a verdict",
  },
  {
    key: "used",
    label: "This version",
    num: true,
    flat: true,
    get: (one) => one.used.slice(0, 10),
    cell: (one) => {
      if (one.every) {
        const behind = one.every.filter((d) => d.latest && d.version !== d.latest).length
        return <span className="text-muted-foreground">{behind} behind</span>
      }
      if (!one.used)
        return (
          <Tip text="asked for the packages this repo names, not for everything they pull in">
            <span className="text-muted-foreground">—</span>
          </Tip>
        )
      const stale = !!one.latest && one.version !== one.latest
      return (
        <Tip
          text={`${one.version} was published on ${day(one.used)}${stale ? `, and ${one.latest} is out` : ", which is the newest there is"}`}
        >
          <span>{ago(one.used)}</span>
        </Tip>
      )
    },
    hint: "when the installed version was published. Hover says whether a newer one is out",
  },
  {
    key: "kind",
    label: "Imported by",
    get: (one) => (one.direct ? (one.dev ? "dev" : "prod") : "indirectly"),
    cell: (one) =>
      one.every ? (
        <span className="text-muted-foreground">
          {one.every.filter((d) => d.direct).length} named
        </span>
      ) : one.direct ? (
        <Tip text={one.dev ? "a dev dependency, so it never ships" : "named in package.json"}>
          <Badge variant="outline">{one.dev ? "dev" : "prod"}</Badge>
        </Tip>
      ) : (
        <Tip text="nothing here asked for it, something it depends on did">
          <span className="text-muted-foreground">indirectly</span>
        </Tip>
      ),
    hint: "whether this repo names it, and whether anything that ships reaches it. Read through the whole tree, so what a dev package pulls in is dev too",
  },
  {
    key: "advisories",
    label: "Security issues",
    num: true,
    flat: true,
    good: true,
    get: (one) => one.advisories.length,
    cell: (one) =>
      one.every ? (
        <span className={one.every.some((d) => d.advisories.length) ? "" : "text-muted-foreground"}>
          {one.every.reduce((n, d) => n + d.advisories.length, 0)} on{" "}
          {one.every.filter((d) => d.advisories.length).length}
        </span>
      ) : one.advisories.length ? (
        <Tip
          text={
            <>
              {one.advisories.slice(0, 4).map((a) => (
                <span key={a.id} className="block">
                  {a.id}: {a.summary}
                </span>
              ))}
              {one.advisories.length > 4 && <>and {one.advisories.length - 4} more</>}
            </>
          }
        >
          <a
            href={one.advisories[0].url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "underline decoration-dotted",
              worst(one.advisories) === "CRITICAL" || worst(one.advisories) === "HIGH"
                ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {one.advisories.length} {worst(one.advisories).toLowerCase()}
          </a>
        </Tip>
      ) : (
        <span className="text-muted-foreground">none</span>
      ),
    hint: "open sec issues for this version, from osv.dev",
  },
]
export function DepsCard() {
  const [kit, setKit] = useState<Deps | null>(null)
  const [scope, setScope] = useState(SCOPE[0])
  const [hunt, setHunt] = useState("")
  useEffect(() => {
    void dependencies().then(setKit)
  }, [])
  // the totals row is a prop, so it is told what the search left
  const scoped = useMemo(
    () => (kit?.list ?? []).filter((one) => scope === SCOPE[1] || one.direct),
    [kit, scope],
  )
  // nothing is installed that the manifest did not ask for, so both scopes are one list
  const shallow = useMemo(() => (kit?.list ?? []).every((one) => one.direct), [kit])
  // one registry needs no column saying so on every row, several do
  const columns = useMemo(() => {
    const many = new Set((kit?.list ?? []).map((one) => one.ecosystem)).size > 1
    return many ? [DEPS[0], DEPS[1], WHERE, ...DEPS.slice(2)] : DEPS
  }, [kit])
  const picked = useMemo(() => {
    const said = hunt.trim().toLowerCase()
    // the same match the table itself searches with, so the totals row agrees
    return said
      ? scoped.filter((one) =>
          columns.some((col) => String(col.get(one)).toLowerCase().includes(said)),
        )
      : scoped
  }, [scoped, hunt, columns])

  return (
    <>
      {/* the registry read is the slowest thing on this tab, and a panel that is missing
          until it lands reads as a repo with no dependencies */}
      {!kit && (
        <Section id="table_deps">
          <Card>
            <CardHead
              title="External dependencies"
              hint="licences off disk, advisories from osv.dev"
            />
            <CardContent>
              <Waiting
                what="Reading every installed package,"
                slow="osv.dev is being asked about each one."
                rows={5}
              />
            </CardContent>
          </Card>
        </Section>
      )}
      {kit && kit.list.length > 0 && (
        <Section id="table_deps">
          <DataTable
            title="External dependencies"
            hint={
              kit.offline
                ? "licences from node_modules, check didn't reach osv.dev"
                : kit.missed
                  ? `${plural(picked.length, "package")}: osv.dev named ${kit.missed} advisories it then would not describe, so this column is short`
                  : `${plural(picked.length, "package")}, licences from disk, security from osv.dev on ${day(kit.checked)}`
            }
            // worst first
            onFind={setHunt}
            rows={[...scoped].sort(
              (a, b) =>
                b.advisories.length - a.advisories.length ||
                RANK.indexOf(worst(a.advisories)) - RANK.indexOf(worst(b.advisories)) ||
                a.name.localeCompare(b.name),
            )}
            // dupes
            id={(one) => `${one.name}@${one.version}`}
            columns={columns}
            total={{ ...kit.list[0], name: "", every: picked }}
          >
            {!shallow && (
              <div className="ml-auto flex items-center gap-2">
                <Tabs tabs={SCOPE} value={scope} onChange={setScope} />
              </div>
            )}
          </DataTable>
        </Section>
      )}{" "}
    </>
  )
}
