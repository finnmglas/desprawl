// owner: finn
// goal: what each dependency is licensed as, and what is filed against it

import { readdirSync, realpathSync, statSync, type Dirent } from "node:fs"
import { join } from "node:path"
import { git } from "./model.ts"
export { familyOf, type Family } from "./licence.ts"
import { reading } from "./graph.ts"
import { manifests } from "./manifests.ts"

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
  /** nothing that ships reaches it, however it got installed */
  dev: boolean
  /** named by this repo's manifest, rather than pulled in by something that was */
  direct: boolean
  /** when npm last saw any release of it, asked for the named ones only */
  released: string
  /** when the installed version was published */
  used: string
  /** what the registry calls latest, so behind is a version not a date */
  latest: string
  /** its own files on disk: what it installed is its own row */
  bytes: number
  /** where it lives, so an advisory is asked for in the right place */
  ecosystem: string
  advisories: Advisory[]
}

const PACE = 16

/** when each version landed, and which is current */
interface Told {
  times: Record<string, string>
  latest: string
}

/** the whole document, since the abbreviated one carries no dates at all */
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
  /** why a column is empty */
  offline: boolean
  /** named but not described, so an empty column is not read as clean */
  missed: number
  checked: string
}

interface Held {
  ecosystem: string
  name: string
  version: string
  license: string
  bytes: number
  /** what it asks for at runtime, which is how dev only is worked out */
  needs: string[]
  /** installed at the top of node_modules, so it is what the manifest resolved to */
  top: boolean
}

/** its files, minus what it installed under itself */
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

/** every package on disk: the copyleft and the advisories are in what nobody chose */
function tree(root: string): Map<string, Held> {
  const found = new Map<string, Held>()
  // pnpm links a package back into its own store, so a walk without this never ends
  const seen = new Set<string>()
  // the copy directly under node_modules is what the manifest resolved to
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
      const own = reading(join(at, "package.json"))
      if (own?.name && own?.version) {
        const key = `${own.name}@${own.version}`
        found.set(key, {
          ecosystem: "npm",
          name: own.name,
          version: own.version,
          license: licensed(own),
          needs: Object.keys({ ...own.dependencies, ...own.optionalDependencies }),
          // weighed once per name and version, and top once anywhere is top
          bytes: found.get(key)?.bytes ?? weigh(at),
          top: (found.get(key)?.top ?? false) || top,
        })
      }
      // a scope holds packages at the same level, a store holds its own
      else look(at, top && entry.startsWith("@"))
      look(join(at, "node_modules"), false)
    }
  }
  look(join(root, "node_modules"), true)
  return found
}

/** the one version a range names, when it names exactly one */
const pinned = (range: string): string =>
  /^[=~^]?v?(\d+\.\d+(\.\d+)?)$/.exec(range.trim())?.[1] ?? ""

const CHUNK = 500
const TRIES = 3

/** silence is not the same as none */
interface Filed {
  found: Map<string, Advisory[]>
  missed: number
}

async function osv(list: Dep[]): Promise<Filed> {
  const found = new Map<string, Advisory[]>()
  const asked = list
    .map((one) => ({ ...one, version: one.version || pinned(one.range) }))
    .filter((one) => one.version && one.ecosystem)
  if (!asked.length) return { found, missed: 0 }

  // a whole tree is thousands of packages, and one batch has a limit
  const hits: { id: string; at: string }[] = []
  for (let at = 0; at < asked.length; at += CHUNK) {
    const part = asked.slice(at, at + CHUNK)
    const res = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      body: JSON.stringify({
        queries: part.map((one) => ({
          package: { name: one.name, ecosystem: one.ecosystem },
          version: one.version,
        })),
      }),
    })
    const body = (await res.json()) as { results: { vulns?: { id: string }[] }[] }
    hits.push(
      ...body.results.flatMap((one, i) =>
        // one package at two versions is two answers
        (one.vulns ?? []).map((v) => ({ id: v.id, at: `${part[i].name}@${part[i].version}` })),
      ),
    )
  }
  // the batch answers with ids only. Paced not capped: a cap under reports quietly
  const wanted = [...new Map(hits.map((h) => [h.id + h.at, h])).values()]
  const details: { at: string; advisory: Advisory }[] = []
  let missed = 0
  await Promise.all(
    Array.from({ length: PACE }, async () => {
      for (let one = wanted.pop(); one; one = wanted.pop()) {
        // the batch said it exists, so failing to read it is a gap, not an answer
        for (let go = 0; go < TRIES; go++) {
          try {
            const res = await fetch(`https://api.osv.dev/v1/vulns/${one.id}`)
            if (!res.ok) throw new Error(String(res.status))
            const got = (await res.json()) as {
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
            break
          } catch {
            if (go === TRIES - 1) missed++
          }
        }
      }
    }),
  )
  for (const { at, advisory } of details) found.set(at, [...(found.get(at) ?? []), advisory])
  return { found, missed }
}

/** named but never installed here: the manifest is all we know about it */
const blank = (name: string, range: string, dev: boolean, ecosystem: string): Dep => ({
  name,
  version: "",
  license: "",
  bytes: 0,
  ecosystem,
  range,
  dev,
  direct: true,
  released: "",
  used: "",
  latest: "",
  advisories: [],
})

/** licences from disk, advisories from osv */
export async function deps(repo: string): Promise<Deps> {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const manifest = reading(join(root, "package.json"))
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
  // nor does anything only a dev dependency asks for
  const ships = new Set(Object.keys((manifest?.dependencies ?? {}) as Record<string, string>))
  const byName = new Map<string, Held[]>()
  for (const one of held.values()) byName.set(one.name, [...(byName.get(one.name) ?? []), one])
  for (const name of ships)
    for (const one of byName.get(name) ?? []) for (const next of one.needs) ships.add(next)
  const list: Dep[] = [...held.values()]
    .map((one) => ({
      ...one,
      range: range(one.name),
      dev: !ships.has(one.name),
      direct: wanted.has(one.name) && one.top,
      released: "",
      used: "",
      latest: "",
      advisories: [] as Advisory[],
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

  // nothing installed, so the manifest is all there is to report
  if (!list.length)
    list.push(...[...wanted].map(([name, dev]) => blank(name, range(name), dev, "npm")))

  // every other language keeps what it asks for in a manifest of its own, and nothing of
  // it is on disk here: the range is all there is, which is enough for an advisory
  const tracked = git(root, "ls-files", "-z").split("\0").filter(Boolean)
  const found = manifests(root, tracked).filter((one) => one.path !== "package.json")
  // a crate or module this repo itself builds is not something it depends on
  const own = new Set(found.map((one) => one.name).filter(Boolean) as string[])
  for (const one of found)
    for (const asked of one.asked) {
      if (own.has(asked.name) || list.some((held) => held.name === asked.name)) continue
      list.push(blank(asked.name, asked.range, asked.dev, asked.ecosystem))
    }

  let offline = false
  let missed = 0
  try {
    const [filed, when] = await Promise.all([
      osv(list),
      // the whole tree is thousands of calls, and nobody chose a transitive one
      published([...new Set(list.filter((one) => one.direct).map((one) => one.name))]),
    ])
    missed = filed.missed
    for (const one of list) {
      // osv was asked with the pinned range when nothing is installed, so read it back the same way
      one.advisories = filed.found.get(`${one.name}@${one.version || pinned(one.range)}`) ?? []
      const told = when.get(one.name)
      one.released = told?.times.modified ?? ""
      one.used = told?.times[one.version] ?? ""
      one.latest = told?.latest ?? ""
    }
  } catch {
    // no network, or osv is down: the licences still came off disk
    offline = true
  }
  return { list, offline, missed, checked: new Date().toISOString() }
}
