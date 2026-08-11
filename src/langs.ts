// owner: finn
// goal: extension to language, wanted by the reader as well as the scanner

export const TS = "TypeScript"
export const JS = "JavaScript"
const ts = TS
const js = JS

// prettier-ignore
export const LANGS: Record<string, string> = {
  ts, tsx: ts, mts: ts, cts: ts,
  js: js, jsx: js, mjs: js, cjs: js,
  rs: "Rust", py: "Python", go: "Go", rb: "Ruby", java: "Java", kt: "Kotlin",
  c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++", cs: "C#", swift: "Swift", php: "PHP",
  css: "CSS", scss: "SCSS", html: "HTML", vue: "Vue", svelte: "Svelte",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", sql: "SQL", prisma: "Prisma",
  md: "Markdown", sh: "Shell", bash: "Shell", flow: "Flow",
  zig: "Zig", lua: "Lua", dart: "Dart", scala: "Scala", clj: "Clojure", cljs: "Clojure",
  ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", jl: "Julia", r: "R", nim: "Nim",
  pl: "Perl", pm: "Perl", ps1: "PowerShell", bat: "Batch", cmd: "Batch", zsh: "Shell",
  fish: "Shell", vb: "Visual Basic", f90: "Fortran", groovy: "Groovy", gradle: "Gradle",
  tf: "Terraform", hcl: "HCL", nix: "Nix", proto: "Protobuf", graphql: "GraphQL", gql: "GraphQL",
  sol: "Solidity", astro: "Astro", mdx: "MDX", tex: "LaTeX", adoc: "AsciiDoc", rst: "reStructuredText",
  txt: "Text", snap: "Snapshot", svg: "SVG", xml: "XML", csv: "CSV", tsv: "CSV", ini: "INI",
  cfg: "INI", conf: "INI", properties: "INI", plist: "XML", bzl: "Starlark", mk: "Make",
  patch: "Patch", diff: "Patch", lock: "Lockfile", ipynb: "Notebook",
}
