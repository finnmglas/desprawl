// owner: finn
// goal: vendor the few brand marks we show, run by hand when the label set grows

import { writeFileSync } from "node:fs"
import { NOTES } from "../src/notes.ts"
import { LANGS, NAMES } from "../src/scan.ts"

/** where a slug cannot be guessed from the label */
// prettier-ignore
const NAMED: Record<string, string> = {
  "Next.js": "nextdotjs", "Node": "nodedotjs", "Socket.IO": "socketdotio", "Rollup": "rollupdotjs",
  "Vue": "vuedotjs", "shadcn": "shadcnui", "Shell": "gnubash", "Make": "gnu", "HTML": "html5",
  "SCSS": "sass", "C++": "cplusplus", "Workers": "cloudflare", "Groovy": "apachegroovy",
  "TanStack Query": "reactquery", "Apollo": "apollographql", "Postgres": "postgresql",
  "Mongoose": "mongodb", "Claude Code": "anthropic", "Gemini CLI": "googlegemini",
  "React Native": "react", "SvelteKit": "svelte", "Chakra": "chakraui", "Radix": "radixui",
  "Ant Design": "antdesign", "styled-components": "styledcomponents",
  "Testing Library": "testinglibrary", "GitHub Actions": "githubactions", "GitLab CI": "gitlab",
  "Redux Toolkit": "redux", "Base UI": "baseui", "Headless UI": "headlessui",
  "Tailwind": "tailwindcss", "Copilot": "githubcopilot", "JWT": "jsonwebtokens",
  "Turbopack": "turborepo", "Vuex": "vuedotjs", "i18n": "i18next", "MCP": "modelcontextprotocol",
  "Vercel Analytics": "vercel", "NextAuth": "nextdotjs",
  "Java": "openjdk", "Nix": "nixos", "AsciiDoc": "asciidoctor", "Notebook": "jupyter",
  "Starlark": "bazel", "Visual Basic": "dotnet",
}

/** a glyph is only worth its bytes for a mark that is read at a glance */
// prettier-ignore
const GLYPHS = new Set([
  "TypeScript", "JavaScript", "Python", "Rust", "Go", "Ruby", "PHP", "Swift", "Kotlin", "Java",
  "React", "Next.js", "Vue", "Svelte", "Angular", "Astro", "Node", "Deno", "Bun", "Docker",
  "Tailwind", "shadcn", "Base UI", "Radix", "Vite", "webpack", "ESLint", "Prettier", "Biome",
  "Jest", "Vitest", "Cypress", "GitHub Actions", "pnpm", "npm", "yarn", "axios", "Zustand",
  "Postgres", "Redis", "Supabase", "Firebase", "Convex", "Prisma", "GraphQL", "Stripe",
  "Sentry", "PostHog", "Clerk", "Storybook", "Claude Code", "Copilot", "Cursor",
])

/** black or white on the brand colour, whichever the eye can read */
function readable(hex: string): string {
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = [0, 2, 4]
    .map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
  // the two contrast ratios cross so close together that similar blues would flip ink
  return luminance > 0.42 ? "111" : "fff"
}

const icons = (await (
  await fetch("https://unpkg.com/simple-icons@latest/data/simple-icons.json", { redirect: "follow" })
).json()) as { title: string; slug: string; hex: string }[]

const bySlug = new Map(icons.map((i) => [i.slug, i]))
const byTitle = new Map(icons.map((i) => [i.title.toLowerCase(), i]))
const plain = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, "")

/** brands the icon set no longer ships, colour only, no glyph invented */
// prettier-ignore
const MANUAL: Record<string, string> = {
  OpenAI: "412991", Playwright: "2ead33", "C#": "239120", S3: "569a31", Lambda: "ff9900",
  Codex: "412991", Turbopack: "ef4444", Parcel: "e9a03b",
  AWS: "ff9900", Azure: "0078d4", Heroku: "430098", Linode: "00a95c",
}

const found: Record<string, [string, string, string]> = {}
const missing: string[] = []

// every label the ui can show: stack notes, language names, and the named files
const labels = [...new Set([...Object.keys(NOTES), ...Object.values(LANGS), ...Object.values(NAMES)])]

for (const label of labels) {
  // a hand picked colour wins, or "C#" quietly borrows the mark for C
  const hex = MANUAL[label]
  if (hex) {
    found[label] = [hex, readable(hex), ""]
    continue
  }
  const icon =
    bySlug.get(NAMED[label] ?? "") ?? byTitle.get(label.toLowerCase()) ?? bySlug.get(plain(label))
  if (!icon) {
    missing.push(label)
    continue
  }
  let path = ""
  if (GLYPHS.has(label)) {
    // full precision on purpose: rounding compounds along the relative commands
    // until a shape tears open, which is how the supabase mark lost half of itself
    const svg = await (await fetch(`https://cdn.simpleicons.org/${icon.slug}`)).text()
    path = svg.match(/ d="([^"]+)"/)?.[1] ?? ""
  }
  found[label] = [icon.hex.toLowerCase(), readable(icon.hex), path]
}

const body = Object.entries(found)
  .map(([l, [c, ink, p]]) => `  ${JSON.stringify(l)}: ["${c}", "${ink}", "${p}"],`)
  .join("\n")

writeFileSync(
  "ui/lib/brands.ts",
  `// owner: finn\n// goal: brand colour, ink and glyph per label, written by scripts/brands.ts\n\n` +
    `// prettier-ignore\nexport const BRANDS: Record<string, [string, string, string]> = {\n${body}\n}\n`,
)

const glyphs = Object.values(found).filter(([, , p]) => p).length
console.log(`${Object.keys(found).length} marks, ${glyphs} with a glyph`)
console.log(`no mark: ${missing.join(", ")}`)
