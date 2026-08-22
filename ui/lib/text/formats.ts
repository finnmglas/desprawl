// owner: finn
// goal: one table, written the way whatever opens it next expects

/** a header row and the rows under it, which every panel can already produce */
export type Matrix = (string | number)[][]

export interface Format {
  key: string
  label: string
  ext: string
  mime: string
  hint: string
  of: (rows: Matrix, name: string) => string
}

const text = (cell: string | number) => (cell === undefined || cell === null ? "" : String(cell))

// what a sheet runs: an equals or an at whatever follows, a sign only where it goes on to
// build an expression, so a churn of -1.15m stays the text it was
const FORMULA = /^[=\t\r]|^@[\w.]*\(|^[+-][^\n]*[-+|(*/=]/

export const delimited = (rows: Matrix, by: string): string =>
  rows
    .map((row) =>
      row
        .map((cell) => {
          // a number is a number: only text a sheet would run is held back
          const one =
            typeof cell === "number"
              ? String(cell)
              : FORMULA.test(text(cell))
                ? `'${text(cell)}`
                : text(cell)
          return one.includes(by) || one.includes('"') || /[\n\r]/.test(one)
            ? `"${one.replaceAll('"', '""')}"`
            : one
        })
        .join(by),
    )
    .join("\n")

/** a number stays a number, and anything that would not read back as itself is text */
const typed = (cell: string | number): string | number => {
  if (typeof cell === "number") return cell
  const said = String(cell)
  // 1.10 is a version, 1e5 a name, 0x1f a colour, 0123 an id, " 12 " a column of one
  return said !== "" && Number.isFinite(Number(said)) && String(Number(said)) === said
    ? Number(said)
    : text(cell)
}

const objects = (rows: Matrix) => {
  const [head, ...rest] = rows
  return rest.map((row) => Object.fromEntries(head.map((key, i) => [text(key), typed(row[i])])))
}

const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
}

const quoted = (value: string | number) =>
  typeof value === "number"
    ? String(value)
    : `"${String(value).replace(/[\\"\n\r\t\b\f\u0000-\u001f]/g, (one) => ESCAPES[one] ?? `\\u${one.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`

const escaped = (one: string) =>
  one.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

export const FORMATS: Format[] = [
  {
    key: "csv",
    label: "CSV",
    ext: "csv",
    mime: "text/csv",
    hint: "commas, for a sheet or a script",
    of: (rows) => delimited(rows, ","),
  },
  {
    key: "tsv",
    label: "TSV",
    ext: "tsv",
    mime: "text/tab-separated-values",
    hint: "tabs, which paste straight into a sheet",
    of: (rows) => delimited(rows, "\t"),
  },
  {
    key: "json",
    label: "JSON",
    ext: "json",
    mime: "application/json",
    hint: "one object per row, keyed by the column",
    of: (rows) => JSON.stringify(objects(rows), null, 2),
  },
  {
    key: "toml",
    label: "TOML",
    ext: "toml",
    mime: "text/plain",
    hint: "a table of rows, for a config or a fixture",
    of: (rows, name) =>
      objects(rows)
        .map(
          (row) =>
            `[[${name.replace(/\W+/g, "_")}]]\n` +
            Object.entries(row)
              .map(([key, value]) => `${key.replace(/\W+/g, "_")} = ${quoted(value)}`)
              .join("\n"),
        )
        .join("\n\n"),
  },
  {
    key: "md",
    label: "Markdown",
    ext: "md",
    mime: "text/markdown",
    hint: "a table to paste into an issue or a doc",
    of: (rows, name) => {
      const [head, ...rest] = rows
      const wide = head.map((_, i) => Math.max(...rows.map((row) => text(row[i]).length)))
      const line = (row: Matrix[number]) =>
        `| ${row.map((cell, i) => text(cell).padEnd(wide[i])).join(" | ")} |`
      return [
        `## ${name}`,
        "",
        line(head),
        `| ${wide.map((n) => "-".repeat(n)).join(" | ")} |`,
        ...rest.map(line),
      ].join("\n")
    },
  },
  {
    key: "xls",
    label: "Excel",
    ext: "xls",
    mime: "application/vnd.ms-excel",
    hint: "opens in excel with the columns already typed",
    // a table excel reads as a sheet, which needs no library and no zip
    of: (rows, name) => {
      const [head, ...rest] = rows
      const cell = (one: string | number, tag = "td") =>
        typeof typed(one) === "number"
          ? `<${tag} x:num>${escaped(text(one))}</${tag}>`
          : `<${tag}>${escaped(text(one))}</${tag}>`
      return (
        `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">` +
        `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
        `<x:Name>${escaped(name).slice(0, 31)}</x:Name><x:WorksheetOptions><x:FreezePanes/>` +
        `<x:SplitHorizontal>1</x:SplitHorizontal><x:TopRowBottomPane>1</x:TopRowBottomPane>` +
        `</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->` +
        `</head><body><table><thead><tr>${head.map((one) => cell(one, "th")).join("")}</tr></thead>` +
        `<tbody>${rest.map((row) => `<tr>${row.map((one) => cell(one)).join("")}</tr>`).join("")}</tbody>` +
        `</table></body></html>`
      )
    },
  },
]
