// owner: finn
// goal: browser guess on date/num formats

export type Choice = "auto" | "en-US" | "de-DE"
export const CHOICES: Choice[] = ["auto", "en-US", "de-DE"]

/** Short labels, the resolved tag is shown as a hint instead. */
export const LABELS: Record<Choice, string> = { auto: "auto", "en-US": "en", "de-DE": "de" }

const KEY = "desprawl-locale"

// csv keeps a period decimal separator, a german comma would split the columns
export const EXPORT_LOCALE = "en-US"

const resolve = (choice: Choice): string =>
  choice === "auto" ? (navigator.language ?? EXPORT_LOCALE) : choice

export const stored = (): Choice => (localStorage.getItem(KEY) as Choice | null) ?? "auto"

let active = resolve(stored())

/** Read at format time, so a change repaints without threading a prop everywhere. */
export const locale = (): string => active

export function setLocale(choice: Choice): void {
  active = resolve(choice)
  localStorage.setItem(KEY, choice)
}
