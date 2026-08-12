// owner: finn
// goal: hand one task to the claude already installed here

import { execFileSync } from "node:child_process"
import { begin, type Alive } from "./actions.ts"

export interface Mode {
  id: string
  label: string
  note: string
  /** what claude is allowed to do while it works */
  permission: string
  /** why it cannot be offered here, when something says so before it is tried */
  blocked?: string
}

export interface Agent {
  /** the cli is on this machine, and what it answered when asked */
  version: string
  models: string[]
  modes: Mode[]
}

// aliases rather than ids: the cli resolves an alias to whatever the latest of that model is
const MODELS = ["opus", "sonnet", "fable"]

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
    permission: "acceptEdits",
  },
  {
    id: "local",
    label: "fix and commit",
    note: "a branch of its own, one conventional commit, co-authored, nothing pushed",
    permission: "acceptEdits",
  },
  {
    id: "pr",
    label: "fix and open a pr",
    note: "the same branch and commit, then pushed and opened as a pull request",
    permission: "acceptEdits",
  },
  {
    id: "plan",
    label: "plan only",
    note: "reads and says what it would do, and changes no file",
    permission: "plan",
  },
]

const ran = (...args: string[]) => {
  try {
    return execFileSync(args[0], args.slice(1), {
      encoding: "utf8",
      timeout: 8000,
      stdio: "pipe",
    }).trim()
  } catch {
    return ""
  }
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

/** whether there is a claude here at all, since the button is worth nothing without one */
export function agent(repo?: string): Agent | null {
  const version = ran("claude", "--version")
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
    models: MODELS,
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
export function fix(repo: string, id: string, prompt: string, model: string, mode: string): Alive {
  if (!MODELS.includes(model)) throw new Error(`no model called ${model}`)
  const found = agent(repo)?.modes.find((one) => one.id === mode)
  if (!found) throw new Error(`no mode called ${mode}`)
  if (found.blocked) throw new Error(found.blocked)
  // a token read off a helper is handed on rather than asked for again, and never anywhere
  // it could be read back: it goes in the child's environment and nowhere else
  const signed = mode === "pr" ? ticket(repo) : null
  return begin(
    repo,
    `fix:${id}`,
    ["claude", "-p", prompt, "--model", model, "--permission-mode", found.permission],
    signed?.token ? { GH_TOKEN: signed.token } : undefined,
  )
}
