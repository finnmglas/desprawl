// owner: finn
// goal: the page as it looks, as a pdf and as slides

import html2canvas from "html2canvas-pro"
import { jsPDF } from "jspdf"
import PptxGenJS from "pptxgenjs"

// pptxgenjs exports a umd namespace beside the class
interface Sheet {
  background: { color: string }
  addText: (text: string, options: Record<string, unknown>) => void
  addImage: (options: Record<string, unknown>) => void
  addShape: (kind: string, options: Record<string, unknown>) => void
}
interface Deck {
  layout: string
  title: string
  addSlide: () => Sheet
  writeFile: (options: { fileName: string }) => Promise<string>
}
const Made = PptxGenJS as unknown as new () => Deck

/** one tab, already on the page */
export interface Shot {
  title: string
  node: HTMLElement
}

/** what a panel says */
export interface Slide {
  title: string
  hint?: string
  lines: string[]
}

const SCALE = 2

/** the live element, painted, so it carries whatever theme is on screen */
export async function shoot(node: HTMLElement, paint: string): Promise<HTMLCanvasElement> {
  return html2canvas(node, {
    scale: SCALE,
    backgroundColor: paint,
    useCORS: true,
    logging: false,
    // navigation means nothing on paper
    ignoreElements: (el: Element) => (el as HTMLElement).dataset?.print === "hide",
    // the clone loses canvas pixels, so they are copied across
    onclone: (doc: Document) => {
      const from = node.querySelectorAll("canvas")
      const to = doc.querySelectorAll("canvas")
      from.forEach((source, i) => {
        const target = to[i]
        if (target instanceof HTMLCanvasElement && source instanceof HTMLCanvasElement)
          target.getContext("2d")?.drawImage(source, 0, 0)
      })
    },
  })
}

const paintOf = () =>
  getComputedStyle(document.body).backgroundColor || (dark() ? "#171717" : "#ffffff")

export const dark = () => document.documentElement.classList.contains("dark")

/** every tab, one page each, at its own aspect */
export async function pdf(shots: Shot[], name: string): Promise<void> {
  const paint = paintOf()
  let doc: jsPDF | null = null
  for (const shot of shots) {
    const canvas = await shoot(shot.node, paint)
    const [w, h] = [canvas.width / SCALE, canvas.height / SCALE]
    const page: [number, number] = [w, h]
    if (!doc) doc = new jsPDF({ unit: "px", format: page, orientation: w > h ? "l" : "p" })
    else doc.addPage(page, w > h ? "l" : "p")
    doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h)
  }
  doc?.save(name)
}

const INK = { line: "0EA5E9", note: "6B7280" }

/** every tab as a slide */
export async function pptx(shots: Shot[], repo: string, name: string): Promise<void> {
  const paint = paintOf()
  const deck = new Made()
  deck.layout = "LAYOUT_16x9"
  deck.title = repo
  const back = dark() ? "171717" : "FFFFFF"
  const text = dark() ? "F5F5F5" : "111827"

  const cover = deck.addSlide()
  cover.background = { color: back }
  cover.addText("desprawl", { x: 0.6, y: 2.1, w: 9, h: 0.9, fontSize: 44, bold: true, color: text })
  cover.addText(repo, { x: 0.6, y: 3.0, w: 9, h: 0.5, fontSize: 16, color: INK.note })
  cover.addShape("rect", { x: 0.6, y: 3.7, w: 1.6, h: 0.06, fill: { color: INK.line } })

  for (const shot of shots) {
    const canvas = await shoot(shot.node, paint)
    const slide = deck.addSlide()
    slide.background = { color: back }
    slide.addText(shot.title, {
      x: 0.4,
      y: 0.22,
      w: 9.2,
      h: 0.5,
      fontSize: 20,
      bold: true,
      color: text,
    })
    const room = { w: 9.0, h: 4.3 }
    const ratio = canvas.width / canvas.height
    const wide = Math.min(room.w, room.h * ratio)
    slide.addImage({
      data: canvas.toDataURL("image/jpeg", 0.92),
      x: (10 - wide) / 2,
      y: 0.95,
      w: wide,
      h: wide / ratio,
    })
  }
  await deck.writeFile({ fileName: name })
}

/** the same panels as words, to edit rather than look at */
export async function notes(made: Slide[], repo: string, name: string): Promise<void> {
  const deck = new Made()
  deck.layout = "LAYOUT_16x9"
  deck.title = repo
  for (const one of made) {
    const slide = deck.addSlide()
    slide.addText(one.title, { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true })
    if (one.hint)
      slide.addText(one.hint, { x: 0.5, y: 0.95, w: 9, h: 0.35, fontSize: 12, color: INK.note })
    slide.addText(one.lines.join("\n") || "nothing to show", {
      x: 0.5,
      y: one.hint ? 1.4 : 1.1,
      w: 9,
      h: 3.9,
      fontSize: 12,
      lineSpacingMultiple: 1.3,
    })
  }
  await deck.writeFile({ fileName: name })
}
