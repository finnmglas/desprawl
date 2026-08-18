// owner: finn
// goal: draw a screenful of rows rather than all of them, and keep the scroll honest

import { useEffect, useState, type RefObject } from "react"

// past this many rows a table draws a window of them rather than the lot
const WINDOW_FROM = 60

// rows either side of the window, so a fast scroll never shows a gap
const OVERSCAN = 6

interface What<T> {
  /** the table scrolls inside its own box, so a window is worth having */
  pinned: boolean
  /** how many rows the box holds at once */
  holds: number
  sheet: RefObject<HTMLDivElement | null>
  scroller: RefObject<HTMLDivElement | null>
  /** the rows as sorted, and the ones the fold leaves */
  sorted: T[]
  shown: T[]
  columns: { width?: number }[]
  /** what resets the scroll: a search, a sort, a different list */
  keyed: unknown[]
  open: boolean
  rows: T[]
  onEnd?: () => void
}

export function useWindowing<T>(what: What<T>) {
  const { pinned, holds, sheet, scroller, sorted, shown, columns, open, rows, onEnd } = what
  const [unit, setUnit] = useState(0)
  const [tall, setTall] = useState(0)
  const [scrolled, setScrolled] = useState(0)
  const [widths, setWidths] = useState<number[]>([])

  // one row is the unit, ten of it the box
  useEffect(() => {
    const box = scroller.current
    if (!pinned || !box) {
      setTall(0)
      return setUnit(0)
    }
    const head = box.querySelector("thead")
    const row = box.querySelector("tbody > tr[data-row]")
    if (!head || !row) return
    const one = row.getBoundingClientRect().height
    if (!one) return
    setUnit(one)
    setTall(Math.round(head.getBoundingClientRect().height + holds * one))
  }, [pinned, sorted.length, columns.length, open])

  // read on the first paint that has rows in it, then left alone: a table whose data has
  // not landed is as wide as its own headings, and freezing that overlaps every column
  useEffect(() => {
    const head = sheet.current?.querySelector("thead tr")
    if (!head || !rows.length || widths.length === columns.length) return
    const found = [...head.children].map(
      (th, i) => columns[i]?.width ?? Math.round(th.getBoundingClientRect().width),
    )
    if (found.every((n) => n > 0)) setWidths(found)
  }, [columns.length, widths.length, rows])

  // a row height is only known after a paint, and painting every row to learn it is the
  // cost this avoids, so a screenful stands in until then
  const windowed = pinned && shown.length > WINDOW_FROM
  const measured = windowed && unit > 0
  const first = measured ? Math.max(0, Math.floor(scrolled / unit) - OVERSCAN) : 0
  const last = measured
    ? Math.min(shown.length, Math.ceil((scrolled + tall) / unit) + OVERSCAN)
    : windowed
      ? Math.min(shown.length, WINDOW_FROM)
      : shown.length
  const slice = windowed ? shown.slice(first, last) : shown

  // read once a frame rather than per event
  useEffect(() => {
    const box = scroller.current
    if (!windowed || !box) return
    let queued = 0
    const onScroll = () => {
      if (queued) return
      queued = requestAnimationFrame(() => {
        queued = 0
        setScrolled(box.scrollTop)
        if (box.scrollTop + box.clientHeight >= box.scrollHeight - unit * 3) onEnd?.()
      })
    }
    box.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(queued)
      box.removeEventListener("scroll", onScroll)
    }
  }, [windowed, unit, onEnd])

  // never keyed on the rows array: callers rebuild it every render
  useEffect(() => {
    if (!windowed) return
    if (scroller.current) scroller.current.scrollTop = 0
    setScrolled(0)
  }, what.keyed)

  /** a marked row that was never built cannot be scrolled to, so it is put in view */
  const scrollTo = (i: number) => {
    const box = scroller.current
    if (i < 0 || !box) return
    box.scrollTop = Math.max(0, i * unit - tall / 2)
    setScrolled(box.scrollTop)
  }

  return { unit, tall, widths, windowed, measured, first, last, slice, scrollTo }
}
