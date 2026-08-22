// owner: finn
// goal: what a line carries, and the connection it opens as

import { link } from "../app/going.tsx"
import { plural, shortPath } from "../text/format.ts"
import type { Held } from "./wires.ts"
import type { Api, Link } from "../../../src/read/specs.ts"
import type { Grain } from "./network.ts"

/** what a wire carries, and which requests run along it */
export const carrying =
  (grain: Grain, split: Record<string, string> | null, routes: Api | null) => (wire: Held) => {
    const said = [
      wire.imports && `${plural(wire.imports, wire.types ? "type only import" : "import")}`,
      wire.calls && `${plural(wire.calls, "call")}`,
      wire.http && `${plural(wire.http, "request")}`,
    ].filter(Boolean) as string[]
    const held = (file: string) =>
      grain === "module" && split && typeof split === "object" ? (split[file] ?? file) : file
    const asked = (routes?.links ?? []).filter(
      (one) =>
        (one.from === wire.from || held(one.from) === wire.from) &&
        (one.to === wire.to || held(one.to) === wire.to),
    )
    return { said, asked }
  }

/** the line as something to open, with both of its ends to open in turn */
export const linked = (wire: Held, said: string[], asked: Link[], called: Map<string, string>) => {
  const naming = (id: string) => called.get(id) ?? shortPath(id.split("#")[0], 30)
  return link(
    wire.from,
    wire.to,
    said.join(" · "),
    asked.length ? (
      <span className="flex flex-col gap-1">
        <span>{said.join(" · ")}</span>
        <span className="flex flex-col gap-0.5 font-mono">
          {asked.slice(0, 12).map((one, i) => (
            <span key={`${one.call}:${i}`}>
              {one.method} {one.path}
            </span>
          ))}
          {asked.length > 12 && <span>… and {asked.length - 12} more</span>}
        </span>
      </span>
    ) : undefined,
    [naming(wire.from), naming(wire.to)],
  )
}
