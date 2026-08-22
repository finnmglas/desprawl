// owner: finn
// goal: the two sides of the api, as rows

import { Badge } from "../../atoms/badge.tsx"
import { Section } from "../../atoms/section.tsx"
import { DataTable, type Column } from "../panels/data-table.tsx"
import { file as asFile, useGoing } from "../../../lib/app/going.tsx"
import { shortPath } from "../../../lib/say/format.ts"
import type { Api, Client, Endpoint } from "../../../../src/read/specs.ts"

interface Served extends Endpoint {
  /** call sites that reach it, from anywhere in the fleet */
  callers: number
}

interface Asked extends Client {
  /** the file serving it, empty when nothing here does */
  reaches: string
}

const WHERE = (file: string, line: number) => (
  <span className="font-mono text-xs">
    {shortPath(file, 46)}:{line}
  </span>
)

const VERB = (method: string) => (
  <Badge variant="outline" className="font-mono text-[11px]">
    {method}
  </Badge>
)

const PATH = (path: string) => <span className="font-mono text-xs">{path}</span>

const FILE = (path: string | undefined) =>
  path ? <span className="font-mono text-xs">{shortPath(path, 40)}</span> : "-"

// prettier-ignore
const ENDS: Column<Served>[] = [
  { key: "method", label: "verb", get: (one) => one.method, cell: (one) => VERB(one.method), left: true },
  { key: "path", label: "path", get: (one) => one.path, cell: (one) => PATH(one.path) },
  { key: "callers", label: "called from", num: true, get: (one) => one.callers },
  { key: "framework", label: "by", get: (one) => one.framework },
  { key: "where", label: "declared in", get: (one) => `${one.file}:${one.line}`, cell: (one) => WHERE(one.file, one.line) },
  { key: "handler", label: "answered by", get: (one) => one.handler ?? "", cell: (one) => FILE(one.handler) },
]

// prettier-ignore
const SITES: Column<Asked>[] = [
  { key: "method", label: "verb", get: (one) => one.method, cell: (one) => VERB(one.method), left: true },
  // a graphql call carries its operation, since its path says nothing about what it asks
  { key: "path", label: "path", get: (one) => one.name ?? one.path, cell: (one) => PATH(one.name ?? one.path) },
  { key: "host", label: "host", get: (one) => one.host || "", cell: (one) => one.host || "-" },
  { key: "reaches", label: "reaches", get: (one) => one.reaches || "outside",
    cell: (one) => one.reaches ? FILE(one.reaches) : <span className="text-muted-foreground">outside</span> },
  { key: "framework", label: "by", get: (one) => one.framework },
  { key: "where", label: "called in", get: (one) => `${one.file}:${one.line}`, cell: (one) => WHERE(one.file, one.line) },
]

/** what this code answers on, and what it calls, each row opening the file behind it */
export function ApiTables({ routes }: { routes: Api | null }) {
  const going = useGoing()
  if (!routes?.endpoints.length && !routes?.clients.length) return null

  const by = new Map<string, number>()
  for (const one of routes.links) by.set(one.endpoint, (by.get(one.endpoint) ?? 0) + 1)
  const served: Served[] = routes.endpoints
    .map((one) => ({ ...one, callers: by.get(one.id) ?? 0 }))
    .sort((a, b) => b.callers - a.callers || a.path.localeCompare(b.path))

  const to = new Map(routes.links.map((one) => [one.call, one.to]))
  const asked: Asked[] = routes.clients
    .map((one) => ({ ...one, reaches: to.get(one.id) ?? "" }))
    .sort((a, b) => (b.reaches ? 1 : 0) - (a.reaches ? 1 : 0) || a.path.localeCompare(b.path))

  return (
    <>
      {served.length > 0 && (
        <Section id="table_endpoints">
          <DataTable
            title="Endpoints served here"
            hint="every path this code answers on, off the routers and the route files themselves"
            rows={served}
            id={(one) => one.id}
            columns={ENDS}
            onRowClick={(one) => going.open(asFile(one.handler ?? one.file, one.path))}
            file="endpoints"
          />
        </Section>
      )}

      {asked.length > 0 && (
        <Section id="table_requests">
          <DataTable
            title="Call sites"
            hint={`every http request this code makes, and the endpoint it lands on when one is here${
              routes.stats.unread
                ? `. ${routes.stats.unread} more were written without a path to read, through a wrapper or a constant`
                : ""
            }`}
            rows={asked}
            id={(one) => one.id}
            columns={SITES}
            onRowClick={(one) => going.open(asFile(one.file, `${one.method} ${one.path}`))}
            file="call-sites"
          />
        </Section>
      )}
    </>
  )
}
