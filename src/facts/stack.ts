// owner: finn
// goal: what kind of project this is, read off manifests and marker files

export { SIGNERS } from "./tables.ts"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { git } from "../read/model.ts"
import { CODE } from "../read/scan.ts"
import { manifests as readManifests } from "./manifests.ts"
import { VENDORED } from "../read/graph.ts"
import { roleOf } from "../read/layers.ts"
import type { Ai, Manifest, Node, Pinning, Stack } from "../read/model.ts"
import {
  AGENTS,
  AMBIGUOUS,
  BUILT_FOR,
  DEPLOYS,
  FILES,
  HOSTED,
  NATIVE,
  PLATFORM,
  SHIPS,
  SIGNERS,
  TABLES,
  type Table,
} from "./tables.ts"

const CONFIGS: [RegExp, "linters" | "formatters"][] = [
  [/^(.*\/)?\.eslintrc(\..+)?$/, "linters"],
  [/^(.*\/)?eslint\.config\.[cm]?[jt]s$/, "linters"],
  [/^(.*\/)?biome\.jsonc?$/, "linters"],
  [/^(.*\/)?oxlint\.config\.[cm]?[jt]s$/, "linters"],
  [/^(.*\/)?\.stylelintrc(\..+)?$/, "linters"],
  [/^(.*\/)?\.prettierrc(\..+)?$/, "formatters"],
  [/^(.*\/)?prettier\.config\.[cm]?[jt]s$/, "formatters"],
  [/^(.*\/)?\.editorconfig$/, "formatters"],
  [/^(.*\/)?oxfmt\.config\.[cm]?[jt]s$/, "formatters"],
  [/^(.*\/)?dprint\.jsonc?$/, "formatters"],
]

const read = (repo: string, path: string): string => {
  try {
    return readFileSync(join(repo, path), "utf8")
  } catch {
    return ""
  }
}

const add = (list: string[], value: string) => {
  if (value && !list.includes(value)) list.push(value)
}

/** A range like ^1.2.3 is a promise to accept code nobody has reviewed. */
function pin(range: string): keyof Pinning {
  if (/^(link|file|workspace|portal):/.test(range)) return "linked"
  if (range.startsWith("^")) return "caret"
  if (range.startsWith("~")) return "tilde"
  if (/^\d+\.\d+\.\d+\S*$/.test(range)) return "exact"
  return "range"
}

function manifest(repo: string, path: string): Manifest | null {
  try {
    const raw = JSON.parse(read(repo, path)) as Record<string, any>
    const deps: Record<string, string> = {
      ...raw.dependencies,
      ...raw.devDependencies,
      ...raw.peerDependencies,
    }
    return {
      path,
      name: raw.name,
      version: raw.version,
      license: raw.license,
      private: raw.private,
      manager: raw.packageManager,
      workspaces: !!raw.workspaces,
      bin: !!raw.bin,
      type: raw.type,
      engines: raw.engines,
      deps,
      scripts: raw.scripts ?? {},
    }
  } catch {
    return null
  }
}

const label = (table: Table, name: string): string =>
  table[name] ??
  Object.entries(table).find(([key]) => key.endsWith("/") && name.startsWith(key))?.[1] ??
  ""

/** newest commits only, a signature further back says little about the code now */
const SIGNED_MAX = 20_000

/** the author line and the trailers */
/** the tool a trailer names, so Copilot:Claude reads as Copilot */
const signer = (line: string): string =>
  line.replace(/^\s*[a-z-]+-by:\s*/i, "").replace(/^([^\s:]+):\S+/, "$1")

function assisted(repo: string): Pick<Ai, "signed" | "scanned" | "capped" | "by"> {
  const by: Record<string, number> = {}
  let log = ""
  try {
    log = git(repo, "log", `-${SIGNED_MAX}`, "--format=%an <%ae>%n%B%x00")
  } catch {
    return { signed: 0, scanned: 0, capped: false, by } // no commits yet
  }

  const commits = log.split("\0").filter((c) => c.trim())
  let signed = 0
  for (const commit of commits) {
    // each record after the first begins with the newline that closed the one before
    const [author = "", ...body] = commit.replace(/^\n/, "").split("\n")
    const claims = [
      // a human called Claude is not a tool, a bot address is
      /\[bot\]|noreply|users\.noreply/i.test(author) ? author : "",
      ...body.filter((line) => /^\s*(co-authored-by|assisted-by|generated with)/i.test(line)),
    ].map(signer)
    const hits = new Set(
      SIGNERS.filter(([match]) => claims.some((line) => match.test(line))).map(([, tool]) => tool),
    )
    if (hits.size) signed++
    for (const tool of hits) by[tool] = (by[tool] ?? 0) + 1
  }
  return { signed, scanned: commits.length, capped: commits.length >= SIGNED_MAX, by }
}

/** what the tracked paths alone say: marker files, config, ports, assistants */
function markers(repo: string, paths: string[]) {
  const found: Record<string, string[]> = {}
  const counts = { dockerfiles: 0, compose: 0, kubernetes: 0, terraform: 0 }
  const node: string[] = []
  const env: string[] = []
  const strict = { on: 0, off: 0 }
  const ports: number[] = []
  const agents: string[] = []
  const agentFiles: Record<string, number> = {}
  const hosts: string[] = []
  const apps: string[] = []

  const port = (value: number) => {
    if (value > 0 && value < 65536 && !ports.includes(value)) ports.push(value)
  }

  for (const path of paths) {
    if (VENDORED.test(path) || roleOf(path) === "test") continue

    for (const [match, where, name] of FILES) {
      if (!match.test(path)) continue
      if (where === "docker") counts.dockerfiles++
      else if (where === "compose") counts.compose++
      else if (where === "k8s") counts.kubernetes++
      else if (where === "terraform") counts.terraform++
      else add((found[where] ??= []), name)
    }
    for (const [match, where] of CONFIGS) {
      if (match.test(path)) add((found[where] ??= []), path.split("/").pop() ?? path)
    }
    for (const [match, host] of HOSTED) if (match.test(path)) add(hosts, host)
    for (const [match, made] of NATIVE) if (match.test(path)) add(apps, made)
    for (const [named, says, host] of AMBIGUOUS)
      if (named.test(path) && says.test(read(repo, path))) add(hosts, host)

    // a workflow, a terraform file or a compose file can name the target too
    if (
      /^\.github\/workflows\/.+\.ya?ml$|\.tf$|\.tfvars$|^(.*\/)?(docker-)?compose(\..+)?\.ya?ml$|^(.*\/)?[Dd]ockerfile(\..+)?$/.test(
        path,
      )
    ) {
      const text = read(repo, path)
      for (const [match, host] of DEPLOYS) if (match.test(text)) add(hosts, host)
    }

    for (const [match, tool] of AGENTS) {
      if (!match.test(path)) continue
      add(agents, tool)
      // the last matched segment, so a rules folder counts once and nesting collapses
      const hit = path.match(match)?.[0] ?? path
      const marker = hit.endsWith("/") ? `${hit.split("/").at(-2)}/` : (hit.split("/").pop() ?? hit)
      agentFiles[marker] = (agentFiles[marker] ?? 0) + 1
    }

    // strictness is the single most useful thing a tsconfig says about a codebase
    if (/^(.*\/)?tsconfig(\..+)?\.json$/.test(path)) {
      const text = read(repo, path)
      if (/"strict"\s*:\s*true/.test(text)) strict.on++
      else if (/"compilerOptions"/.test(text)) strict.off++
    }
    if (/^(.*\/)?\.nvmrc$|^(.*\/)?\.node-version$/.test(path)) add(node, read(repo, path).trim())
    if (/^(.*\/)?\.env(\..+)?$/.test(path)) add(env, path.split("/").pop() ?? path)
    if (/^(.*\/)?[Dd]ockerfile(\..+)?$/.test(path)) {
      for (const line of read(repo, path).matchAll(/^\s*EXPOSE\s+(\d+)/gim)) port(Number(line[1]))
    }
    if (/^(.*\/)?(docker-)?compose(\..+)?\.ya?ml$/.test(path)) {
      for (const line of read(repo, path).matchAll(/["']?(\d{2,5}):\d{2,5}["']?/g))
        port(Number(line[1]))
    }
  }
  return { found, counts, node, env, strict, ports, agents, agentFiles, hosts, apps, port }
}

/** a licence beside the manifest speaks for the project, the rest come with vendored code */
function licences(repo: string, paths: string[]): { licenses: string[]; vendored: number } {
  const licenses: string[] = []
  let vendored = 0

  for (const path of paths.filter((p) => /^(.*\/)?(LICEN[SC]E|COPYING)(\..+)?$/i.test(p))) {
    if (path.includes("/")) {
      vendored++
      continue
    }
    const text = read(repo, path).slice(0, 400)
    const kind = /MIT License/i.test(text)
      ? "MIT"
      : /Apache License/i.test(text)
        ? "Apache-2.0"
        : /GNU AFFERO/i.test(text)
          ? "AGPL-3.0"
          : /GNU GENERAL PUBLIC/i.test(text)
            ? "GPL"
            : /GNU LESSER/i.test(text)
              ? "LGPL"
              : /BSD/i.test(text)
                ? "BSD"
                : /Mozilla Public License/i.test(text)
                  ? "MPL-2.0"
                  : /UNLICENSE|public domain/i.test(text)
                    ? "Unlicense"
                    : "unknown"
    add(licenses, kind)
  }
  return { licenses, vendored }
}

// prettier-ignore
const SERVER = ["Express", "Fastify", "NestJS", "Koa", "Hono", "hapi", "Next.js", "Nuxt", "SvelteKit"]
// prettier-ignore
const CLIENT = ["React", "Vue", "Svelte", "Angular", "Solid", "Preact", "Astro", "Next.js", "Nuxt", "Flutter"]

/** what the repo holds, judged by what it depends on and what it ships */
function shipped(
  frameworks: string[],
  connected: boolean,
  workspaces: boolean,
  manifests: Manifest[],
  boxes: { dockerfiles: number; compose: number; kubernetes: number; terraform: number },
  apps: string[],
  /** cli is not an npm only word */
  outside: string[] = [],
): string[] {
  const parts: string[] = []
  if (frameworks.some((f) => CLIENT.includes(f))) add(parts, "frontend")
  if (frameworks.some((f) => SERVER.includes(f)) || connected) add(parts, "backend")
  if (manifests.some((m) => Object.keys(m.deps).length === 0 && m.workspaces))
    add(parts, "monorepo root")
  if (manifests.some((m) => m.workspaces) || workspaces) add(parts, "monorepo")
  if (manifests.some((m) => m.bin) || outside.length) add(parts, "cli")
  // the platform, not "mobile": only one of those is checkable
  for (const made of apps) add(parts, made.toLowerCase())
  if (boxes.dockerfiles || boxes.compose || boxes.kubernetes || boxes.terraform) add(parts, "infra")
  return parts
}

export function stack(repo: string, languages: Node[] = []): Stack {
  const paths = git(repo, "ls-files", "-z").split("\0").filter(Boolean)
  const { found, counts, node, env, strict, ports, agents, agentFiles, hosts, apps, port } =
    markers(repo, paths)
  const licenses: string[] = []
  const modules: string[] = []

  // every manifest, wherever it sits, so a monorepo is read whole
  const manifests = paths
    // a manifest somebody vendored, or one a fixture holds, describes neither this project
    .filter((p) => /^(.*\/)?package\.json$/.test(p) && !VENDORED.test(p) && roleOf(p) !== "test")
    .map((p) => manifest(repo, p))
    .filter((m): m is Manifest => !!m)

  // one bucket per table
  const dep: Record<string, string[]> = {
    frameworks: [],
    state: [],
    ui: [...(found.ui ?? [])],
    connects: [],
    testing: [],
    runtimes: [],
    styling: [],
    content: [],
    visuals: [],
    observability: [],
    auth: [],
    build: [...(found.build ?? [])],
    linters: [],
    formatters: [],
  }
  const from: Record<string, string> = {}
  const scripts: string[] = []
  const bundlers: string[] = []
  const typescript: string[] = []
  const managers: string[] = []
  for (const one of found.lock ?? []) add(managers, one)
  const pinning: Pinning = { exact: 0, caret: 0, tilde: 0, range: 0, linked: 0 }
  const names = new Set<string>()

  for (const m of manifests) {
    if (m.license) add(licenses, m.license)
    if (m.manager) add(managers, m.manager.split("@")[0])
    if (m.engines?.node) add(node, m.engines.node)
    if (m.type) add(modules, m.type === "module" ? "esm" : "cjs")
    for (const [name, body] of Object.entries(m.scripts)) {
      add(scripts, name)
      // next --turbopack, vite, and a port given on the command line
      if (/--turbopack|--turbo\b/.test(body)) add(bundlers, "Turbopack")
      if (/\bwebpack\b/.test(body)) add(bundlers, "webpack")
      if (/\bvite\b/.test(body)) add(bundlers, "Vite")
      for (const [match, host] of DEPLOYS) if (match.test(body)) add(hosts, host)
      for (const found of body.matchAll(/(?:--port[= ]|-p[= ])(\d{2,5})/g)) port(Number(found[1]))
    }
    for (const [name, range] of Object.entries(m.deps)) {
      names.add(name)
      pinning[pin(String(range))]++
      if (name === "typescript") add(typescript, String(range))
      add(hosts, label(SHIPS, name))
      for (const made of (label(BUILT_FOR, name) ?? "").split(",")) add(apps, made)
      const platform = label(PLATFORM, name)
      if (platform) {
        add(hosts, platform)
        from[platform] ??= name
      }
      for (const [bucket, table] of TABLES) {
        const found = label(table, name)
        if (!found) continue
        add(dep[bucket], found)
        // several packages imply one label, the plainest name is the best evidence
        if (!from[found] || name.length < from[found].length) from[found] = name
      }
    }
  }

  const { licenses: filed, vendored } = licences(repo, paths)
  for (const kind of filed) add(licenses, kind)

  // the biggest real language by lines, so 200k lines of generated svg name nothing
  const primary =
    [...languages].filter((l) => CODE.has(l.name)).sort((a, b) => b.code - a.code)[0]?.name ?? ""

  const tally = new Map<string, number>()
  for (const path of paths) {
    const dot = path.lastIndexOf(".")
    const slash = path.lastIndexOf("/")
    if (dot > slash + 1) {
      const ext = path.slice(dot + 1).toLowerCase()
      tally.set(ext, (tally.get(ext) ?? 0) + 1)
    }
  }
  const exts = new Set(tally.keys())
  const hasTs =
    exts.has("ts") || exts.has("tsx") || exts.has("mts") || (found.typescript?.length ?? 0) > 0
  const hasJs = exts.has("js") || exts.has("jsx") || exts.has("mjs") || exts.has("cjs")

  // what every other language keeps in a manifest of its own
  const where: Record<string, string> = {}
  const foreign = readManifests(repo, paths)
  for (const one of foreign) {
    add(managers, MANAGERS[one.kind])
    for (const asked of one.asked) {
      names.add(asked.name)
      // the last segment: a maven coordinate is group:artifact, a crate is just its name
      const tail = asked.name.split(":").pop() ?? asked.name
      for (const [table, into] of FOREIGN) {
        const found = label(table, tail)
        if (!found) continue
        add(dep[into], found)
        // the package that implied it, and where that package lives
        from[found] ??= asked.name
        where[found] ??= one.kind
      }
    }
  }
  const cli = dep.frameworks.some((one) => Object.values(OUT_CLIS).includes(one))
  const builds = [...foreign.flatMap((one) => one.bins), ...(cli ? ["argument parser"] : [])]
  const parts = shipped(
    dep.frameworks,
    dep.connects.length > 0,
    !!found.workspaces,
    manifests,
    counts,
    apps,
    builds,
  )
  if (exts.has("mjs")) add(modules, "esm")
  if (exts.has("cjs")) add(modules, "cjs")

  // a manifest or a tsconfig makes a node project, a stray .js does not
  const isNode = manifests.length > 0 || (found.typescript?.length ?? 0) > 0
  const kind = !isNode ? "none" : hasTs && hasJs ? "mixed" : hasTs ? "typescript" : "javascript"

  const root = manifests.find((m) => m.path === "package.json")

  // a checked in ruleset and a signed commit are both evidence, one list either way
  const signatures = assisted(repo)
  const tools = [...agents]
  for (const tool of Object.keys(signatures.by)) add(tools, tool)

  return {
    kind,
    primary,
    name: root?.name,
    version: root?.version,
    license: root?.license ?? licenses[0],
    private: !!root?.private,
    vendored,
    manifests,
    typescript,
    managers,
    lockfiles: [...new Set(found.lock ?? [])],
    pinning,
    dependencies: names.size,
    build: dep.build,
    frameworks: dep.frameworks,
    state: dep.state,
    ui: dep.ui,
    connects: dep.connects,
    testing: dep.testing,
    runtimes: dep.runtimes,
    styling: dep.styling,
    content: dep.content,
    visuals: dep.visuals,
    observability: dep.observability,
    auth: dep.auth,
    scripts,
    linters: dep.linters,
    formatters: dep.formatters,
    rules: [...(found.linters ?? []), ...(found.formatters ?? [])],
    ci: found.ci ?? [],
    bundlers,
    ports: ports.sort((a, b) => a - b),
    hosts,
    apps,
    node,
    modules,
    strict,
    env,
    containers: counts,
    apis: found.apis ?? [],
    licenses,
    parts,
    from,
    registries: where,
    ai: { ...signatures, tools, files: agentFiles },
  }
}

const MANAGERS: Record<string, string> = {
  cargo: "cargo",
  python: "pip",
  gradle: "gradle",
  cmake: "cmake",
  go: "go",
  pub: "pub",
}

/** packages outside npm, in the same buckets the node ones use */
// prettier-ignore
const OUT_FRAMEWORKS: Table = {
  actix: "Actix", "actix-web": "Actix", axum: "Axum", rocket: "Rocket", warp: "warp",
  poem: "Poem", salvo: "Salvo", bevy: "Bevy", tauri: "Tauri", dioxus: "Dioxus", leptos: "Leptos",
  django: "Django", flask: "Flask", fastapi: "FastAPI", starlette: "Starlette", sanic: "Sanic",
  tornado: "Tornado", celery: "Celery", scrapy: "Scrapy", streamlit: "Streamlit", gradio: "Gradio",
  "spring-boot-starter": "Spring Boot", "spring-core": "Spring", ktor: "Ktor", micronaut: "Micronaut",
  quarkus: "Quarkus", vertx: "Vert.x", gin: "Gin", echo: "Echo", fiber: "Fiber", chi: "chi",
  laravel: "Laravel", symfony: "Symfony", vapor: "Vapor", rails: "Rails", sinatra: "Sinatra",
  "aspnetcore": "ASP.NET Core", flutter: "Flutter", shelf: "shelf", "dart_frog": "Dart Frog",
}

// what holds the state of a running app, which is not what shapes it
// prettier-ignore
const OUT_STATE: Table = {
  "flutter_bloc": "Bloc", bloc: "Bloc", provider: "Provider", riverpod: "Riverpod",
  "flutter_riverpod": "Riverpod", "get_it": "get_it", mobx: "MobX", "flutter_mobx": "MobX",
  redux: "Redux",
}

// an argument parser shapes a program the way a router does, and says it is a cli
// prettier-ignore
const OUT_CLIS: Table = {
  clap: "clap", structopt: "structopt", argh: "argh", gumdrop: "gumdrop", pico: "pico-args",
  argparse: "argparse", click: "Click", typer: "Typer", fire: "Fire", docopt: "docopt",
  picocli: "picocli", "commons-cli": "commons-cli", args4j: "args4j", clikt: "Clikt",
  cobra: "Cobra", urfave: "urfave/cli", kingpin: "kingpin", "swift-argument-parser": "ArgumentParser",
}

// what it runs on rather than what it is: an async runtime, a thread pool, a jit
// prettier-ignore
const OUT_RUNTIMES: Table = {
  tokio: "Tokio", "async-std": "async-std", smol: "smol", rayon: "Rayon", crossbeam: "crossbeam",
  "kotlinx-coroutines-core": "Coroutines", asyncio: "asyncio", uvloop: "uvloop", gevent: "gevent",
  uvicorn: "Uvicorn", gunicorn: "Gunicorn", hypercorn: "Hypercorn", wasm: "WebAssembly",
  "flutter_isolate": "Isolates",
}

// something it talks to: a database, an http client, a queue, a model
// prettier-ignore
const OUT_CONNECTS: Table = {
  diesel: "Diesel", sqlx: "SQLx", "sea-orm": "SeaORM", rusqlite: "SQLite", tonic: "Tonic",
  hyper: "hyper", reqwest: "reqwest", ureq: "ureq", redis: "Redis", mongodb: "MongoDB",
  sqlalchemy: "SQLAlchemy", psycopg2: "Postgres", pymongo: "MongoDB", requests: "requests",
  httpx: "httpx", aiohttp: "aiohttp", boto3: "AWS", openai: "OpenAI", anthropic: "Anthropic",
  langchain: "LangChain", transformers: "Transformers", torch: "PyTorch", tensorflow: "TensorFlow",
  scikit: "scikit-learn", retrofit: "Retrofit", okhttp: "OkHttp", exposed: "Exposed",
  hibernate: "Hibernate", jdbc: "JDBC", gorm: "GORM", sqlx_go: "sqlx", "grpc-go": "gRPC",
  "aws-sdk-go": "AWS", stripe: "Stripe", sentry: "Sentry", dio: "dio", chopper: "Chopper",
  "shared_preferences": "SharedPreferences", sqflite: "SQLite", hive: "Hive",
  "firebase_core": "Firebase", "cloud_firestore": "Firebase", graphql_flutter: "GraphQL",
}

// how it reads and writes its own data, which is neither a framework nor a connection
// prettier-ignore
const OUT_CONTENT: Table = {
  serde: "Serde", "serde_json": "Serde", prost: "Protobuf", bincode: "bincode", toml: "TOML",
  pydantic: "Pydantic", numpy: "NumPy", pandas: "pandas", polars: "Polars", "pyarrow": "Arrow",
  jackson: "Jackson", gson: "Gson", kotlinx: "kotlinx.serialization", protobuf: "Protobuf",
}

// prettier-ignore
const OUT_UI: Table = {
  egui: "egui", iced: "iced", ratatui: "Ratatui", crossterm: "crossterm", indicatif: "indicatif",
  appcompat: "AppCompat", "core-ktx": "AndroidX", material: "Material", compose: "Compose",
  swiftui: "SwiftUI", tkinter: "Tkinter", "PyQt5": "Qt", kivy: "Kivy",
  cupertino_icons: "Cupertino", "google_fonts": "Google Fonts",
}

// prettier-ignore
const OUT_TESTS: Table = {
  pytest: "pytest", unittest: "unittest", nose: "nose", hypothesis: "Hypothesis", tox: "tox",
  junit: "JUnit", mockito: "Mockito", assertj: "AssertJ", kotest: "Kotest", espresso: "Espresso",
  criterion: "Criterion", divan: "divan", proptest: "proptest", quickcheck: "QuickCheck",
  testify: "testify", gtest: "GoogleTest", catch2: "Catch2", doctest: "doctest", rspec: "RSpec",
  phpunit: "PHPUnit", xunit: "xUnit", nunit: "NUnit", "flutter_test": "flutter_test",
  "integration_test": "integration_test", mocktail: "mocktail",
}

const FOREIGN: [
  Table,
  "frameworks" | "runtimes" | "connects" | "content" | "ui" | "testing" | "state",
][] = [
  [OUT_FRAMEWORKS, "frameworks"],
  [OUT_CLIS, "frameworks"],
  [OUT_STATE, "state"],
  [OUT_RUNTIMES, "runtimes"],
  [OUT_CONNECTS, "connects"],
  [OUT_CONTENT, "content"],
  [OUT_UI, "ui"],
  [OUT_TESTS, "testing"],
]
