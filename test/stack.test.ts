// owner: finn
// goal: what the project is, and who has been in it

import assert from "node:assert/strict"
import { test } from "node:test"
import { analyze } from "../src/analyze.ts"
import { stack } from "../src/stack.ts"
import { repo } from "./repo.ts"

const NEXT = '{"name":"app","dependencies":{"next":"14.0.0","react":"18.2.0"}}'

test("a vendored manifest never describes the project", () => {
  const s = stack(
    repo({
      "package.json": '{"dependencies":{"@angular/core":"17.0.0"}}',
      "dist/vendor/package.json": '{"dependencies":{"react":"18.2.0"}}',
      "node_modules/dep/package.json": '{"dependencies":{"react":"18.2.0"}}',
      "test/fixtures/broken/package.json": '{"dependencies":{"vue":"3.0.0"}}',
    }),
  )
  assert.deepEqual(s.frameworks, ["Angular"])
  assert.equal(s.manifests.length, 1)
})

test("an assistant's rules inside a dependency are not this repo's", () => {
  const s = stack(
    repo({
      "package.json": "{}",
      "node_modules/dep/AGENTS.md": "x\n",
      "node_modules/dep/.claude/settings.json": "{}",
    }),
  )
  assert.deepEqual(s.ai.tools, [])
})

test("checked in rules name the tools that were used", () => {
  const s = stack(repo({ "package.json": "{}", "CLAUDE.md": "x\n", ".cursor/rules": "y\n" }))
  assert.deepEqual(s.ai.tools.sort(), ["Claude Code", "Cursor"])
})

test("a signature counts, prose about an assistant does not", () => {
  const dir = repo(
    {
      files: { "a.ts": "a\n" },
      message: "feat: thing\n\nCo-authored-by: Claude <noreply@anthropic.com>",
    },
    { files: { "a.ts": "b\n" }, message: "docs: explain how claude code is used here" },
  )
  const { ai } = stack(dir)
  assert.equal(ai.signed, 1)
  assert.deepEqual(ai.by, { "Claude Code": 1 })
})

test("a tool that ran a model is credited, not the model", () => {
  const dir = repo({
    files: { "a.ts": "a\n" },
    message: "fix: thing\n\nAssisted-by: Copilot:Claude-Opus-4.8",
  })
  assert.deepEqual(stack(dir).ai.by, { Copilot: 1 })
})

test("identity is the biggest real language, never an asset", () => {
  const s = analyze(
    repo({ "icon.svg": "<path/>\n".repeat(200), "a.ts": "const a = 1\n".repeat(10) }),
  )
  assert.equal(s.stack.primary, "TypeScript")
  // the asset is still counted, it just does not name the repo
  assert.ok(
    s.languages.find((l) => l.name === "SVG")!.code >
      s.languages.find((l) => l.name === "TypeScript")!.code,
  )
})

test("a repo with nothing recognisable says so rather than guessing", () => {
  assert.equal(analyze(repo({ "notes.txt": "hello\n" })).stack.primary, "")
})

test("cli is claimed only by a package that ships a binary", () => {
  assert.ok(!stack(repo({ "package.json": NEXT })).parts.includes("cli"))
  const tool = stack(repo({ "package.json": '{"bin":{"x":"cli.js"},"dependencies":{}}' }))
  assert.ok(tool.parts.includes("cli"))
})

test("what it holds comes from what it depends on", () => {
  const s = stack(repo({ "package.json": NEXT, Dockerfile: "FROM node\nEXPOSE 3000\n" }))
  assert.deepEqual(s.parts.sort(), ["backend", "frontend", "infra"])
  assert.deepEqual(s.ports, [3000])
})

test("a range and an exact version are told apart", () => {
  const s = stack(
    repo({ "package.json": '{"dependencies":{"a":"1.0.0","b":"^2.0.0","c":"~3.0.0"}}' }),
  )
  assert.deepEqual(s.pinning, { exact: 1, caret: 1, tilde: 1, range: 0, linked: 0 })
})

test("a licence beside the manifest is the project's, one below is vendored", () => {
  const s = stack(
    repo({
      "package.json": "{}",
      LICENSE: "MIT License\n",
      "vendor/x/LICENSE": "Apache License\n",
    }),
  )
  assert.equal(s.license, "MIT")
  assert.equal(s.vendored, 1)
})

test("the module system is read from the manifest and the extensions", () => {
  assert.deepEqual(stack(repo({ "package.json": '{"type":"module"}' })).modules, ["esm"])
  const both = stack(repo({ "package.json": '{"type":"commonjs"}', "x.mjs": "export {}\n" }))
  assert.deepEqual(both.modules.sort(), ["cjs", "esm"])
})

test("a bundler named only in a script is still found", () => {
  const s = stack(repo({ "package.json": '{"scripts":{"dev":"next dev --turbopack -p 4321"}}' }))
  assert.ok(s.bundlers.includes("Turbopack"))
  assert.deepEqual(s.ports, [4321], "a port on a command line is a port")
})

test("ports come out of compose files too", () => {
  const s = stack(
    repo({ "docker-compose.yml": 'services:\n  web:\n    ports:\n      - "8080:80"\n' }),
  )
  assert.deepEqual(s.ports, [8080])
  assert.equal(s.containers.compose, 1)
})

test("the manager is read from whichever lockfile is present", () => {
  const from = (lock: string) => stack(repo({ "package.json": "{}", [lock]: "" })).managers
  for (const [lock, manager] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ])
    assert.deepEqual(from(lock), [manager], lock)
  assert.deepEqual(stack(repo({ "package.json": "{}" })).lockfiles, [], "no lockfile, no guess")
})

test("strictness is counted per tsconfig, not assumed", () => {
  const s = stack(
    repo({
      "tsconfig.json": '{"compilerOptions":{"strict":true}}',
      "ui/tsconfig.json": '{"compilerOptions":{}}',
    }),
  )
  assert.deepEqual(s.strict, { on: 1, off: 1 })
})

test("the host is read from whichever evidence the repo leaves", () => {
  const host = (files: Record<string, string>) => stack(repo(files)).hosts
  assert.deepEqual(host({ "vercel.json": "{}" }), ["Vercel"], "a config file")
  assert.deepEqual(host({ "main.tf": 'provider "hcloud" {}' }), ["Hetzner"], "a terraform provider")
  assert.deepEqual(
    host({ ".github/workflows/a.yml": "steps:\n  - uses: google-github-actions/auth@v2\n" }),
    ["Google Cloud"],
    "a workflow action",
  )
  assert.deepEqual(
    host({ "package.json": '{"scripts":{"ship":"wrangler deploy"}}' }),
    ["Cloudflare"],
    "a deploy script",
  )
  assert.deepEqual(host({ "cloudbuild.yaml": "steps: []" }), ["Google Cloud"], "a cloud build file")
  assert.deepEqual(
    host({ "stable.cloudbuild.yaml": "steps:\n  - name: gcr.io/cloud-builders/docker\n" }),
    ["Google Cloud"],
    "a prefixed cloud build file",
  )
})

test("using a cloud's services is not the same as deploying there", () => {
  const s = stack(repo({ "package.json": '{"dependencies":{"@google-cloud/storage":"7.0.0"}}' }))
  assert.deepEqual(s.hosts, [], "a storage client says nothing about the host")
})
