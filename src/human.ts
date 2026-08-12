// owner: finn
// goal: numbers the cli and the ui both have to agree on

const UNITS = ["", "k", "m", "b", "t"]

// digits 2: 1, 10, 0.1k, 1.0k, 10k, 0.1m
export function human(n: number, digits: number): string {
  const sign = n < 0 ? "-" : ""
  let v = Math.abs(n)
  let unit = 0
  while (v >= 10 ** digits && unit < UNITS.length - 1) {
    v /= 1000
    unit++
  }
  if (unit === 0) return sign + Math.round(v)
  const whole = Math.floor(v).toString().length
  return sign + v.toFixed(Math.max(0, digits - whole)) + UNITS[unit]
}

export const tokens = (chars: number): number => Math.round(chars / 4)

// what a disk says, so 1000 rather than 1024
export const weight = (bytes: number): string =>
  bytes < 1000
    ? `${bytes} B`
    : bytes < 1e6
      ? `${Math.round(bytes / 1000)} kB`
      : `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`

export const pct = (n: number, of: number): string =>
  of ? `${((n / of) * 100).toFixed(1)}%` : "0.0%"

// mean indentation of code lines
export const nest = (s: { code: number; indent: number }): string =>
  s.code ? (s.indent / s.code).toFixed(1) : "0.0"
