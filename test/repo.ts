// owner: finn
// goal: a throwaway git repo per test

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

/** the developer's own git config must never decide what a test counts */
const ISOLATED = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
}

export interface Commit {
  /** path to contents. A value of null makes a symlink instead, see link() */
  files: Record<string, string>
  /** overrides the deterministic date, for testing broken clocks */
  when?: string
  author?: string
  message?: string
}

/** repo({"a.ts": "x"}, {"a.ts": "x\ny"}) is two commits, dated in order */
export function repo(...commits: (Record<string, string> | Commit)[]): string {
  const dir = mkdtempSync(join(tmpdir(), "desprawl-test-"))
  const run = (when: string, ...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      stdio: "pipe",
      env: { ...ISOLATED, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
    })

  run("", "init", "-q", "-b", "main")
  commits.forEach((entry, i) => {
    const commit: Commit = "files" in entry ? entry : { files: entry as Record<string, string> }
    for (const [path, body] of Object.entries(commit.files)) {
      const full = join(dir, path)
      mkdirSync(dirname(full), { recursive: true })
      if (body.startsWith("symlink:")) symlinkSync(body.slice(8), full)
      else writeFileSync(full, body)
    }
    const when = commit.when ?? `2026-01-0${i + 1}T12:00:00Z`
    const who = commit.author ?? "Tester <t@example.com>"
    const [name, mail] = [who.replace(/ <.*/, ""), who.replace(/.*</, "").replace(">", "")]
    run(when, "add", "-A")
    run(
      when,
      "-c",
      `user.name=${name}`,
      "-c",
      `user.email=${mail}`,
      "commit",
      "-qm",
      commit.message ?? `c${i + 1}`,
    )
  })
  return dir
}

/** the node for one path in an analysed tree, which most tests want */
export const child = (tree: { children?: { name: string }[] }, name: string) =>
  tree.children!.find((c) => c.name === name) as never as {
    code: number
    commits: number
    insertions: number
    lang: string
  }

/** run git in a fixture, for the few tests that need to set one up further */
export const inRepo = (dir: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", env: ISOLATED })
