// owner: finn
// goal: the log scale, in a file with no dom in it

import type { Curve } from "./display.tsx"

// log1p keeps zero at zero, a log axis would drop it
export const transform = (value: number, curve: Curve): number =>
  curve === "log" ? Math.log1p(value) : value

export const untransform = (value: number, curve: Curve): number =>
  curve === "log" ? Math.round(Math.expm1(value)) : value
