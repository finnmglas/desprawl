// owner: finn
// goal: every package on disk is found once, and only the resolved one is direct

import assert from "node:assert/strict"
import { test } from "node:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deps } from "../src/deps.ts"

/** npm nests, pnpm links out of a store, and a scope is a folder holding neither */
function installed(): string {
  const dir = mkdtempSync(join(tmpdir(), "desprawl-deps-"))
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }))
  execFileSync("git", ["init", "-q"], { cwd: dir })
  const put = (path: string, name: string, version: string, license: string) => {
    mkdirSync(join(dir, path), { recursive: true })
    writeFileSync(join(dir, path, "package.json"), JSON.stringify({ name, version, license }))
  }
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "root",
      dependencies: { axios: "^1.0.0" },
      devDependencies: { vite: "^7.0.0" },
    }),
  )
  put("node_modules/axios", "axios", "1.9.0", "MIT")
  put("node_modules/@scope/thing", "@scope/thing", "2.0.0", "Apache-2.0")
  put("node_modules/vite", "vite", "7.3.6", "MIT")
  put("node_modules/vite/node_modules/nested", "nested", "0.1.0", "ISC")
  put("node_modules/.pnpm/lodash@4.17.21/node_modules/lodash", "lodash", "4.17.21", "MIT")
  put(
    "node_modules/.pnpm/@img+sharp@1.0.0/node_modules/@img/sharp",
    "@img/sharp",
    "1.0.0",
    "LGPL-3.0",
  )
  put("node_modules/.pnpm/axios@1.2.0/node_modules/axios", "axios", "1.2.0", "MIT")
  return dir
}

test("every layout npm and pnpm produce is walked, and each package counted once", async () => {
  const { list } = await deps(installed())
  const at = (name: string, version: string) =>
    list.find((one) => one.name === name && one.version === version)

  assert.equal(list.length, 7, "nested, scoped and stored packages are all found")
  assert.equal(at("@scope/thing", "2.0.0")?.license, "Apache-2.0", "a scope is not a package")
  assert.equal(at("@img/sharp", "1.0.0")?.license, "LGPL-3.0", "a scope inside the store either")
  assert.equal(at("nested", "0.1.0")?.license, "ISC", "and a nested tree is walked too")
})

test("only the copy the manifest resolved to is direct", async () => {
  const { list } = await deps(installed())
  const at = (name: string, version: string) =>
    list.find((one) => one.name === name && one.version === version)

  assert.equal(at("axios", "1.9.0")?.direct, true, "the one under node_modules")
  assert.equal(at("axios", "1.2.0")?.direct, false, "another copy of the same name is not")
  assert.equal(at("vite", "7.3.6")?.dev, true, "a dev dependency says so")
  assert.equal(at("lodash", "4.17.21")?.direct, false, "nothing here asked for it")
})
