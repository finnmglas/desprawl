// owner: finn
// goal: the handful of commands a reader would otherwise switch to a terminal for

import { execFile, execFileSync, spawn } from "node:child_process"
import { join } from "node:path"
import { reading } from "./graph.ts"
import { git } from "./model.ts"
import { manager, settle, type Run } from "./tests.ts"

export interface Action {
  id: string
  label: string
  note: string
  kind: "git" | "project"
  /** shown so nobody presses a button without knowing what it runs */
  command: string
  /** leaves this machine, so it is asked about rather than just run */
  outward?: boolean
  /** started and stopped rather than waited for */
  long?: boolean
  /** why it cannot work here, which is only ever said when it is certain */
  blocked?: string
  /** it may well not work, and why */
  caution?: string
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

// never ending, so a button would sit on them
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

/** the owner, whichever way a remote is written */
const ownerOf = (url: string) => url.trim().match(/[:/]([^/:]+)\/[^/]+?(?:\.git)?$/)?.[1] ?? ""

/** the reflog of the one ref a push would move */
function everPushed(root: string, upstream: string): boolean {
  try {
    return git(root, "reflog", "show", `refs/remotes/${upstream}`).includes("update by push")
  } catch {
    // no reflog for it, which is the same answer as never
    return false
  }
}

/** what a person is known by, so a one letter owner cannot match by accident */
const namesOf = (who: string) =>
  new Set(
    who
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )

/** neither is proof, so unclear is said rather than blocked */
function pushable(root: string): Pick<Action, "blocked" | "caution"> {
  const remote = (() => {
    try {
      return git(root, "remote").split("\n")[0]?.trim() ?? ""
    } catch {
      return ""
    }
  })()
  if (!remote) return { blocked: "this repo has no remote, so there is nowhere to push it" }
  let url = ""
  let upstream = ""
  try {
    url = git(root, "remote", "get-url", remote).trim()
  } catch {
    // a remote without a url is not one to push to
  }
  try {
    upstream = git(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}").trim()
  } catch {
    // no upstream, which `git push` on its own cannot invent
  }
  if (!upstream)
    return {
      blocked: `this branch tracks nothing, so plain \`git push\` has no ${remote} branch to send it to`,
    }
  if (everPushed(root, upstream)) return {}
  const owner = ownerOf(url).toLowerCase()
  // the configured identity, or failing that whoever the last commit says wrote it
  const named = `${git(root, "config", "user.name")} ${git(root, "config", "user.email")}`.trim()
  const me = namesOf(named || git(root, "log", "-1", "--format=%an %ae"))
  // a whole word, or a long enough piece: finnmglas is in finn@finnmglas.com
  if (owner && (me.has(owner) || (owner.length >= 4 && [...me].some((w) => w.includes(owner)))))
    return {}
  return {
    caution: `nothing has ever been pushed from this clone, and ${owner || url} is not a name on its commits. If it is somebody else's repo, fork it first`,
  }
}

/** what this repo can be told to do: git, and the scripts it declares that end */
export function actions(repo: string): Action[] {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const scripts = (reading(join(root, "package.json"))?.scripts ?? {}) as Record<string, string>
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
  const said = pushable(root)
  const listed = GIT.map((one) => (one.id === "push" ? { ...one, ...said } : one))
  return [...listed, ...project.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))]
}

const LIMIT = 10 * 60_000

/** by id, so the only commands that ever run are the ones listed above */
export function act(repo: string, id: string): Promise<Run> {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const found = actions(repo).find((one) => one.id === id)
  if (!found) return Promise.reject(new Error(`no action called ${id}`))
  if (found.blocked) return Promise.reject(new Error(found.blocked))

  const [file, ...rest] = found.command.split(" ")
  const started = Date.now()
  return new Promise((resolve) => {
    execFile(file, rest, { cwd: root, timeout: LIMIT, maxBuffer: 1 << 26 }, (err, out, bad) =>
      resolve(settle(err, out, bad, started, "(no output)")),
    )
  })
}

// so a tab that reloads still finds it
const held = new Map<string, { child: ReturnType<typeof spawn>; alive: Alive }>()
const KEEP = 64_000

// and it leaves no servers behind
process.on("exit", () => {
  for (const one of held.values()) if (one.alive.running) signal(one.child, "SIGKILL")
})

/** left running, since a server has no end to wait for */
export function begin(
  repo: string,
  id: string,
  given?: string[],
  /** the child's alone, for the one thing needing a credential */
  extra?: Record<string, string>,
  /** read as it arrives, for a child that narrates itself */
  onSay?: (chunk: string, done: number | null) => void,
): Alive {
  const root = git(repo, "rev-parse", "--show-toplevel").trim()
  const found = given ? { command: given.join(" ") } : actions(repo).find((one) => one.id === id)
  if (!found) throw new Error(`no action called ${id}`)
  stop(id)

  const [file, ...rest] = given ?? found.command.split(" ")
  // its own group, or the child keeps the port
  const child = spawn(file, rest, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0", ...extra },
    detached: true,
    // nothing here can type, and an open stdin makes a cli wait for input never coming
    stdio: given ? ["ignore", "pipe", "pipe"] : undefined,
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
    onSay?.(chunk.toString(), null)
  }
  child.stdout?.on("data", take)
  child.stderr?.on("data", take)
  // a missing binary emits error, never exit, and unhandled it kills the server
  child.on("error", (err) => {
    alive.running = false
    alive.code = -1
    alive.output = (alive.output + err.message).slice(-KEEP)
    onSay?.("", -1)
  })
  child.on("exit", (code) => {
    alive.running = false
    alive.code = code ?? 0
    onSay?.("", code ?? 0)
  })
  held.set(id, { child, alive })
  return alive
}

/** every process under one */
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
  // the group first, as a terminal does, then whatever outlived it
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

/** what a terminal sends, and harder if ignored */
export function stop(id: string): boolean {
  const one = held.get(id)
  if (!one || !one.alive.running) return false
  signal(one.child, "SIGINT")
  setTimeout(() => one.alive.running && signal(one.child, "SIGKILL"), 3_000)
  return true
}

export const alive = (): Alive[] => [...held.values()].map((one) => one.alive)

/** dropped once stopped: a running one is stopped rather than hidden */
export function forget(id: string): boolean {
  const one = held.get(id)
  if (!one || one.alive.running) return false
  held.delete(id)
  return true
}
