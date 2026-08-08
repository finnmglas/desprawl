// owner: finn
// goal: ask github once which email belongs to which face

import type { Stats } from "../../src/model.ts"

const PAGES = 3 // 300 commits is enough to name everyone who still shows in the table
const SEARCHES = 6 // the search api allows ten a minute unauthenticated, so stay well under
const KEY = "desprawl-faces"

// per email, not per repo, so a public repo teaches a private one
type Faces = Record<string, string>

const remember = (faces: Faces): void => localStorage.setItem(KEY, JSON.stringify(faces))
const recall = (): Faces => JSON.parse(localStorage.getItem(KEY) ?? "{}") as Faces

// commits names emails on public repos, search covers the rest, empty means asked and missing
export async function loadFaces(stats: Stats): Promise<Faces> {
  const faces = recall()
  const remote = stats.remotes.find((r) => r.host === "github")

  try {
    if (remote) {
      const [owner, repo] = new URL(remote.url).pathname.split("/").filter(Boolean)
      for (let page = 1; owner && repo && page <= PAGES; page++) {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100&page=${page}`,
        )
        if (!res.ok) break // private or rate limited, search still tries
        const commits = (await res.json()) as {
          commit?: { author?: { email?: string } }
          author?: { avatar_url?: string }
        }[]
        for (const c of commits) {
          const email = c.commit?.author?.email?.toLowerCase()
          if (email && c.author?.avatar_url) faces[email] = c.author.avatar_url
        }
        if (commits.length < 100) break
      }
    }

    // whoever the repo could not name
    const missing = stats.contributors
      .map((c) => c.email.toLowerCase())
      .filter((email) => faces[email] === undefined && !email.endsWith("users.noreply.github.com"))
      .slice(0, SEARCHES)

    for (const email of missing) {
      const res = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`,
      )
      if (!res.ok) break
      const found = (await res.json()) as { items?: { avatar_url?: string }[] }
      faces[email] = found.items?.[0]?.avatar_url ?? ""
    }
  } catch {
    return faces
  }

  remember(faces)
  return faces
}
