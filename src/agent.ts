// owner: finn
// goal: hand one task to an agent cli already installed here

import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { begin, type Alive } from "./actions.ts"

export interface Install {
  /** the only thing a request may name */
  id: string
  label: string
  /** which cli: they take different flags and models */
  tool: string
  /** found on this machine, never typed */
  bin: string
  models: string[]
  /** its own words for the leashes it takes */
  trusts: string[]
  /** the account it bills */
  who: string
  /** the config dir, which decides the account */
  config?: string
}

export interface Mode {
  id: string
  label: string
  note: string
  /** why it cannot be offered, known before trying */
  blocked?: string
}

export interface Agent {
  /** what the first one answered */
  version: string
  modes: Mode[]
  /** every cli here, billing different accounts */
  installs: Install[]
}

const last = (path: string) => path.split(/[\\/]/).pop() ?? path

/** what a cli wrote down about its account, or nothing */
const signedIn = (path: string, take: (held: any) => string | undefined) => {
  try {
    return take(JSON.parse(readFileSync(path, "utf8"))) ?? ""
  } catch {
    return ""
  }
}

/** a jwt's middle part is the claims */
const claims = (token: string) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      email?: string
    }
  } catch {
    return {}
  }
}

/** claude's flags are measured here. Codex's are read off its docs and never run */
interface Tool {
  id: string
  /** the name it installs as, and a wrapper's prefix */
  name: string
  /** aliases, not ids: the cli resolves them */
  models: string[]
  /** the env var pointing at an account */
  home?: string
  /** every leash, and the two auto picks between */
  trust: string[]
  reads: string
  writes: string
  /** who a config dir is signed in as */
  who: (config?: string) => string
  /** no two spell "do this and stop" alike */
  argv: (bin: string, prompt: string, model: string, trust: string) => string[]
  /** the same run, narrated, and resumable */
  watch?: (bin: string, prompt: string, model: string, trust: string, session: string) => string[]
}

const TOOLS: Tool[] = [
  {
    id: "claude",
    name: "claude",
    models: ["opus", "sonnet", "fable"],
    home: "CLAUDE_CONFIG_DIR",
    trust: ["acceptEdits", "bypassPermissions", "plan", "default"],
    // in the config dir, except the default one, a level up
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
    // one json object per line, the only way to watch it work. --resume continues it
    watch: (bin, prompt, model, trust, session) => [
      bin,
      "-p",
      prompt,
      "--model",
      model,
      "--permission-mode",
      trust,
      "--output-format",
      "stream-json",
      "--verbose",
      ...(session ? ["--resume", session] : []),
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

/** auto: plan reads, the rest write */
const trustOf = (tool: Tool, mode: string, said: string) =>
  said && said !== "auto" && tool.trust.includes(said)
    ? said
    : mode === "plan"
      ? tool.reads
      : tool.writes

// on the commit, and neither is a person
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
      // npm installs a .cmd on windows, and only a shell runs one
      shell: WINDOWS,
    }).trim()
  } catch {
    return ""
  }
}

/** every one on the path, however this machine spells it */
const onPath = (name: string): string[] => {
  const found = ran(WINDOWS ? "where" : "which", ...(WINDOWS ? [] : ["-a"]), name)
    .split("\n")
    .map((one) => one.trim())
    .filter(Boolean)
  const first = found[0]
  if (!first) return []
  // a wrapper sits beside what it wraps
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

/** a config dir is an account */
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

/** what can be run and against which account. A request names an id, and it must be one of these */
export function installs(): Install[] {
  return TOOLS.flatMap((tool) => {
    const bins = onPath(tool.name)
    if (!bins.length) return []
    const [plain] = bins
    const of = (bin: string, name: string, config?: string, who = tool.who(config)) => ({
      id: config ? `${bin} ${config}` : bin,
      // the account tells five claudes apart
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
      // a wrapper sets its own config dir, named after it. The same plain binary on a
      // second PATH entry is not a wrapper
      ...bins
        .slice(1)
        .filter((bin) => last(bin) !== tool.name)
        .map((bin) => of(bin, last(bin), undefined, tool.who(join(homedir(), `.${last(bin)}`)))),
      // the plain one's own dir is not a second entry
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

/** whatever github already takes here, cheapest first. The helper is what vs code installs */
export function ticket(repo?: string): { how: string; token?: string } | null {
  const held = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (held) return { how: "the token in this environment" }
  if (ran("gh", "auth", "status")) return { how: "the gh cli login" }
  try {
    // never interactive: git would sit asking a terminal nobody has
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
    // nothing answered
  }
  return null
}

/** whether there is any cli here at all */
export function agent(repo?: string): Agent | null {
  const here = installs()
  if (!here.length) return null
  const version = ran(here[0].bin, "--version")
  if (!version) return null
  // a pr needs a remote and a token, and finding out mid run is too late
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

/** a branch named after the task */
const branchOf = (id: string) =>
  `desprawl/${id
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40)}`

// an agent that opens with a paragraph about what it will do has wasted the answer
const VOICE = [
  "Answer the way a colleague would in chat: short, direct, the outcome first.",
  "No preamble, no restating what was asked, no summary of what you just did.",
]

/** a question, read off the words: nobody should have to say which it was */
const asking = (said: string) =>
  /\?\s*$/.test(said.trim()) ||
  /^(what|which|who|whom|whose|where|when|why|how|is|are|was|were|do|does|did|can|could|should|would|will|has|have|any|list|show|tell|explain|count|find out)\b/i.test(
    said.trim(),
  )

/** the whole of what it is told, which is shown before it is sent */
export function ask(
  task: string,
  why: string,
  where: string,
  extra: string,
  mode = "unstaged",
  id = "task",
  /** typed by hand, so it may be a question */
  loose = false,
): string {
  // a question gets an answer, whatever the mode says
  if (loose && asking(task))
    return [
      `Answer this question about the repository you are in: ${task}`,
      extra.trim() && `Also: ${extra.trim()}`,
      "Read whatever you need to. Change no file, and do not commit or push anything.",
      ...VOICE,
    ]
      .filter(Boolean)
      .join("\n")

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
    !loose && `Why it was raised: ${why}`,
    !loose && where && where !== "." && `Where it is: ${where}`,
    extra.trim() && `Extra instructions from the person asking: ${extra.trim()}`,
    "Follow the repository's own conventions.",
    ...ending,
    ...VOICE,
  ]
    .filter(Boolean)
    .join("\n")
}

/** decided and refused here, so nothing spawns to find out */
export interface Sent {
  argv: string[]
  env: Record<string, string>
  tool: string
  /** whether it narrates itself as json */
  streams: boolean
}

export function plan(
  repo: string,
  prompt: string,
  model: string,
  mode: string,
  install = "",
  trust = "auto",
  session = "",
): Sent {
  const here = agent(repo)
  // the path comes from this machine's list, never the request
  const which = here?.installs.find((one) => one.id === install) ?? here?.installs[0]
  if (!which) throw new Error("no agent cli on this machine, so there is nothing to ask")
  const found = here?.modes.find((one) => one.id === mode)
  if (!found) throw new Error(`no mode called ${mode}`)
  if (found.blocked) throw new Error(found.blocked)
  if (!which.models.includes(model)) throw new Error(`${which.tool} has no model called ${model}`)
  const tool = TOOLS.find((one) => one.id === which.tool)!
  const leash = trustOf(tool, mode, trust)
  // handed on in the child's environment, nowhere it could be read back
  const signed = mode === "pr" ? ticket(repo) : null
  return {
    argv: tool.watch
      ? tool.watch(which.bin, prompt, model, leash, session)
      : tool.argv(which.bin, prompt, model, leash),
    env: {
      ...(signed?.token ? { GH_TOKEN: signed.token } : {}),
      ...(which.config && tool.home ? { [tool.home]: which.config } : {}),
    },
    tool: which.tool,
    streams: !!tool.watch,
  }
}

/** started and watched like any other long thing */
export function fix(
  repo: string,
  id: string,
  prompt: string,
  model: string,
  mode: string,
  install = "",
  trust = "auto",
): Alive {
  const sent = plan(repo, prompt, model, mode, install, trust)
  return begin(repo, `fix:${id}`, sent.argv, sent.env)
}
