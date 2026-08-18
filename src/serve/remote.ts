// owner: finn
// goal: analyse a repo you do not have yet

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/** the forms people paste, with or without a scheme */
export const isUrl = (target: string): boolean =>
  /^(https?|git|ssh):\/\//.test(target) ||
  /^[\w.-]+@[\w.-]+:/.test(target) ||
  // github.com/owner/repo, or owner/repo, but never something that is a folder here
  (/^[\w.-]+\/[\w.-]+(\/[\w.-]+)*$/.test(target) &&
    !/^[.~]|^\w:[\\/]/.test(target) &&
    !existsSync(target))

/** a bare host or a bare owner needs the rest spelled out before git sees it */
const full = (url: string): string =>
  /^(https?|git|ssh):\/\/|^[\w.-]+@/.test(url)
    ? url
    : url.split("/")[0].includes(".")
      ? `https://${url}`
      : `https://github.com/${url}`

// where each platform keeps downloads, the linux one is the user's to move
function downloads(): string {
  const home = homedir()
  if (process.platform === "linux") {
    try {
      const dirs = readFileSync(join(home, ".config", "user-dirs.dirs"), "utf8")
      const found = dirs.match(/XDG_DOWNLOAD_DIR="(.+)"/)?.[1]
      if (found) return found.replace("$HOME", home)
    } catch {
      // no user-dirs file, fall through to the usual name
    }
  }
  return join(process.env.USERPROFILE ?? home, "Downloads")
}

// windows nfs compatible
const plain = (part: string): string => part.replace(/[<>:"|?*\\]/g, "-").replace(/\.+$/, "")

/** host and path both, so two repos of one name do not land on each other */
function place(url: string): string {
  const clean = url
    .replace(/[?#].*$/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
  const parts =
    clean.match(/^\w+:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/) ?? clean.match(/^[^@]+@([^:]+):(.+)$/)
  const [host, path] = parts ? [parts[1], parts[2]] : ["repo", clean.replace(/\W+/g, "-")]
  // a port belongs to the url, not to where the copy lives
  return join(downloads(), "desprawl", plain(host.split(":")[0]), ...path.split("/").map(plain))
}

/** clone it, or bring the copy we have up to date */
export function local(asked: string): string {
  const url = full(asked)
  const dir = place(url)
  // git's own progress, a big clone is worth watching
  const git = (...args: string[]) => execFileSync("git", args, { stdio: "inherit" })

  if (existsSync(join(dir, ".git"))) {
    console.log(`Updating ${dir}\n`)
    try {
      git("-C", dir, "pull", "--ff-only")
    } catch {
      console.log("\nCould not fast forward, reading the copy as it stands")
    }
  } else {
    console.log(`Cloning ${url}\ninto ${dir}\n`)
    mkdirSync(dirname(dir), { recursive: true })
    const half = `${dir}.part`
    rmSync(half, { recursive: true, force: true })
    git("clone", url, half)
    renameSync(half, dir)
  }
  console.log()
  return dir
}
