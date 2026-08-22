// owner: finn
// goal: every package on disk is found once, and only the resolved one is direct

import assert from "node:assert/strict"
import { test } from "node:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deps } from "../src/facts/deps.ts"

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

test("a venv is read the way node_modules is, and a lock pins what no venv holds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "desprawl-venv-"))
  const site = join(dir, ".venv", "lib", "python3.12", "site-packages")
  const put = (path: string, text: string) => {
    mkdirSync(join(site, path.split("/")[0]), { recursive: true })
    writeFileSync(join(site, path), text)
  }
  put(
    "fastapi-0.110.0.dist-info/METADATA",
    "Name: fastapi\nVersion: 0.110.0\nClassifier: License :: OSI Approved :: MIT License\nRequires-Dist: pydantic >=1.7.4\n",
  )
  put("fastapi-0.110.0.dist-info/RECORD", "fastapi/__init__.py,sha256=a,1024\nfastapi/m.py,,2048\n")
  // the free text field holds a whole licence as often as its name, so a classifier wins
  put(
    "pydantic-2.6.4.dist-info/METADATA",
    "Name: pydantic\nVersion: 2.6.4\nLicense: The MIT License (MIT)\n\nCopyright (c) 2017 to present.\nClassifier: License :: OSI Approved :: MIT License\n",
  )
  put("pytest-8.1.1.dist-info/METADATA", "Name: pytest\nVersion: 8.1.1\nLicense-Expression: MIT\n")
  writeFileSync(
    join(dir, "pyproject.toml"),
    '[project]\nname = "svc"\ndependencies = ["fastapi>=0.110"]\n\n[project.optional-dependencies]\ndev = ["pytest"]\n',
  )
  writeFileSync(
    join(dir, "uv.lock"),
    'version = 1\n\n[[package]]\nname = "fastapi"\nversion = "0.110.0"\n\n[[package]]\nname = "httpx"\nversion = "0.27.0"\n',
  )
  writeFileSync(join(dir, "app.py"), "def go():\n    return 1\n")
  execFileSync("git", ["init", "-q"], { cwd: dir })
  execFileSync("git", ["add", "-A"], { cwd: dir })
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x"], {
    cwd: dir,
  })

  const found = await deps(dir)
  rmSync(dir, { recursive: true, force: true })
  const by = (name: string) => found.list.find((one) => one.name === name)!
  assert.equal(by("fastapi").version, "0.110.0")
  assert.equal(by("fastapi").license, "MIT License")
  assert.equal(by("fastapi").bytes, 3072, "RECORD says how many bytes it put on disk")
  assert.ok(by("fastapi").direct)
  assert.equal(by("pydantic").license, "MIT License")
  assert.equal(by("pydantic").direct, false, "nothing here asked for it, fastapi did")
  assert.equal(by("pytest").license, "MIT")
  assert.ok(by("pytest").dev, "an extra called dev is a dev dependency")
  assert.equal(by("httpx").version, "0.27.0", "the lock pins what the venv never installed")
  assert.equal(by("httpx").direct, false)
  assert.ok(!found.list.some((one) => one.name === "dev"), "an extras group is not a package")
})
