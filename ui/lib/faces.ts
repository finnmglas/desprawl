// owner: finn
// goal: ask github once which email belongs to which face

import type { Stats } from "../../src/model.ts"

const PAGES = 3 // 300 commits is enough to name everyone who still shows in the table

/**
 * The commits endpoint is the only place that pairs a commit email with a github account,
 * and it needs no token for a public repo. A private one answers 404 and everybody keeps
 * their initials, which is why nothing here throws.
 */
export async function loadFaces(stats: Stats): Promise<Record<string, string>> {
  const remote = stats.remotes.find((r) => r.host === "github")
  if (!remote) return {}

  const key = `desprawl-faces-${remote.url}`
  const cached = localStorage.getItem(key)
  if (cached) return JSON.parse(cached) as Record<string, string>

  const [owner, repo] = new URL(remote.url).pathname.split("/").filter(Boolean)
  if (!owner || !repo) return {}

  const found: Record<string, string> = {}
  try {
    for (let page = 1; page <= PAGES; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100&page=${page}`,
      )
      if (!res.ok) break // private, rate limited or offline, initials are the answer
      const commits = (await res.json()) as {
        commit?: { author?: { email?: string } }
        author?: { avatar_url?: string }
      }[]
      for (const c of commits) {
        const email = c.commit?.author?.email?.toLowerCase()
        if (email && c.author?.avatar_url) found[email] = c.author.avatar_url
      }
      if (commits.length < 100) break
    }
  } catch {
    return found
  }

  localStorage.setItem(key, JSON.stringify(found))
  return found
}
