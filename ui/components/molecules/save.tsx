// owner: finn
// goal: one panel out, as data or as a picture

import { Download } from "../atoms/icons.tsx"
import { Menu, MenuItem } from "./menu.tsx"
import { toast } from "../atoms/toast.tsx"
import { FORMATS, type Matrix } from "../../lib/formats.ts"
import { download, named } from "../../lib/export.ts"
import { toSvg } from "html-to-image"
import { shoot } from "../../lib/paper.ts"

const PAD = 24

/** an even margin, since an element is captured at exactly its own edges */
function padded(from: HTMLCanvasElement, paint: string): HTMLCanvasElement {
  const out = document.createElement("canvas")
  const edge = PAD * 2
  out.width = from.width + edge * 2
  out.height = from.height + edge * 2
  const pen = out.getContext("2d")
  if (!pen) return from
  pen.fillStyle = paint
  pen.fillRect(0, 0, out.width, out.height)
  pen.drawImage(from, edge, edge)
  return out
}

/** a canvas is already pixels, anything else has to be painted first */
async function pixels(node: HTMLElement, paint: string) {
  const own = node.querySelector("canvas")
  const drawn = own instanceof HTMLCanvasElement && !node.querySelector("table")
  return padded(drawn ? own : await shoot(node, paint), paint)
}

/** genuinely vectors: every node holds svg icons, and the first was once the whole export */
/** a chart is already vectors. The rest is html in a foreignObject with every computed
 * style written on, since an svg carries no stylesheet */
async function vectors(node: HTMLElement, paint: string): Promise<string> {
  const chart = node.querySelector("svg.recharts-surface")
  if (chart) {
    const copy = chart.cloneNode(true) as SVGElement
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    return new XMLSerializer().serializeToString(copy)
  }
  // laid out alone, flex-1 and max-w mean nothing and it spreads, so it is pinned to the
  // size it had on screen. No padding: a margin moved frame and content apart again
  const box = node.getBoundingClientRect()
  const wide = Math.ceil(box.width)
  const tall = Math.ceil(box.height)
  const url = await toSvg(node, {
    backgroundColor: paint,
    pixelRatio: 1,
    width: wide,
    height: tall,
    style: { margin: "0", maxWidth: "none", maxHeight: "none", flex: "none" },
  })
  return decodeURIComponent(url.slice("data:image/svg+xml;charset=utf-8,".length))
}

/** one more table that comes off the same panel, so two panels do not need two buttons */
export interface Sheet {
  name: string
  label: string
  note?: string
  rows: () => Matrix
}

export function Save({
  name,
  rows,
  picture,
  note,
  extra,
  children,
  className,
}: {
  /** the file, without an extension: each format adds its own */
  name: string
  /** lazy, since a large table is only built on the click that asks for it */
  rows?: () => Matrix
  /** the drawing this panel holds, when it holds one */
  picture?: () => HTMLElement | null
  note?: string
  extra?: Sheet[]
  /** anything the panel wants to offer beside the formats, like a grain */
  children?: React.ReactNode
  className?: string
}) {
  const paint = () => getComputedStyle(document.body).backgroundColor || "#ffffff"

  // the wall inside a picture, when it is narrower than the room it sits in
  const drawing = () => {
    const node = picture?.()
    return node?.querySelector<HTMLElement>("[data-picture]") ?? node ?? null
  }

  const image = async (kind: "png" | "jpeg" | "webp") => {
    const node = drawing()
    if (!node) return
    try {
      const canvas = await pixels(node, paint())
      const ext = { jpeg: "jpg", png: "png", webp: "webp" }[kind]
      const file = named(`${name}.${ext}`)
      canvas.toBlob(
        (blob) => blob && download(file, blob),
        `image/${kind}`,
        kind === "png" ? undefined : 0.92,
      )
      toast(file, `${canvas.width} by ${canvas.height}`)
    } catch (err) {
      toast("Could not draw it", String(err))
    }
  }

  const vector = async () => {
    const node = drawing()
    if (!node) return
    try {
      const file = named(`${name}.svg`)
      download(file, await vectors(node, paint()), "image/svg+xml")
      toast(file, "vectors, so it scales to any size")
    } catch (err) {
      toast("Could not draw it", String(err))
    }
  }

  const Line = ({ label, ext, onClick }: { label: string; ext: string; onClick: () => void }) => (
    <MenuItem onClick={onClick}>
      <Download />
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground text-[10px]">.{ext}</span>
    </MenuItem>
  )

  return (
    <Menu className={className} title="Save this panel" trigger={<Download />}>
      <p className="text-muted-foreground px-2 py-1.5 text-xs">{note ?? `Save ${name}`}</p>
      {rows &&
        FORMATS.map((format) => (
          <Line
            key={format.key}
            label={format.label}
            ext={format.ext}
            onClick={() => {
              const made = rows()
              const file = named(`${name}.${format.ext}`)
              download(file, format.of(made, name), format.mime)
              toast(file, `${made.length - 1} rows · ${format.hint}`)
            }}
          />
        ))}
      {rows && picture && <div className="bg-border my-1 h-px" />}
      {picture && (
        <>
          <Line label="PNG" ext="png" onClick={() => void image("png")} />
          <Line label="JPEG" ext="jpg" onClick={() => void image("jpeg")} />
          <Line label="WebP" ext="webp" onClick={() => void image("webp")} />
          <Line label="SVG" ext="svg" onClick={() => void vector()} />
        </>
      )}
      {extra?.map((sheet) => (
        <div key={sheet.name}>
          <div className="bg-border my-1 h-px" />
          <p className="text-muted-foreground px-2 py-1.5 text-xs">{sheet.note ?? sheet.label}</p>
          {FORMATS.map((format) => (
            <Line
              key={format.key}
              label={`${sheet.label}, ${format.label}`}
              ext={format.ext}
              onClick={() => {
                const made = sheet.rows()
                const file = named(`${sheet.name}.${format.ext}`)
                download(file, format.of(made, sheet.name), format.mime)
                toast(file, `${made.length - 1} rows · ${format.hint}`)
              }}
            />
          ))}
        </div>
      ))}
      {children && <div className="bg-border my-1 h-px" />}
      {children}
    </Menu>
  )
}
