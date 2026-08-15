// owner: finn
// goal: what drawn view needs pre draw

export const PAINT = {
  down: "14, 165, 233", // sky, leans on a lower level
  loop: "245, 158, 11", // amber, inside a loop
  cut: "239, 68, 68", // red, the cut list names it
  quiet: "128, 128, 128", // itself, and the lines between levels
}

/** a node no colouring has an opinion about, neutral on purpose */
export const plain = (): string =>
  document.documentElement.classList.contains("dark") ? "235, 235, 238" : "24, 24, 27"

/** sized for the screen, capped at two: flat shapes gain nothing above it */
export function fit(board: HTMLCanvasElement, wide: number, tall: number) {
  const scale = Math.min(devicePixelRatio || 1, 2)
  board.width = wide * scale
  board.height = tall * scale
  board.style.width = `${wide}px`
  board.style.height = `${tall}px`
  const pen = board.getContext("2d")
  pen?.scale(scale, scale)
  return pen
}
