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
  choice === "auto" ? (globalThis.navigator?.language ?? EXPORT_LOCALE) : choice

export const stored = (): Choice =>
  (globalThis.localStorage?.getItem(KEY) as Choice | null) ?? "auto"

let active = ""

/** Read at format time, so a change repaints without threading a prop everywhere. */
export const locale = (): string => (active ||= resolve(stored()))

export function setLocale(choice: Choice): void {
  active = resolve(choice)
  globalThis.localStorage?.setItem(KEY, choice)
}
