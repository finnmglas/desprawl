// owner: finn
// goal: the ui rules that decide what a number means and where a line is drawn

import assert from "node:assert/strict"
import { test } from "node:test"
import { analyze } from "../src/analyze.ts"
import { human } from "../src/human.ts"
import { place } from "../ui/lib/lanes.ts"
import { effective, shares } from "../ui/lib/scale.ts"
import { bucket, defaultGrain } from "../ui/lib/format.ts"
import { expand, rows } from "../ui/lib/series.ts"
import { isId, nameOf, namesOf } from "../ui/lib/naming.ts"
import { FORMATS } from "../ui/lib/formats.ts"
import { shapeOf } from "../ui/lib/verdict.ts"
import { repo } from "./repo.ts"

const loc = { key: "code", num: true, get: (r: { code: number }) => r.code }
const rowsOf = [{ code: 10 }, { code: 40 }, { code: 50 }]

test("only the two share modes turn a count into a percentage", () => {
  assert.equal(shares(loc, "abs"), false)
  assert.equal(shares(loc, "simple"), false, "adding a mode must not make everything a share")
  assert.equal(shares(loc, "repo"), true)
  assert.equal(shares({ ...loc, ofRow: () => 100 }, "row"), true)
  assert.equal(shares(loc, "row"), false, "no denominator, no share")
})

test("an absolute cell stays a number, so a column can have a peak", () => {
  // the backdrop bars measure against this, and vanish if it is not a number
  let peak = 0
  for (const row of rowsOf) {
    const at = effective(loc, row, "abs", {})
    if (typeof at === "number" && at > peak) peak = at
  }
  assert.equal(peak, 50)
})

test("a share is the row against its denominator", () => {
  assert.equal(effective(loc, { code: 25 }, "repo", { code: 100 }), 0.25)
  assert.equal(effective(loc, { code: 25 }, "repo", { code: 0 }), 0, "never divide by nothing")
})

test("a straight line of commits uses one lane", () => {
  const log = [
    { hash: "c", parents: ["b"] },
    { hash: "b", parents: ["a"] },
    { hash: "a", parents: [] },
  ] as Parameters<typeof place>[0]
  const placed = place(log)
  assert.deepEqual(
    placed.map((p) => p.lane),
    [0, 0, 0],
  )
})

test("a lane is freed once its child is drawn, so branches do not pile up", () => {
  // two branches off one root, merged at the top
  const log = [
    { hash: "m", parents: ["x", "y"] },
    { hash: "x", parents: ["r"] },
    { hash: "y", parents: ["r"] },
    { hash: "r", parents: [] },
  ] as Parameters<typeof place>[0]
  const placed = place(log)
  const widest = Math.max(
    ...placed.map((p) => Math.max(p.lane, ...p.active, ...p.edges.map((e) => e.to))),
  )
  assert.ok(widest <= 1, `two branches took ${widest + 1} lanes`)
  for (const row of placed) {
    for (const edge of row.edges) assert.ok(edge.to >= 0, "an edge pointed nowhere")
  }
})

test("the size series stays empty until the samples arrive", () => {
  const stats = analyze(repo({ "a.ts": "x\n" }, { "a.ts": "x\ny\n" }))
  const filled = (out: Record<string, unknown>[]) =>
    out.filter((d) => typeof d.size === "number").length
  assert.equal(filled(rows(stats, expand(["size"]), "day", "linear", null)), 0)
  const samples = [{ date: stats.first.slice(0, 10), bytes: 10 }]
  assert.ok(filled(rows(stats, expand(["size"]), "day", "linear", null, samples)) > 0)
})

test("days become weeks and months as a repo ages", () => {
  // prettier-ignore
  const spans: [string, string][] = [["2026-01-05", "day"], ["2026-06-01", "week"], ["2046-01-01", "month"]]
  for (const [last, grain] of spans) assert.equal(defaultGrain("2026-01-01", last), grain, last)
})

test("bucketing keeps every value, it only regroups them", () => {
  const daily = [1, 2, 3, 4, 5, 6, 7, 8]
  const sum = (out: [string, number][]) => out.reduce((a, [, n]) => a + n, 0)
  assert.equal(sum(bucket(daily, "2026-01-01", "week")), 36)
  assert.equal(sum(bucket(daily, "2026-01-01", "month")), 36)
})

test("the number ladder shortens without lying about magnitude", () => {
  // prettier-ignore
  const ladder: [number, string][] = [[1, "1"], [999, "999"], [1000, "1.00k"], [1_500_000, "1.50m"], [-2500, "-2.50k"]]
  for (const [n, shown] of ladder) assert.equal(human(n, 3), shown, String(n))
})

test("a group is placed by which way its edges lean, not by how often one is repeated", () => {
  const shape = (inside: number, out: number, into: number, reach = 2) =>
    shapeOf(inside, out, into, reach).label
  assert.equal(shape(0, 22, 0), "Entrypoint", "nothing imports it")
  assert.equal(shape(1, 109, 4), "Entrypoint*", "4% arriving")
  assert.equal(shape(15, 98, 32), "Collection", "25% arriving")
  assert.equal(shape(32, 30, 25), "Shared*", "45% arriving is neither")
  assert.equal(shape(13, 12, 120), "Shared", "91% arriving")
  assert.equal(shape(35, 0, 54), "Module", "every import stays inside")

  // 402 icon files each importing the same one utility is not breadth
  assert.equal(shape(401, 399, 2, 1), "Module*", "a leaf leaning on one group")
  assert.equal(
    shape(401, 399, 2, 6),
    "Entrypoint*",
    "the same numbers spread over six groups are not",
  )
  assert.equal(
    shape(1, 9, 0, 1),
    "Entrypoint",
    "a route folder keeps nothing inside, so it stays a top",
  )
  assert.equal(shape(24, 7, 1963, 1), "Shared", "what everything stands on is never a leaf")
})

test("a group is named the way a person would say it, not the way it is typed", () => {
  const name = (path: string, folders = 0) => nameOf(path, folders)
  assert.equal(name("src/lib"), "Source library", "an abbreviation is read out in full")
  assert.equal(name("convex/lib"), "Convex library", "a word saying nothing takes the one above")
  assert.equal(name("ui/lib"), "UI library", "an acronym stays one")
  assert.equal(name("convex/grading"), "Grading", "a word that stands alone is left alone")
  assert.equal(name("src/app/(application)/*", 6), "Application [modules]", "a group opens further")
  assert.equal(name("src/app/(application)/courses/*", 0), "Courses [files]", "this one does not")
  assert.equal(name("*"), "Repo root [files]")
})

test("a route parameter is named for what it is a detail of", () => {
  assert.equal(nameOf("src/app/courses/[course_id]"), "Course [detail]", "trailing id drops")
  assert.equal(nameOf("src/pages/[owner]/*"), "Owner [detail]")
  assert.equal(nameOf("modname/[slug]"), "Modname [detail]", "a slug names only its parent")
  assert.equal(nameOf("blog/[...rest]"), "Blog [detail]", "and so does a catch all")
  assert.equal(nameOf("convex/lib/[slug]"), "Convex [detail]", "and not a folder saying nothing")
})

test("a folder named after a uuid is left as written, and sorts last", () => {
  assert.equal(isId("b7e2c4a9-1f6d-8a3e-2026q2"), true)
  assert.equal(nameOf("src/app/(preview)/b7e2c4a9-1f6d-8a3e-2026q2"), "b7e2c4a9-1f6d-8a3e-2026q2")
  assert.equal(isId("exercise-rework-specification"), false, "three words are not a hash")
  assert.equal(isId("lucide-animated"), false)
  assert.equal(isId("professor-exercises"), false)
})

test("two groups called the same thing both take their parent", () => {
  const named = namesOf([
    { path: "ui/components/data", folders: 0 },
    { path: "ui/lib/data", folders: 0 },
    { path: "ui/views", folders: 0 },
  ])
  assert.equal(named.get("ui/components/data"), "Components data")
  assert.equal(named.get("ui/lib/data"), "Library data")
  assert.equal(named.get("ui/views"), "Views", "what does not clash stays short")
})

test("a group is named after the folder that tells it apart, not the one above it", () => {
  const named = namesOf([
    { path: "apps/admin/src/modules/*", folders: 4 },
    { path: "apps/customer/src/modules/*", folders: 7 },
  ])
  assert.equal(named.get("apps/admin/src/modules/*"), "Admin [modules]")
  assert.equal(named.get("apps/customer/src/modules/*"), "Customer [modules]", "not both source")
  assert.equal(
    nameOf("packages/lib/src/*", 2),
    "Library source [modules]",
    "nothing above says more",
  )
  assert.equal(nameOf("src/submodules/*", 3), "Submodules [modules]", "only the whole word repeats")
})

test("a clash climbs a folder at a time, and says the path when climbing runs out", () => {
  const still = namesOf([
    { path: "apps/admin/src/modules/*", folders: 4 },
    { path: "apps/admin/lib/modules/*", folders: 4 },
  ])
  assert.equal(
    still.get("apps/admin/src/modules/*"),
    "Source [modules]",
    "one borrow was not enough",
  )
  assert.equal(still.get("apps/admin/lib/modules/*"), "Library [modules]")

  // climbing onto a name someone else already had has to set that one climbing too
  const onto = namesOf([
    { path: "src/modules/*", folders: 2 },
    { path: "apps/admin/src/modules/*", folders: 2 },
    { path: "apps/admin/lib/modules/*", folders: 2 },
  ])
  assert.equal(new Set(onto.values()).size, 3, "one round settled a clash by making another")

  // `_lib` and `lib` are read the same however far it climbs
  const same = namesOf([
    { path: "convex/_lib", folders: 0 },
    { path: "convex/lib", folders: 0 },
  ])
  assert.equal(same.get("convex/_lib"), "convex/_lib", "two rows reading alike is the bug")
  assert.equal(same.get("convex/lib"), "convex/lib")
})

test("a label decided on a handful of imports says so, an exact one does not", () => {
  const sure = (inside: number, out: number, into: number, reach = 2) =>
    shapeOf(inside, out, into, reach).sure
  assert.equal(sure(0, 2, 2), false, "four imports, and one of them would move it")
  assert.equal(sure(32, 30, 25), false, "45% arriving sits on the line whatever the size")
  assert.equal(sure(781, 1337, 1279), true, "the same balance over thousands does not move")
  assert.equal(sure(35, 0, 54), true, "every import inside is exact, not a near miss")
  assert.equal(sure(0, 22, 0), true, "nothing importing it is exact too")
  assert.equal(sure(0, 0, 0), true, "and so is importing nothing at all")
})

test("a table is written the way whatever opens it next expects", () => {
  const rows = [
    ["group", "files", "note"],
    ["ui/lib", 24, 'a "quoted", comma'],
    ["src", 16, "plain"],
  ]
  const by = (key: string) => FORMATS.find((f) => f.key === key)!.of(rows, "groups")

  assert.match(by("csv"), /^group,files,note\n/, "a header, then the rows")
  assert.ok(by("csv").includes('"a ""quoted"", comma"'), "a comma or a quote is escaped")
  assert.deepEqual(JSON.parse(by("json"))[0], {
    group: "ui/lib",
    files: 24,
    note: 'a "quoted", comma',
  })
  assert.ok(by("toml").includes("[[groups]]"), "one table per row, named for the panel")
  assert.ok(by("toml").includes("files = 24"), "and a number stays a number")
  assert.ok(by("md").includes("| group"), "a markdown table has a header row")
  assert.ok(by("md").split("\n")[3].startsWith("| ---"), "and a rule under it")
  assert.ok(by("xls").includes("<x:Name>groups</x:Name>"), "excel is handed a sheet name")
  assert.ok(by("xls").includes("&quot;") === false, "and the cells are html escaped")
  assert.ok(by("xls").includes("<td x:num>24</td>"), "with numbers marked as numbers")
})
