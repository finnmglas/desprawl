// owner: finn
// goal: what kind of project this is, read off manifests and marker files

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { git } from "./model.ts"

export interface Manifest {
  path: string
  name?: string
  version?: string
  license?: string
  private?: boolean
  manager?: string
  workspaces: boolean
  /** Ships a command, so the package is a cli */
  bin: boolean
  /** module, commonjs, or unset */
  type?: string
  engines?: Record<string, string>
  deps: Record<string, string>
  scripts: Record<string, string>
}

export interface Pinning {
  exact: number
  caret: number
  tilde: number
  range: number
  linked: number
}

export interface Ai {
  /** every ai coding tool the repo shows a trace of, from files or from the history */
  tools: string[]
  /** the instruction files, as markers, and how many of each the tree holds */
  files: Record<string, number>
  /** commits an ai signed, and how many of the newest were read to find them */
  signed: number
  scanned: number
  /** the read hit its cap, so older commits went unseen */
  capped: boolean
  /** commits signed, per tool */
  by: Record<string, number>
}

export interface Stack {
  /** typescript, javascript, both, or not a node project at all */
  kind: "typescript" | "javascript" | "mixed" | "none"
  /** the dominant language by file count, whatever it is */
  primary: string
  /** what the root manifest calls this project */
  name?: string
  version?: string
  /** declared by the root manifest or a licence file beside it, never a vendored one */
  license?: string
  /** a manifest marked private is not meant to be published */
  private: boolean
  /** licence files further down, which belong to bundled third party code */
  vendored: number
  manifests: Manifest[]
  typescript: string[]
  managers: string[]
  lockfiles: string[]
  pinning: Pinning
  dependencies: number
  build: string[]
  frameworks: string[]
  state: string[]
  ui: string[]
  connects: string[]
  testing: string[]
  runtimes: string[]
  styling: string[]
  content: string[]
  observability: string[]
  auth: string[]
  scripts: string[]
  linters: string[]
  formatters: string[]
  rules: string[]
  ci: string[]
  bundlers: string[]
  ports: number[]
  /** node versions asked for, from engines and .nvmrc */
  node: string[]
  /** esm, cjs or both, from package type and file extensions */
  modules: string[]
  /** how many tsconfigs turn strict on, and how many leave it off */
  strict: { on: number; off: number }
  /** files that hint at configuration the repo expects */
  env: string[]
  containers: { dockerfiles: number; compose: number; kubernetes: number; terraform: number }
  apis: string[]
  licenses: string[]
  parts: string[]
  ai: Ai
}

/** A dependency name, or a prefix ending in /, mapped to the label it implies. */
type Table = Record<string, string>

// prettier-ignore
const FRAMEWORKS: Table = {
  react: "React", "react-dom": "React", next: "Next.js", nuxt: "Nuxt", vue: "Vue",
  svelte: "Svelte", "@sveltejs/kit": "SvelteKit", "@angular/core": "Angular", "solid-js": "Solid",
  astro: "Astro", "@remix-run/react": "Remix", preact: "Preact", "react-native": "React Native",
  expo: "Expo", electron: "Electron", "@tauri-apps/api": "Tauri", gatsby: "Gatsby",
  express: "Express", fastify: "Fastify", "@nestjs/core": "NestJS", koa: "Koa", hono: "Hono",
  "@hapi/hapi": "hapi", "aws-lambda": "Lambda",
}

// prettier-ignore
const STATE: Table = {
  zustand: "Zustand", redux: "Redux", "@reduxjs/toolkit": "Redux Toolkit", mobx: "MobX",
  jotai: "Jotai", recoil: "Recoil", valtio: "Valtio", xstate: "XState", pinia: "Pinia",
  "@tanstack/react-query": "TanStack Query", "@tanstack/query-core": "TanStack Query",
  swr: "SWR", "apollo-client": "Apollo", "@apollo/client": "Apollo", effector: "Effector",
  "@ngrx/store": "NgRx", vuex: "Vuex", nanostores: "Nano Stores",
}

// prettier-ignore
const UI: Table = {
  tailwindcss: "Tailwind", "@mui/material": "MUI", antd: "Ant Design", "@chakra-ui/react": "Chakra",
  bootstrap: "Bootstrap", "react-bootstrap": "Bootstrap", "@radix-ui/": "Radix",
  "@base-ui/react": "Base UI", "@headlessui/react": "Headless UI", daisyui: "daisyUI",
  "@mantine/core": "Mantine", "styled-components": "styled-components", "@emotion/react": "Emotion",
  bulma: "Bulma", "primereact: ": "PrimeReact", "@diceui/": "DiceUI", "class-variance-authority": "cva",
  "@nextui-org/react": "NextUI", vuetify: "Vuetify", "@ionic/react": "Ionic",
}

// prettier-ignore
const CONNECTS: Table = {
  axios: "axios", ky: "ky", got: "got", "node-fetch": "node-fetch", ofetch: "ofetch",
  convex: "Convex", "@prisma/client": "Prisma", "drizzle-orm": "Drizzle", mongoose: "Mongoose",
  pg: "Postgres", mysql2: "MySQL", "better-sqlite3": "SQLite", redis: "Redis", ioredis: "Redis",
  "@supabase/supabase-js": "Supabase", firebase: "Firebase", "firebase-admin": "Firebase",
  "@directus/sdk": "Directus", "@trpc/client": "tRPC", "@trpc/server": "tRPC", graphql: "GraphQL",
  socket: "sockets", "socket.io": "Socket.IO", ws: "WebSocket", "@aws-sdk/client-s3": "S3",
  stripe: "Stripe", "@sentry/node": "Sentry", "@sentry/react": "Sentry", openai: "OpenAI",
  "@anthropic-ai/sdk": "Anthropic",
}

// prettier-ignore
const TESTING: Table = {
  vitest: "Vitest", jest: "Jest", mocha: "Mocha", "@playwright/test": "Playwright",
  cypress: "Cypress", "@testing-library/react": "Testing Library", ava: "AVA",
  jasmine: "Jasmine", karma: "Karma", supertest: "supertest", pytest: "pytest",
}

// prettier-ignore
const BUILDERS: Table = {
  vite: "Vite", webpack: "webpack", rollup: "Rollup", esbuild: "esbuild", parcel: "Parcel",
  turbo: "Turborepo", nx: "Nx", lerna: "Lerna", tsup: "tsup", rspack: "Rspack",
  "@swc/core": "SWC", babel: "Babel", "@babel/core": "Babel", gulp: "Gulp", grunt: "Grunt",
}

// prettier-ignore
const LINTERS: Table = {
  eslint: "ESLint", "@biomejs/biome": "Biome", oxlint: "oxlint", tslint: "TSLint (dead)",
  standard: "standard", xo: "xo", stylelint: "Stylelint",
}

// prettier-ignore
const FORMATTERS: Table = { prettier: "Prettier", "@biomejs/biome": "Biome", oxfmt: "oxfmt", dprint: "dprint" }

// prettier-ignore
const RUNTIME: Table = {
  "@types/node": "Node", "bun-types": "Bun", "@cloudflare/workers-types": "Workers",
  "@deno/types": "Deno", "@types/aws-lambda": "Lambda", wrangler: "Workers",
}

// prettier-ignore
const STYLING: Table = {
  sass: "Sass", less: "Less", stylus: "Stylus", postcss: "PostCSS", autoprefixer: "PostCSS",
  "@vanilla-extract/css": "vanilla-extract", "unocss": "UnoCSS", "tailwind-merge": "Tailwind",
  clsx: "clsx", classnames: "classnames",
}

// prettier-ignore
const CONTENT: Table = {
  "next-intl": "i18n", "react-i18next": "i18n", i18next: "i18n", "vue-i18n": "i18n",
  "@lingui/core": "i18n", "next-mdx-remote": "MDX", "@mdx-js/react": "MDX",
  contentlayer: "Contentlayer", "@sanity/client": "Sanity", "contentful": "Contentful",
  storyblok: "Storyblok", "@storybook/react": "Storybook", "@payloadcms/next": "Payload",
}

// prettier-ignore
const OBSERVE: Table = {
  "@sentry/nextjs": "Sentry", posthog: "PostHog", "posthog-js": "PostHog",
  "@vercel/analytics": "Vercel Analytics", "@vercel/speed-insights": "Vercel Analytics",
  "@datadog/browser-rum": "Datadog", "@opentelemetry/api": "OpenTelemetry", mixpanel: "Mixpanel",
  "@amplitude/analytics-browser": "Amplitude", pino: "pino", winston: "winston",
}

// prettier-ignore
const AUTH: Table = {
  "next-auth": "NextAuth", "@auth/core": "Auth.js", "@clerk/nextjs": "Clerk",
  "@auth0/auth0-react": "Auth0", passport: "Passport", jsonwebtoken: "JWT", jose: "JWT",
  "@supabase/auth-helpers-nextjs": "Supabase Auth", lucia: "Lucia", bcrypt: "bcrypt",
}

/** Marker files, matched on the full path or the basename. */
// prettier-ignore
const FILES: [RegExp, keyof Stack | "lock" | "docker" | "compose" | "k8s" | "terraform", string][] = [
  [/^(.*\/)?pnpm-lock\.yaml$/, "lock", "pnpm"],
  [/^(.*\/)?package-lock\.json$/, "lock", "npm"],
  [/^(.*\/)?yarn\.lock$/, "lock", "yarn"],
  [/^(.*\/)?bun\.lockb?$/, "lock", "bun"],
  [/^(.*\/)?shrinkwrap\.json$/, "lock", "npm shrinkwrap"],
  [/^(.*\/)?[Mm]akefile$/, "build", "Make"],
  [/^(.*\/)?[Jj]ustfile$/, "build", "just"],
  [/^(.*\/)?Taskfile\.ya?ml$/, "build", "Task"],
  [/^(.*\/)?turbo\.json$/, "build", "Turborepo"],
  [/^(.*\/)?nx\.json$/, "build", "Nx"],
  [/^(.*\/)?Rakefile$/, "build", "Rake"],
  [/^\.github\/workflows\/.+\.ya?ml$/, "ci", "GitHub Actions"],
  [/^\.gitlab-ci\.ya?ml$/, "ci", "GitLab CI"],
  [/^(.*\/)?Jenkinsfile$/, "ci", "Jenkins"],
  [/^\.circleci\/config\.ya?ml$/, "ci", "CircleCI"],
  [/^\.travis\.ya?ml$/, "ci", "Travis"],
  [/^(.*\/)?azure-pipelines\.ya?ml$/, "ci", "Azure Pipelines"],
  [/^(.*\/)?\.drone\.ya?ml$/, "ci", "Drone"],
  [/^(.*\/)?vercel\.json$/, "ci", "Vercel"],
  [/^(.*\/)?netlify\.toml$/, "ci", "Netlify"],
  [/^(.*\/)?[Dd]ockerfile(\..+)?$/, "docker", "Dockerfile"],
  [/^(.*\/)?docker-compose(\..+)?\.ya?ml$/, "compose", "compose"],
  [/^(.*\/)?compose\.ya?ml$/, "compose", "compose"],
  [/^(.*\/)?.+\.tf$/, "terraform", "terraform"],
  [/^(.*\/)?(k8s|kubernetes|manifests|helm|charts)\/.+\.ya?ml$/, "k8s", "kubernetes"],
  [/^(.*\/)?Chart\.ya?ml$/, "k8s", "helm"],
  [/^(.*\/)?.+\.bru$/, "apis", "Bruno"],
  [/^(.*\/)?.+\.postman_collection\.json$/, "apis", "Postman"],
  [/^(.*\/)?.+\.insomnia\.json$/, "apis", "Insomnia"],
  [/^(.*\/)?.+\.http$/, "apis", "REST client"],
  [/^(.*\/)?openapi\.(ya?ml|json)$/, "apis", "OpenAPI"],
  [/^(.*\/)?swagger\.(ya?ml|json)$/, "apis", "OpenAPI"],
  [/^(.*\/)?components\.json$/, "ui", "shadcn"],
  [/^(.*\/)?tsconfig(\..+)?\.json$/, "typescript", "tsconfig"],
]

/** Instruction and config files an ai coding tool leaves behind. */
// prettier-ignore
const AGENTS: [RegExp, string][] = [
  [/^(.*\/)?CLAUDE\.(md|local\.md)$|^(.*\/)?\.claude\//, "Claude Code"],
  [/^(.*\/)?AGENTS\.md$/, "AGENTS.md"],
  [/^(.*\/)?\.cursorrules$|^(.*\/)?\.cursor(rules)?\//, "Cursor"],
  [/^\.github\/copilot-instructions\.md$|^\.github\/instructions\//, "Copilot"],
  [/^(.*\/)?\.aider(\..+)?$|^(.*\/)?CONVENTIONS\.md$/, "aider"],
  [/^(.*\/)?\.windsurfrules$|^(.*\/)?\.windsurf\//, "Windsurf"],
  [/^(.*\/)?\.clinerules(\/.*)?$/, "Cline"],
  [/^(.*\/)?\.roo(rules|modes)?(\/.*)?$/, "Roo"],
  [/^(.*\/)?\.continue\//, "Continue"],
  [/^(.*\/)?GEMINI\.md$|^(.*\/)?\.gemini\//, "Gemini CLI"],
  [/^(.*\/)?AGENT\.md$|^(.*\/)?\.amp\//, "Amp"],
  [/^(.*\/)?\.codex\/|^(.*\/)?codex\.md$/i, "Codex"],
  [/^(.*\/)?\.junie\//, "Junie"],
  [/^(.*\/)?\.kiro\//, "Kiro"],
  [/^(.*\/)?\.goosehints$|^(.*\/)?\.goose\//, "Goose"],
  [/^(.*\/)?\.devin\//, "Devin"],
  [/^(.*\/)?\.amazonq\//, "Amazon Q"],
  [/^(.*\/)?\.augment(-guidelines)?(\/.*)?$/, "Augment"],
  [/^(.*\/)?\.sourcegraph\/|^(.*\/)?\.cody\//, "Cody"],
  [/^(.*\/)?\.specstory\//, "SpecStory"],
  [/^(.*\/)?\.?mcp\.json$|^(.*\/)?\.mcp\//, "MCP"],
  [/^(.*\/)?llms(-full)?\.txt$/, "llms.txt"],
  [/^(.*\/)?\.ai-?(rules|instructions)(\..+)?$/, "house rules"],
]

/** What an ai calls itself in a trailer or an author line. */
// prettier-ignore
const SIGNERS: [RegExp, string][] = [
  [/claude/i, "Claude Code"], [/cursor/i, "Cursor"], [/copilot/i, "Copilot"],
  [/devin/i, "Devin"], [/aider/i, "aider"], [/codex|chatgpt|openai/i, "Codex"],
  [/gemini|jules/i, "Gemini CLI"], [/windsurf|codeium/i, "Windsurf"], [/cline/i, "Cline"],
  [/openhands|opendevin/i, "OpenHands"], [/\bamp\b|sourcegraph/i, "Amp"], [/\bcody\b/i, "Cody"],
  [/coderabbit/i, "CodeRabbit"], [/sweep-ai|sweepai/i, "Sweep"], [/tabnine/i, "Tabnine"],
  [/amazon ?q|codewhisperer/i, "Amazon Q"], [/roo ?code/i, "Roo"], [/kiro/i, "Kiro"],
  [/goose/i, "Goose"], [/augment/i, "Augment"], [/factory\.ai|droid/i, "Factory"],
  [/antigravity/i, "Antigravity"], [/continue\.dev/i, "Continue"], [/junie/i, "Junie"],
]

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

// copies of other people's code, and build output. Neither describes this project
const VENDORED =
  /(^|\/)(node_modules|bower_components|jspm_packages|web_modules|vendor|third_party|Godeps|Pods|Carthage|\.yarn|\.pnp|\.gradle|\.tox|\.venv|venv|site-packages|__pycache__|dist|build|out|target|coverage|\.next|\.nuxt|\.output|__fixtures__|fixtures)\/|(^|\/)wwwroot\/lib\//

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
  if (/^\d/.test(range)) return "exact"
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

/**
 * Who signed the history. Only the author line and the trailers count, so a commit
 * that merely writes about an assistant is not counted as written by one.
 */
/** the tool a trailer names, without its model suffix, so Copilot:Claude reads as Copilot */
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
    const [author = "", ...body] = commit.split("\n")
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

export function stack(repo: string): Stack {
  const paths = git(repo, "ls-files", "-z").split("\0").filter(Boolean)
  const found: Record<string, string[]> = {}
  const counts = { dockerfiles: 0, compose: 0, kubernetes: 0, terraform: 0 }
  const licenses: string[] = []
  const node: string[] = []
  const modules: string[] = []
  const env: string[] = []
  const strict = { on: 0, off: 0 }
  const ports: number[] = []
  const agents: string[] = []
  const agentFiles: Record<string, number> = {}

  const port = (value: number) => {
    if (value > 0 && value < 65536 && !ports.includes(value)) ports.push(value)
  }

  for (const path of paths) {
    if (VENDORED.test(path)) continue
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
    for (const [match, tool] of AGENTS) {
      if (!match.test(path)) continue
      add(agents, tool)
      // the last matched segment, so a rules folder counts once and nesting collapses
      const hit = path.match(match)?.[0] ?? path
      const marker = hit.endsWith("/") ? `${hit.split("/").at(-2)}/` : (hit.split("/").pop() ?? hit)
      agentFiles[marker] = (agentFiles[marker] ?? 0) + 1
    }
  }

  for (const path of paths) {
    if (VENDORED.test(path)) continue
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

  // every manifest, wherever it sits, so a monorepo is read whole
  const manifests = paths
    .filter((p) => /^(.*\/)?package\.json$/.test(p) && !VENDORED.test(p))
    .map((p) => manifest(repo, p))
    .filter((m): m is Manifest => !!m)

  const frameworks: string[] = []
  const state: string[] = []
  const ui: string[] = [...(found.ui ?? [])]
  const connects: string[] = []
  const testing: string[] = []
  const runtimes: string[] = []
  const styling: string[] = []
  const content: string[] = []
  const observability: string[] = []
  const auth: string[] = []
  const scripts: string[] = []
  const bundlers: string[] = []
  const build: string[] = [...(found.build ?? [])]
  const linters: string[] = []
  const formatters: string[] = []
  const typescript: string[] = []
  const managers: string[] = [...(found.lock ?? [])]
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
      for (const found of body.matchAll(/(?:--port[= ]|-p[= ])(\d{2,5})/g)) port(Number(found[1]))
    }
    for (const [name, range] of Object.entries(m.deps)) {
      names.add(name)
      pinning[pin(String(range))]++
      if (name === "typescript") add(typescript, String(range))
      add(frameworks, label(FRAMEWORKS, name))
      add(state, label(STATE, name))
      add(ui, label(UI, name))
      add(connects, label(CONNECTS, name))
      add(testing, label(TESTING, name))
      add(build, label(BUILDERS, name))
      add(runtimes, label(RUNTIME, name))
      add(styling, label(STYLING, name))
      add(content, label(CONTENT, name))
      add(observability, label(OBSERVE, name))
      add(auth, label(AUTH, name))
      add(linters, label(LINTERS, name))
      add(formatters, label(FORMATTERS, name))
    }
  }

  // only a licence at the root speaks for the project, the rest come with vendored code
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

  // the dominant extension names the project's real language, node manifest or not
  const tally = new Map<string, number>()
  for (const path of paths) {
    const dot = path.lastIndexOf(".")
    const slash = path.lastIndexOf("/")
    if (dot > slash + 1) {
      const ext = path.slice(dot + 1).toLowerCase()
      tally.set(ext, (tally.get(ext) ?? 0) + 1)
    }
  }
  const primary = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
  const exts = new Set(tally.keys())
  const hasTs =
    exts.has("ts") || exts.has("tsx") || exts.has("mts") || (found.typescript?.length ?? 0) > 0
  const hasJs = exts.has("js") || exts.has("jsx") || exts.has("mjs") || exts.has("cjs")

  // what the repo actually contains, judged by what it depends on and what it ships
  const parts: string[] = []
  const server = [
    "Express",
    "Fastify",
    "NestJS",
    "Koa",
    "Hono",
    "hapi",
    "Next.js",
    "Nuxt",
    "SvelteKit",
  ]
  const client = [
    "React",
    "Vue",
    "Svelte",
    "Angular",
    "Solid",
    "Preact",
    "Astro",
    "Next.js",
    "Nuxt",
  ]
  if (frameworks.some((f) => client.includes(f))) add(parts, "frontend")
  if (frameworks.some((f) => server.includes(f)) || connects.length) add(parts, "backend")
  if (manifests.some((m) => Object.keys(m.deps).length === 0 && m.workspaces))
    add(parts, "monorepo root")
  if (manifests.some((m) => m.workspaces)) add(parts, "monorepo")
  if (manifests.some((m) => "bin" in m)) add(parts, "cli")
  if (frameworks.includes("React Native") || frameworks.includes("Expo")) add(parts, "mobile")
  if (frameworks.includes("Electron") || frameworks.includes("Tauri")) add(parts, "desktop")
  if (manifests.some((m) => m.bin)) add(parts, "cli")
  if (counts.dockerfiles || counts.compose || counts.kubernetes || counts.terraform)
    add(parts, "infra")
  if (exts.has("mjs")) add(modules, "esm")
  if (exts.has("cjs")) add(modules, "cjs")

  // a stray .js among python does not make a node project, a manifest or a tsconfig does
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
    lockfiles: found.lock ?? [],
    pinning,
    dependencies: names.size,
    build,
    frameworks,
    state,
    ui,
    connects,
    testing,
    runtimes,
    styling,
    content,
    observability,
    auth,
    scripts,
    linters,
    formatters,
    rules: [...(found.linters ?? []), ...(found.formatters ?? [])],
    ci: found.ci ?? [],
    bundlers,
    ports: ports.sort((a, b) => a - b),
    node,
    modules,
    strict,
    env,
    containers: counts,
    apis: found.apis ?? [],
    licenses,
    parts,
    ai: { ...signatures, tools, files: agentFiles },
  }
}
