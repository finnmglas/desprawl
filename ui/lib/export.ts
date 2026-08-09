// owner: finn
// goal: rows out, to clipboard or disk

export const delimit = (rows: (string | number)[][], sep: string): string =>
  rows
    .map((row) =>
      row
        .map((cell) =>
          sep === "," && /[",\n]/.test(String(cell))
            ? `"${String(cell).replaceAll('"', '""')}"`
            : cell,
        )
        .join(sep),
    )
    .join("\n")

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false // file:// without permission, caller tells the user
  }
}

export function download(name: string, text: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  // a megabyte is still streaming when click returns, and revoking under it
  // reads to the browser as a network error
  a.style.display = "none"
  document.body.append(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}
