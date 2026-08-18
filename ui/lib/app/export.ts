// owner: finn
// goal: rows out, to clipboard or disk

let subject = "repo"
export const describes = (repo: string): void => {
  subject = repo.split("/").filter(Boolean).pop() || "repo"
}

/** 20260809-desprawl-languages.csv, so a downloads folder stays readable */
export function named(what: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  return `${stamp}-${subject}-${what}`
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false // file:// without permission, caller tells the user
  }
}

export function download(name: string, text: string | Blob, type = "text/csv"): void {
  const url = URL.createObjectURL(typeof text === "string" ? new Blob([text], { type }) : text)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  // revoking while it still streams reads as a network error
  a.style.display = "none"
  document.body.append(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}
