// owner: finn
// goal: hand one task to an agent cli already installed here

import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { begin, type Alive } from "./actions.ts"

export interface Install {
  /** what the panel sends back, and the only thing ever taken from a request */
  id: string
  label: string
  /** which cli this is, since they take different flags and different models */
  tool: string
  /** the file to run, found on this machine rather than typed by anybody */
  bin: string
  models: string[]
  /** what this cli calls the leashes it can be run on, in its own words */
  trusts: string[]
  /** the account it is signed in as, since one machine holds several and they bill apart */
  who: string
  /** the config dir to run it against, which is what decides the account it bills */
  config?: string
}

export interface Mode {
  id: string
  label: string
  note: string
  /** why it cannot be offered here, when something says so before it is tried */
  blocked?: string
}

export interface Agent {
  /** what the first one answered when asked, so the panel can name a version */
  version: string
  modes: Mode[]
  /** every agent cli here: one machine can hold several, billing different accounts */
  installs: Install[]
}

const last = (path: string) => path.split(/[\\/]/).pop() ?? path

/** whatever a cli wrote down about the account it is signed in as, or nothing */
const signedIn = (path: string, take: (held: any) => string | undefined) => {
  try {
    return take(JSON.parse(readFileSync(path, "utf8"))) ?? ""
  } catch {
    return ""
  }
}

/** a jwt is three parts and the middle one is the claims, one of which says who */
const claims = (token: string) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      email?: string
    }
  } catch {
    return {}
  }
}

/**
 * What each cli is called, what it answers to and how it is told to do one thing and stop.
 * Claude's half is measured: every flag here has been run on this machine. Codex's is read
 * off its own `exec` documentation and has never run here, so the first person with it
 * installed is the one who finds out, and its own error lands in the panel where it shows.
 */
interface Tool {
  id: string
  /** the plain name it installs as, and the prefix a wrapper around it would use */
  name: string
  /** aliases, not ids: a cli resolves an alias to whatever the latest of that model is */
  models: string[]
  /** the env var that points it at an account, when it has one */
  home?: string
  /** every leash it takes, its own spelling, and the two auto picks between */
  trust: string[]
  reads: string
  writes: string
  /** who a config dir is signed in as, read off whatever file that cli keeps it in */
  who: (config?: string) => string
  /** the whole command, since no two of these spell "do this and stop" the same way */
  argv: (bin: string, prompt: string, model: string, trust: string) => string[]
}

const TOOLS: Tool[] = [
  {
    id: "claude",
    name: "claude",
    models: ["opus", "sonnet", "fable"],
    home: "CLAUDE_CONFIG_DIR",
    trust: ["acceptEdits", "bypassPermissions", "plan", "default"],
    // inside the config dir, except for the default one, which keeps it a level up
    who: (config) => {
      const email = (held: any) => held.oauthAccount?.emailAddress
      const dir = config ?? process.env.CLAUDE_CONFIG_DIR ?? homedir()
      return signedIn(join(dir, ".claude.json"), email) || signedIn(`${dir}.json`, email)
    },
    reads: "plan",
    writes: "acceptEdits",
    argv: (bin, prompt, model, trust) => [
      bin,
      "-p",
      prompt,
      "--model",
      model,
      "--permission-mode",
      trust,
    ],
  },
  {
    id: "codex",
    name: "codex",
    models: ["gpt-5-codex", "gpt-5", "o4-mini"],
    home: "CODEX_HOME",
    trust: ["workspace-write", "danger-full-access", "read-only"],
    who: (config) =>
      signedIn(join(config ?? join(homedir(), ".codex"), "auth.json"), (held) =>
        held.tokens?.id_token ? claims(held.tokens.id_token).email : held.OPENAI_API_KEY && "a key",
      ),
    reads: "read-only",
    writes: "workspace-write",
    argv: (bin, prompt, model, trust) => [
      bin,
      "exec",
      "--model",
      model,
      "--sandbox",
      trust,
      prompt,
    ],
  },
]

/** auto is the mode deciding: planning reads, everything else writes as it goes */
const trustOf = (tool: Tool, mode: string, said: string) =>
  said && said !== "auto" && tool.trust.includes(said)
    ? said
    : mode === "plan"
      ? tool.reads
      : tool.writes

// whoever did the work goes on the commit, and neither of these two is a person
const CREW = [
  "Co-authored-by: Claude <noreply@anthropic.com>",
  "Co-authored-by: desprawl <desprawl@finnmglas.com>",
]

const COMMIT = [
  "Commit it with a conventional commit subject (`fix:`, `refactor:`, `chore:` and so on),",
  "concise and in the imperative. End the message with these trailers, exactly:",
  ...CREW,
]

const MODES: Omit<Mode, "blocked">[] = [
  {
    id: "unstaged",
    label: "fix it",
    note: "edits the files and leaves everything in the working tree for you to read",
  },
  {
    id: "local",
    label: "fix and commit",
    note: "a branch of its own, one conventional commit, co-authored, nothing pushed",
  },
  {
    id: "pr",
    label: "fix and open a pr",
    note: "the same branch and commit, then pushed and opened as a pull request",
  },
  {
    id: "plan",
    label: "plan only",
    note: "reads and says what it would do, and changes no file",
  },
]

const WINDOWS = process.platform === "win32"

const ran = (...args: string[]) => {
  try {
    return execFileSync(args[0], args.slice(1), {
      encoding: "utf8",
      timeout: 8000,
      stdio: "pipe",
      // a cli installed by npm is a .cmd on windows, and only a shell knows how to run one
      shell: WINDOWS,
    }).trim()
  } catch {
    return ""
  }
}

/** every one of these on the path, however this machine spells "look it up" */
const onPath = (name: string): string[] => {
  const found = ran(WINDOWS ? "where" : "which", ...(WINDOWS ? [] : ["-a"]), name)
    .split("\n")
    .map((one) => one.trim())
    .filter(Boolean)
  const first = found[0]
  if (!first) return []
  // a wrapper sits beside the thing it wraps: claude-private is next to claude
  const beside = (() => {
    try {
      return readdirSync(dirname(first))
        .filter(
          (one) => one.startsWith(`${name}-`) && /^[\w.-]+$/.test(one) && !one.endsWith(".py"),
        )
        .map((one) => join(dirname(first), one))
    } catch {
      return []
    }
  })()
  return [...new Set([...found, ...beside])]
}

/** a config dir is an account: ~/.claude bills one thing and ~/.claude-private another */
const profiles = (name: string): string[] => {
  try {
    return readdirSync(homedir())
      .filter(
        (one) =>
          one === `.${name}` ||
          one.startsWith(`.${name}-`) ||
          (/^\.\w+\d+$/.test(one) && one.startsWith(`.${name}`)),
      )
      .map((name) => join(homedir(), name))
      .filter((path) => {
        try {
          return statSync(path).isDirectory()
        } catch {
          return false
        }
      })
      .sort()
  } catch {
    return []
  }
}

/**
 * What can be run and against which account. A wrapper carries its own config dir, so it is
 * listed as it is; every other config dir is offered against the plain cli. Nothing here is
 * taken from a request: the panel sends back an id, and the id has to be one of these.
 */
export function installs(): Install[] {
  return TOOLS.flatMap((tool) => {
    const bins = onPath(tool.name)
    if (!bins.length) return []
    const [plain] = bins
    const of = (bin: string, name: string, config?: string, who = tool.who(config)) => ({
      id: config ? `${bin} ${config}` : bin,
      // the account is the label: five of these read as the same word otherwise
      label: who ? `${name}, ${who}` : name,
      tool: tool.id,
      bin,
      models: tool.models,
      trusts: tool.trust,
      who,
      config,
    })
    return [
      of(plain, tool.name),
      // a wrapper sets its own config dir, and the one it is named after is the one to read
      ...bins
        .slice(1)
        .map((bin) => of(bin, last(bin), undefined, tool.who(join(homedir(), `.${last(bin)}`)))),
      // the dir the plain one already uses is not a second thing to offer
      ...(tool.home
        ? profiles(tool.name)
            .filter(
              (config) => config !== (process.env[tool.home!] ?? join(homedir(), `.${tool.name}`)),
            )
            .map((config) => of(plain, `${tool.name}, ${last(config)}`, config))
        : []),
    ]
  })
}

/**
 * Whatever github will already take from this machine, asked for in the order that costs
 * least. The third is the useful one: a credential helper is what vs code installs when a
 * github account is connected to it, and `gh` takes that token as happily as its own login.
 */
export function ticket(repo?: string): { how: string; token?: string } | null {
  const held = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (held) return { how: "the token in this environment" }
  if (ran("gh", "auth", "status")) return { how: "the gh cli login" }
  try {
    // never interactive: with no helper to answer, git would sit asking a terminal nobody has
    const filled = execFileSync("git", ["credential", "fill"], {
      cwd: repo ?? process.cwd(),
      input: "protocol=https\nhost=github.com\n\n",
      encoding: "utf8",
      timeout: 5000,
      stdio: "pipe",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })
    const token = filled.match(/^password=(.+)$/m)?.[1]
    if (token) return { how: "the github account this machine is already signed in with", token }
  } catch {
    // nothing answered, which is the same as having nothing
  }
  return null
}

/** whether there is any agent cli here, since the button is worth nothing without one */
export function agent(repo?: string): Agent | null {
  const here = installs()
  if (!here.length) return null
  const version = ran(here[0].bin, "--version")
  if (!version) return null
  // a pull request needs somewhere to send it and something to send it with, and finding
  // that out when the agent is already half way through the work is finding out too late
  const gh = ran("gh", "--version")
  const signed = ticket(repo)
  const remote = repo ? ran("git", "-C", repo, "remote") : "yes"
  const why = !gh
    ? "gh is not on this machine, so there is nothing here to open a pull request with"
    : !signed
      ? "nothing here can prove who you are to github: sign in through vs code, run `gh auth login`, or set GH_TOKEN"
      : !remote
        ? "this repo has no remote, so there is nowhere to open one against"
        : ""
  return {
    version,
    installs: here,
    modes: MODES.map((mode) =>
      mode.id === "pr"
        ? why
          ? { ...mode, blocked: why }
          : { ...mode, note: `${mode.note}, using ${signed?.how}` }
        : mode,
    ),
  }
}

/** a branch named after the task, since a fix in its own branch is one to read on its own */
const branchOf = (id: string) =>
  `desprawl/${id
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40)}`

/** the whole of what it is told, which is shown before it is sent */
export function ask(
  task: string,
  why: string,
  where: string,
  extra: string,
  mode = "unstaged",
  id = "task",
): string {
  const ending =
    mode === "plan"
      ? ["Describe the change you would make, briefly. Change no file."]
      : mode === "unstaged"
        ? [
            "Leave every change in the working tree. Do not stage, commit or push anything:",
            "a person is going to read the diff.",
          ]
        : [
            `Work on a new branch called \`${branchOf(id)}\`, cut from the current one.`,
            ...COMMIT,
            mode === "pr"
              ? "Then push the branch and open a pull request with `gh pr create`, whose body says which desprawl task this was."
              : "Do not push it.",
          ]
  return [
    `In this repository, do the following task: ${task}`,
    `Why it was raised: ${why}`,
    `Where it is: ${where}`,
    extra.trim() && `Extra instructions from the person asking: ${extra.trim()}`,
    "Follow the repository's own conventions.",
    ...ending,
  ]
    .filter(Boolean)
    .join("\n")
}

/** started and watched like any other long thing here, so one panel stops it */
export function fix(
  repo: string,
  id: string,
  prompt: string,
  model: string,
  mode: string,
  install = "",
  trust = "auto",
): Alive {
  const here = agent(repo)
  const found = here?.modes.find((one) => one.id === mode)
  if (!found) throw new Error(`no mode called ${mode}`)
  if (found.blocked) throw new Error(found.blocked)
  // the path comes from the list this machine produced, never from the request
  const which = here?.installs.find((one) => one.id === install) ?? here?.installs[0]
  if (!which) throw new Error("no agent cli on this machine, so there is nothing to ask")
  if (!which.models.includes(model)) throw new Error(`${which.tool} has no model called ${model}`)
  const tool = TOOLS.find((one) => one.id === which.tool)!
  // a token read off a helper is handed on rather than asked for again, and never anywhere
  // it could be read back: it goes in the child's environment and nowhere else
  const signed = mode === "pr" ? ticket(repo) : null
  return begin(repo, `fix:${id}`, tool.argv(which.bin, prompt, model, trustOf(tool, mode, trust)), {
    ...(signed?.token ? { GH_TOKEN: signed.token } : {}),
    ...(which.config && tool.home ? { [tool.home]: which.config } : {}),
  })
}
