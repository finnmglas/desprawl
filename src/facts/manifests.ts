// owner: finn
// goal: what a project asks for, whichever manifest its language keeps it in

import { readFileSync } from "node:fs"
import { join } from "node:path"

export interface Asked {
  name: string
  range: string
  /** never shipped: a build, test or lint only dependency */
  dev: boolean
  /** osv's word for where the package lives */
  ecosystem: string
}

export interface Read {
  /** the manifest itself, so a claim can be followed */
  path: string
  kind: "npm" | "cargo" | "python" | "gradle" | "cmake" | "go" | "pub"
  /** what the project calls itself */
  name?: string
  version?: string
  license?: string
  asked: Asked[]
  /** what it declares it builds: a binary, a script, an entry point */
  bins: string[]
}

const text = (root: string, path: string): string => {
  try {
    return readFileSync(join(root, path), "utf8")
  } catch {
    return ""
  }
}

/** the sections of a toml file, so `[dependencies]` can be told from `[dev-dependencies]` */
function sections(source: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  let at = ""
  for (const raw of source.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim()
    const head = /^\[+([^\]]+)\]+/.exec(line)
    if (head) {
      at = head[1].trim()
      found.set(at, found.get(at) ?? [])
    } else if (line && at) found.get(at)!.push(line)
  }
  return found
}

/** a path or workspace dependency asks for nothing: it is the repo */
const range = (line: string): string => {
  const at = line.indexOf("=")
  const said = at === -1 ? line : line.slice(at + 1).trim()
  if (said.startsWith("{"))
    return (
      /\bversion\s*=\s*"([^"]*)"/.exec(said)?.[1] ??
      (/\b(path|workspace|git)\s*=/.test(said) ? "" : "")
    )
  return /^"([^"]*)"/.exec(said)?.[1] ?? ""
}

/** the key a line sets, without the sub key: `serde.workspace = true` is serde */
const named = (line: string): string =>
  (/^\s*([\w.-]+?)(\.[\w.-]+)?\s*=/.exec(line)?.[1] ?? "").trim()

function cargo(root: string, path: string): Read {
  const held = sections(text(root, path))
  const pkg = held.get("package") ?? []
  const asked: Asked[] = []
  for (const [name, lines] of held) {
    // [dependencies.serde] is one package spelled over several lines
    const inner = /(^|\.)(dependencies|dev-dependencies|build-dependencies)\.([\w-]+)$/.exec(name)
    if (inner) {
      asked.push({
        name: inner[3],
        range: range(lines.join(" ")),
        dev: inner[2] === "dev-dependencies",
        ecosystem: "crates.io",
      })
      continue
    }
    // a target's own dependencies live under a longer name: [target.'cfg(unix)'.dependencies]
    const dev = /dev-dependencies$/.test(name)
    if (!/(^|\.)(dependencies|dev-dependencies|build-dependencies)$/.test(name)) continue
    for (const line of lines) {
      const one = named(line)
      if (one) asked.push({ name: one, range: range(line), dev, ecosystem: "crates.io" })
    }
  }
  const bins = [...held.keys()].filter((one) => one === "bin" || one.startsWith("bin.")).length
    ? ["cargo bin"]
    : []
  return {
    path,
    kind: "cargo",
    name: range(pkg.find((l) => l.startsWith("name")) ?? ""),
    version: range(pkg.find((l) => l.startsWith("version")) ?? ""),
    license: range(pkg.find((l) => l.startsWith("license")) ?? ""),
    asked,
    bins,
  }
}

/** a pep 508 requirement: `name[extra] >= 1.0 ; marker` */
const requirement = (line: string): Asked | null => {
  const said = line.replace(/#.*$/, "").split(";")[0].trim()
  if (!said || /^-/.test(said)) return null
  const m = /^([A-Za-z0-9._-]+)\s*(\[[^\]]*\])?\s*(.*)$/.exec(said)
  if (!m) return null
  return { name: m[1], range: m[3].trim(), dev: false, ecosystem: "PyPI" }
}

function python(root: string, path: string): Read {
  const source = text(root, path)
  if (/requirements/.test(path)) {
    const dev = /(dev|test|lint|doc)/i.test(path)
    return {
      path,
      kind: "python",
      asked: source
        .split("\n")
        .map(requirement)
        .filter((one): one is Asked => !!one)
        .map((one) => ({ ...one, dev })),
      bins: [],
    }
  }
  const held = sections(source)
  const project = held.get("project") ?? []
  const asked: Asked[] = []
  // a requirement can carry brackets: requests[socks]>=2
  const listed =
    /(?:^|\n)dependencies\s*=\s*\[((?:[^\][]|\[[^\][]*\])*)\]/.exec(project.join("\n"))?.[1] ?? ""
  for (const one of listed.match(/["']([^"']+)["']/g) ?? []) {
    const held_ = requirement(one.replace(/["']/g, ""))
    if (held_) asked.push(held_)
  }
  for (const [name, lines] of held) {
    // [project.optional-dependencies] and [tool.poetry.group.dev.dependencies]
    if (!/optional-dependencies|group\..*\.dependencies|^tool\.poetry\.dependencies$/.test(name))
      continue
    // `dev = ["pytest"]`: the key names the group, the strings the packages
    const extras = /optional-dependencies$/.test(name)
    let group = ""
    for (const line of lines) {
      if (extras) {
        const head = /^([\w.-]+)\s*=/.exec(line)?.[1]
        if (head) group = head
        for (const one of line.match(/"[^"]+"/g) ?? []) {
          const held_ = requirement(one.replace(/"/g, ""))
          if (held_) asked.push({ ...held_, dev: /dev|test|lint|doc/i.test(group) })
        }
        continue
      }
      const dev = /dev|test|lint|doc/i.test(name)
      for (const one of line.match(/"[^"]+"/g) ?? []) {
        const held_ = requirement(one.replace(/"/g, ""))
        if (held_) asked.push({ ...held_, dev })
      }
      const one = named(line)
      if (one && one !== "python")
        asked.push({ name: one, range: range(line), dev, ecosystem: "PyPI" })
    }
  }
  return {
    path,
    kind: "python",
    name: range(project.find((l) => l.startsWith("name")) ?? ""),
    version: range(project.find((l) => l.startsWith("version")) ?? ""),
    license: range(project.find((l) => l.startsWith("license")) ?? ""),
    asked,
    // [project.scripts] is what it installs as a command
    bins: held.has("project.scripts") || held.has("tool.poetry.scripts") ? ["python script"] : [],
  }
}

// implementation("group:artifact:version"), api(...), testImplementation(...)
const GRADLE =
  /(?:^|\s)(implementation|api|compileOnly|runtimeOnly|testImplementation|testCompileOnly|androidTestImplementation|kapt|ksp|annotationProcessor)\s*[( ]\s*["']([^"':]+):([^"':]+):?([^"']*)["']/gm

function gradle(root: string, path: string): Read {
  const source = text(root, path)
  const asked: Asked[] = []
  for (const m of source.matchAll(GRADLE))
    asked.push({
      name: `${m[2]}:${m[3]}`,
      range: m[4] ?? "",
      dev: /^(test|androidTest|kapt|ksp|annotationProcessor|compileOnly)/.test(m[1]),
      ecosystem: "Maven",
    })
  return { path, kind: "gradle", asked, bins: [] }
}

/** maven keeps them in xml, one groupId and artifactId per dependency */
function maven(root: string, path: string): Read {
  const source = text(root, path)
  const asked: Asked[] = []
  for (const block of source.match(/<dependency>[\s\S]*?<\/dependency>/g) ?? []) {
    const group = /<groupId>([^<]+)</.exec(block)?.[1]?.trim()
    const artifact = /<artifactId>([^<]+)</.exec(block)?.[1]?.trim()
    if (!group || !artifact) continue
    asked.push({
      name: `${group}:${artifact}`,
      range: /<version>([^<]+)</.exec(block)?.[1]?.trim() ?? "",
      dev: /<scope>(test|provided)</.test(block),
      ecosystem: "Maven",
    })
  }
  return {
    path,
    kind: "gradle",
    name: /<artifactId>([^<]+)</.exec(source)?.[1]?.trim(),
    asked,
    bins: [],
  }
}

function cmake(root: string, path: string): Read {
  const source = text(root, path)
  const asked: Asked[] = []
  // find_package and FetchContent are the two ways a c project names something outside it
  for (const m of source.matchAll(/find_package\s*\(\s*([A-Za-z0-9_.-]+)/gi))
    asked.push({ name: m[1], range: "", dev: false, ecosystem: "" })
  for (const m of source.matchAll(/FetchContent_Declare\s*\(\s*([A-Za-z0-9_.-]+)/gi))
    asked.push({ name: m[1], range: "", dev: false, ecosystem: "" })
  return {
    path,
    kind: "cmake",
    name: /project\s*\(\s*([A-Za-z0-9_.-]+)/i.exec(source)?.[1],
    asked,
    // add_executable is a binary this project builds
    bins: /add_executable\s*\(/i.test(source) ? ["cmake executable"] : [],
  }
}

/** pubspec is yaml: a section at the margin, a package one indent in */
function pub(root: string, path: string): Read {
  const source = text(root, path)
  const asked: Asked[] = []
  let at = ""
  let inner = 0
  for (const raw of source.split("\n")) {
    const line = raw.replace(/(^|\s)#.*$/, "").trimEnd()
    if (!line.trim()) continue
    const head = /^([\w-]+)\s*:/.exec(line)
    if (head) {
      at = head[1]
      inner = 0
      continue
    }
    if (!/^(dependencies|dev_dependencies|dependency_overrides)$/.test(at)) continue
    const one = /^(\s+)([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!one) continue
    // the first entry sets the indent, deeper is how that one is fetched
    if (!inner) inner = one[1].length
    if (one[1].length > inner) continue
    asked.push({
      name: one[2],
      // an sdk, git or path dependency names no version
      range: /^["']?[\d^~<>=]/.test(one[3]) ? one[3].replace(/["']/g, "").trim() : "",
      // an override pins what something else pulled in, and it ships
      dev: at === "dev_dependencies",
      ecosystem: "Pub",
    })
  }
  const said = (key: string) =>
    new RegExp(`^${key}\\s*:\\s*(.*)$`, "m").exec(source)?.[1].replace(/["']/g, "").trim()
  return {
    path,
    kind: "pub",
    name: said("name"),
    version: said("version"),
    asked,
    // what `pub global activate` puts on the path
    bins: /^executables\s*:/m.test(source) ? ["pub executable"] : [],
  }
}

function golang(root: string, path: string): Read {
  const source = text(root, path)
  const asked: Asked[] = []
  for (const m of source.matchAll(/^\s*([\w.\-/]+\.[\w.\-/]+)\s+(v[\w.+-]+)/gm))
    asked.push({ name: m[1], range: m[2], dev: false, ecosystem: "Go" })
  return {
    path,
    kind: "go",
    name: /^module\s+(\S+)/m.exec(source)?.[1],
    asked,
    bins: [],
  }
}

/** a package.json somewhere other than the root, which the node reader never reaches */
function node(root: string, path: string): Read {
  const held = (() => {
    try {
      return JSON.parse(text(root, path)) as Record<string, any>
    } catch {
      return {}
    }
  })()
  const asked: Asked[] = []
  for (const [from, dev] of [
    [held.dependencies, false],
    [held.devDependencies, true],
  ] as const)
    for (const [name, range] of Object.entries((from ?? {}) as Record<string, string>))
      asked.push({ name, range, dev, ecosystem: "npm" })
  return {
    path,
    kind: "npm",
    name: held.name,
    version: held.version,
    license: typeof held.license === "string" ? held.license : undefined,
    asked,
    bins: held.bin ? ["npm bin"] : [],
  }
}

const READERS: [RegExp, (root: string, path: string) => Read][] = [
  [/(^|\/)package\.json$/, node],
  [/(^|\/)Cargo\.toml$/, cargo],
  [/(^|\/)pyproject\.toml$/, python],
  [/(^|\/)requirements[\w.-]*\.txt$/, python],
  [/(^|\/)setup\.cfg$/, python],
  [/(^|\/)build\.gradle(\.kts)?$/, gradle],
  [/(^|\/)pom\.xml$/, maven],
  [/(^|\/)CMakeLists\.txt$/, cmake],
  [/(^|\/)go\.mod$/, golang],
  [/(^|\/)pubspec\.ya?ml$/, pub],
]

/** every manifest a repo holds that is not package.json, read by whichever rule fits */
export function manifests(root: string, tracked: Iterable<string>): Read[] {
  const found: Read[] = []
  for (const path of tracked) {
    const reader = READERS.find(([match]) => match.test(path))
    if (reader) found.push(reader[1](root, path))
  }
  return found
}
