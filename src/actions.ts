// owner: finn
// goal: the handful of commands a reader would otherwise switch to a terminal for

import { execFile, execFileSync, spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { jsonc } from "./graph.ts"
import { git } from "./model.ts"
import type { Run } from "./tests.ts"

export interface Action {
  id: string
  label: string
  note: string
  kind: "git" | "project"
  /** shown so nobody presses a button without knowing what it runs */
  command: string
  /** leaves this machine, so it is asked about rather than just run */
  outward?: boolean
  /** a server or a watcher: it is started and stopped rather than waited for */
  long?: boolean
}

/** one of those, while it is up */
export interface Alive {
  id: string
  command: string
  since: number
  output: string
  running: boolean
  code: number | null
}

// never ending, so a button would sit on them rather than finish. The name is a hint and
// the command is the evidence: a script called ui is still a dev server underneath
const FOREVER = /(^|:)(dev|start|watch|serve|preview|storybook)$/
const SERVES =
  /(^|\s)(vite|next|nuxt|remix|astro)(?!\s+build)(\s|$)|(^|\s)(webpack-dev-server|nodemon|http-server|live-server)(\s|$)|--watch\b|\bserve\b|cli\.ts\b/
// leaves the machine or changes what others see, and is not something a panel should offer
const OUTWARD = /^(publish|release|deploy|prepublish|prepack)/

const GIT: Action[] = [
  {
    id: "fetch",
    label: "Fetch all",
    note: "every branch and tag from every remote, pruning what is gone",
    kind: "git",
    command: "git fetch --all --prune --tags",
  },
  {
    id: "pull",
    label: "Pull",
    note: "fast forward only, so it never writes a merge nobody asked for",
    kind: "git",
    command: "git pull --ff-only",
  },
  {
    id: "push",
    label: "Push",
    note: "sends this branch to its remote",
    kind: "git",
    command: "git push",
    outward: true,
  },
]

const read = (path: string): Record<string, any> | null => {
  try {
    return jsonc(readFileSync(path, "utf8")) as Record<string, any>
  } catch {
    return null
  }
}

const manager = (root: string) =>
  existsSync(join(root, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(join(root, "yarn.lock"))
      ? "yarn"
      : "npm"

/** what this repo can be told to do: git, and the scripts it declares that end */
export function actions(repo: string): Action[] {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const scripts = (read(join(root, "package.json"))?.scripts ?? {}) as Record<string, string>
  const run = manager(root)

  const project = Object.keys(scripts)
    .filter((name) => !OUTWARD.test(name) && !name.startsWith("pre"))
    .map((name) => ({
      id: `script:${name}`,
      label: name,
      note: scripts[name],
      kind: "project" as const,
      command: `${run} ${run === "npm" ? "run " : ""}${name}`,
      // a watcher never returns, so it is held rather than awaited
      long: FOREVER.test(name) || SERVES.test(scripts[name]),
    }))

  // the ones anybody reaches for first, then whatever else this repo declares
  const first = ["format", "lint", "check", "typecheck", "test", "build"]
  const rank = (one: Action) => {
    const at = first.findIndex((name) => one.label === name)
    return at === -1 ? first.length : at
  }
  return [...GIT, ...project.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))]
}

const LIMIT = 10 * 60_000

/** by id, so the only commands that ever run are the ones listed above */
export function act(repo: string, id: string): Promise<Run> {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const found = actions(repo).find((one) => one.id === id)
  if (!found) return Promise.reject(new Error(`no action called ${id}`))

  const [file, ...rest] = found.command.split(" ")
  const started = Date.now()
  return new Promise((resolve) => {
    execFile(file, rest, { cwd: root, timeout: LIMIT, maxBuffer: 1 << 26 }, (err, out, bad) => {
      const output = `${out}${bad}`.trim()
      resolve({
        ok: !err,
        code: (err as { code?: number } | null)?.code ?? 0,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        output: output.length > 8000 ? `…\n${output.slice(-8000)}` : output || "(no output)",
      })
    })
  })
}

// what is up right now, so a tab that reloads still finds it
const held = new Map<string, { child: ReturnType<typeof spawn>; alive: Alive }>()
const KEEP = 64_000

// desprawl exits when the last tab closes, and it does not leave servers behind it
process.on("exit", () => {
  for (const one of held.values()) if (one.alive.running) signal(one.child, "SIGKILL")
})

/** started and left running, since a server has no end to wait for */
export function begin(repo: string, id: string): Alive {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const found = actions(repo).find((one) => one.id === id)
  if (!found) throw new Error(`no action called ${id}`)
  stop(id)

  const [file, ...rest] = found.command.split(" ")
  // its own group: a manager spawns the real server as a child, and signalling only the
  // manager leaves that child running and holding the port, which is not what stop means
  const child = spawn(file, rest, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    detached: true,
  })
  const alive: Alive = {
    id,
    command: found.command,
    since: Date.now(),
    output: "",
    running: true,
    code: null,
  }
  const take = (chunk: Buffer) => {
    alive.output = (alive.output + chunk.toString()).slice(-KEEP)
  }
  child.stdout?.on("data", take)
  child.stderr?.on("data", take)
  child.on("exit", (code) => {
    alive.running = false
    alive.code = code ?? 0
  })
  held.set(id, { child, alive })
  return alive
}

/** every process under one, since a manager puts its script in a group of its own */
function brood(pid: number): number[] {
  try {
    const seen = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter(([one, up]) => one && up)
    const found = [pid]
    for (let at = 0; at < found.length; at++)
      for (const [one, up] of seen) if (up === found[at] && !found.includes(one)) found.push(one)
    return found.reverse() // children before the parent that spawned them
  } catch {
    return [pid]
  }
}

const signal = (child: ReturnType<typeof spawn>, sign: NodeJS.Signals) => {
  if (!child.pid) return
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"])
    } catch {
      child.kill(sign)
    }
    return
  }
  // the group first, which is what a terminal interrupts, then anything that outlived it
  try {
    process.kill(-child.pid, sign)
  } catch {
    /* no group of its own */
  }
  for (const one of brood(child.pid)) {
    try {
      process.kill(one, sign)
    } catch {
      /* already gone */
    }
  }
}

/** the same interrupt a terminal sends, and a harder one if it is ignored */
export function stop(id: string): boolean {
  const one = held.get(id)
  if (!one || !one.alive.running) return false
  signal(one.child, "SIGINT")
  setTimeout(() => one.alive.running && signal(one.child, "SIGKILL"), 3_000)
  return true
}

export const alive = (): Alive[] => [...held.values()].map((one) => one.alive)
