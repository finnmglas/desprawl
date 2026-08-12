// owner: finn
// goal: what each dependency is licensed as, and what is filed against it

import { readFileSync, readdirSync, realpathSync, statSync, type Dirent } from "node:fs"
import { join } from "node:path"
import { git } from "./model.ts"
import { jsonc } from "./graph.ts"

export interface Advisory {
  id: string
  summary: string
  severity: string
  url: string
}

export interface Dep {
  name: string
  /** what the manifest asks for, empty when nothing here asked for it directly */
  range: string
  /** what is actually installed, when it is */
  version: string
  license: string
  dev: boolean
  /** named by this repo's manifest, rather than pulled in by something that was */
  direct: boolean
  /** when npm last saw any release of it, asked for the named ones only */
  released: string
  /** when the version installed here was published, which is what says how far behind it is */
  used: string
  /** the version the registry calls latest, so behind is a version and not a timestamp */
  latest: string
  /** what it weighs on disk, its own files only, since what it installed is its own row */
  bytes: number
  advisories: Advisory[]
}

const PACE = 16

/** what the registry says about one package: when each version landed, and which is current */
interface Told {
  times: Record<string, string>
  latest: string
}

/**
 * When each version of a package was published. The abbreviated document is smaller but
 * carries no dates at all, and the date of the version actually installed is the one that
 * says whether this clone is behind, so the whole document is what gets asked for.
 */
async function published(names: string[]): Promise<Map<string, Told>> {
  const when = new Map<string, Told>()
  const queue = [...names]
  await Promise.all(
    Array.from({ length: PACE }, async () => {
      for (let name = queue.pop(); name; name = queue.pop()) {
        try {
          const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`)
          if (!res.ok) continue
          const body = (await res.json()) as {
            modified?: string
            time?: Record<string, string>
            "dist-tags"?: Record<string, string>
          }
          const times = body.time ?? {}
          if (body.modified) times.modified ??= body.modified
          when.set(name, { times, latest: body["dist-tags"]?.latest ?? "" })
        } catch {
          // one package failing to answer is not the whole panel failing
        }
      }
    }),
  )
  return when
}

export interface Deps {
  list: Dep[]
  /** why a column is empty, rather than leaving the reader to guess */
  offline: boolean
  checked: string
}

const read = (path: string): Record<string, any> | null => {
  try {
    return jsonc(readFileSync(path, "utf8")) as Record<string, any>
  } catch {
    return null
  }
}

interface Held {
  name: string
  version: string
  license: string
  bytes: number
  /** installed at the top of node_modules, so it is what the manifest resolved to */
  top: boolean
}

/** every file of a package, minus whatever it installed under itself */
const weigh = (dir: string): number => {
  let bytes = 0
  let listed: Dirent[]
  try {
    listed = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of listed) {
    if (entry.name === "node_modules") continue
    const at = join(dir, entry.name)
    if (entry.isDirectory()) bytes += weigh(at)
    else if (entry.isFile())
      try {
        bytes += statSync(at).size
      } catch {
        // a broken link weighs nothing
      }
  }
  return bytes
}

const licensed = (own: Record<string, any> | null): string => {
  const one = typeof own?.license === "string" ? own.license : own?.license?.type
  return one ?? own?.licenses?.[0]?.type ?? ""
}

/**
 * Every package on disk, not only the ones the manifest names. What a tree is licensed as
 * and what is filed against it is decided by the whole tree: the copyleft and the
 * advisories are almost always in something nobody chose directly.
 */
function tree(root: string): Map<string, Held> {
  const found = new Map<string, Held>()
  // pnpm links a package back into its own store, so a walk without this never ends
  const seen = new Set<string>()
  // the copy sitting directly under node_modules is the one the manifest resolved to, the
  // rest are somebody else's copies of the same name
  const look = (dir: string, top: boolean) => {
    let real: string
    try {
      real = realpathSync(dir)
    } catch {
      return
    }
    if (seen.has(real)) return
    seen.add(real)
    let listed: string[]
    try {
      listed = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of listed) {
      if (entry.startsWith(".") && entry !== ".pnpm") continue
      const at = join(dir, entry)
      const own = read(join(at, "package.json"))
      if (own?.name && own?.version) {
        const key = `${own.name}@${own.version}`
        found.set(key, {
          name: own.name,
          version: own.version,
          license: licensed(own),
          // weighed once per name and version: the same package is reached down many paths
          bytes: found.get(key)?.bytes ?? weigh(at),
          top,
        })
      }
      // a scope holds packages at the same level, a store and a nested tree hold their own
      else look(at, top && entry.startsWith("@"))
      look(join(at, "node_modules"), false)
    }
  }
  look(join(root, "node_modules"), true)
  return found
}

const CHUNK = 500

async function osv(list: Dep[]): Promise<Map<string, Advisory[]>> {
  const found = new Map<string, Advisory[]>()
  const asked = list.filter((one) => one.version)
  if (!asked.length) return found

  // a whole tree is thousands of packages, and one batch has a limit
  const hits: { id: string; at: string }[] = []
  for (let at = 0; at < asked.length; at += CHUNK) {
    const part = asked.slice(at, at + CHUNK)
    const res = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      body: JSON.stringify({
        queries: part.map((one) => ({
          package: { name: one.name, ecosystem: "npm" },
          version: one.version,
        })),
      }),
    })
    const body = (await res.json()) as { results: { vulns?: { id: string }[] }[] }
    hits.push(
      ...body.results.flatMap((one, i) =>
        // keyed by name and version: one package at two versions is two different answers
        (one.vulns ?? []).map((v) => ({ id: v.id, at: `${part[i].name}@${part[i].version}` })),
      ),
    )
  }
  // the batch answers with ids only, so each match is read for its summary and severity.
  // Paced rather than capped: a cap would quietly under report a repo with a long list
  const wanted = [...new Map(hits.map((h) => [h.id + h.at, h])).values()]
  const details: { at: string; advisory: Advisory }[] = []
  await Promise.all(
    Array.from({ length: PACE }, async () => {
      for (let one = wanted.pop(); one; one = wanted.pop()) {
        try {
          const got = (await (await fetch(`https://api.osv.dev/v1/vulns/${one.id}`)).json()) as {
            summary?: string
            aliases?: string[]
            database_specific?: { severity?: string }
          }
          details.push({
            at: one.at,
            advisory: {
              id: got.aliases?.find((a) => a.startsWith("CVE-")) ?? one.id,
              summary: got.summary ?? "no summary",
              severity: got.database_specific?.severity ?? "UNKNOWN",
              url: `https://osv.dev/vulnerability/${one.id}`,
            },
          })
        } catch {
          // one advisory failing to load is not the whole panel failing
        }
      }
    }),
  )
  for (const { at, advisory } of details) found.set(at, [...(found.get(at) ?? []), advisory])
  return found
}

/** every declared dependency, with its licence from disk and its advisories from osv */
export async function deps(repo: string): Promise<Deps> {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const manifest = read(join(root, "package.json"))
  const wanted = new Map<string, boolean>()
  for (const [from, dev] of [
    [manifest?.dependencies, false],
    [manifest?.devDependencies, true],
  ] as const)
    for (const name of Object.keys((from ?? {}) as Record<string, string>)) wanted.set(name, dev)
  const range = (name: string) =>
    ((manifest?.dependencies ?? {})[name] ??
      (manifest?.devDependencies ?? {})[name] ??
      "") as string

  const held = tree(root)
  const list: Dep[] = [...held.values()]
    .map((one) => ({
      ...one,
      range: range(one.name),
      dev: wanted.get(one.name) ?? false,
      direct: wanted.has(one.name) && one.top,
      released: "",
      used: "",
      latest: "",
      advisories: [] as Advisory[],
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

  // nothing installed, so the manifest is all there is to report
  if (!list.length)
    list.push(
      ...[...wanted].map(([name, dev]) => ({
        name,
        version: "",
        license: "",
        bytes: 0,
        range: range(name),
        dev,
        direct: true,
        released: "",
        used: "",
        latest: "",
        advisories: [] as Advisory[],
      })),
    )

  let offline = false
  try {
    const [found, when] = await Promise.all([
      osv(list),
      // the whole tree would be thousands of calls, and a transitive package is not chosen
      published([...new Set(list.filter((one) => one.direct).map((one) => one.name))]),
    ])
    for (const one of list) {
      one.advisories = found.get(`${one.name}@${one.version}`) ?? []
      const told = when.get(one.name)
      one.released = told?.times.modified ?? ""
      one.used = told?.times[one.version] ?? ""
      one.latest = told?.latest ?? ""
    }
  } catch {
    // no network, or osv is down: the licences still came off disk
    offline = true
  }
  return { list, offline, checked: new Date().toISOString() }
}
