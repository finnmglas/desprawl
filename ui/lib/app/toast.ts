// owner: finn
// goal: raising a notice, from anywhere, without reaching up into the components

export interface Toast {
  id: number
  message: string
  detail?: string
  variant?: "default" | "error"
}

let seq = 0
let publish: ((notice: Toast) => void) | null = null

/** Fire a toast from anywhere. No-op until <Toaster /> is mounted. */
export const toast = (message: string, detail?: string, variant?: Toast["variant"]) =>
  publish?.({ id: ++seq, message, detail, variant })

/** the Toaster hands in where notices should land, and takes it back when it goes */
export function sink(into: ((notice: Toast) => void) | null): void {
  publish = into
}
