// owner: finn
// goal: tell each published demo about the others, run by the pages workflow

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** what the site holds, in the order a reader is offered them */
const DEMOS: { at: string; name: string; said: string }[] = [
  { at: ".", name: "desprawl", said: "this tool on its own source" },
  { at: "vscode", name: "vscode", said: "12k files, and the loops inside them" },
  { at: "realworld", name: "a backend and two frontends", said: "the api edges between repos" },
]

const site = process.argv[2] ?? "site"
// the opening tag, since the page already holds a payload and this repo's own source is in
// it: the first closing one belongs to a copied line of html, a third of the way down
const HEAD = "<head>"

for (const one of DEMOS) {
  const page = join(site, one.at === "." ? "" : one.at, "index.html")
  const html = readFileSync(page, "utf8")
  const at = html.indexOf(HEAD)
  if (at === -1) throw new Error(`no <head> in ${page}`)
  const open = at + HEAD.length
  // each page is told about the others only, so nothing offers a link back to itself,
  // and the paths are relative since a project page is not served from the domain root
  const others = DEMOS.filter((other) => other.at !== one.at).map((other) => ({
    name: other.name,
    said: other.said,
    at: one.at === "." ? `./${other.at}/` : other.at === "." ? "../" : `../${other.at}/`,
  }))
  const said = `<script>window.__DESPRAWL_DEMOS__=${JSON.stringify(others).replaceAll("<", "\\u003c")}</script>`
  writeFileSync(page, html.slice(0, open) + said + html.slice(open))
  console.log(`${page}: ${others.map((other) => other.name).join(", ")}`)
}
