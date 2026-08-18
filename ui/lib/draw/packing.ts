// owner: finn
// goal: the room a box takes, and where its neighbours then sit

export const PAD = 14
export const GAP = 10
// room per node, which is what decides how big the box holding it has to be
export const ROW = 30
// a repo big enough to need fewer passes gets fewer, and the panel says it did
export const BUDGET = 900_000

export const rounded = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n)))

/** shelf packing: left to right, wrapping past the width given */
export function pack(sizes: { w: number; h: number }[], want: number) {
  const places: { x: number; y: number }[] = []
  let x = PAD
  let y = PAD
  let tall = 0
  let wide = 0
  for (const size of sizes) {
    if (x > PAD && x + size.w > want) {
      x = PAD
      y += tall + GAP
      tall = 0
    }
    places.push({ x, y })
    x += size.w + GAP
    tall = Math.max(tall, size.h)
    wide = Math.max(wide, x - GAP)
  }
  return { places, w: Math.max(wide + PAD, 2 * PAD), h: y + tall + PAD }
}
