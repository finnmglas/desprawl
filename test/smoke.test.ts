// owner: finn
// goal: the built page in a real browser, so the ui has a net under it too

import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { after, test } from "node:test"
import { serve } from "../src/serve/serve.ts"

const VIEWER = "dist/index.html"
const CHROMES = [
  process.env.CHROME_PATH,
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
].filter(Boolean) as string[]

const has = (bin: string) =>
  bin.includes("/") ? existsSync(bin) : spawnSync("which", [bin], { stdio: "ignore" }).status === 0
const chrome = CHROMES.find(has)

// no browser, or nothing built to look at: said out loud rather than passed over quietly
const why = !existsSync(VIEWER)
  ? `${VIEWER} is missing, run pnpm build first`
  : !chrome
    ? "no chrome on this machine"
    : ""
if (why) console.error(`smoke test skipped: ${why}`)

after(() => process.exit(0)) // the server holds the loop open

const shown = `[...document.querySelectorAll('[data-section]')].filter(n => n.offsetParent !== null).map(n => n.dataset.section)`
const tabs = `[...document.querySelectorAll('header button')].map(b => b.textContent.trim()).filter(x => x && x.length < 12 && x !== '⋯')`

// one page and one browser, so this is one test rather than three racing for them
test("the built page: tabs, a windowed table, panel search", { skip: why || false }, async () => {
  const url = await serve(process.cwd(), undefined, true, 0, readFileSync(VIEWER, "utf8"))
  const port = 9400 + (process.pid % 500)
  const browser = spawn(
    chrome!,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      "--hide-scrollbars",
      "--window-size=1440,900",
      "--no-sandbox",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  )
  const stop = () => {
    try {
      process.kill(-browser.pid!, "SIGKILL")
    } catch {
      browser.kill("SIGKILL")
    }
  }

  try {
    let pages: { type: string; webSocketDebuggerUrl: string }[] = []
    for (let i = 0; i < 80 && !pages.length; i++) {
      await new Promise((r) => setTimeout(r, 250))
      try {
        const all = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as typeof pages
        pages = all.filter((one) => one.type === "page")
      } catch {
        /* not up yet */
      }
    }
    assert.ok(pages.length, "headless chrome never opened a page")

    const ws = new WebSocket(pages[0].webSocketDebuggerUrl)
    let id = 0
    const waiting = new Map<number, (value: unknown) => void>()
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown }
      if (m.id && waiting.has(m.id)) waiting.get(m.id)!(m.result)
    }
    await new Promise((r) => (ws.onopen = r))
    const send = (method: string, params: unknown = {}) =>
      new Promise<{ result?: { value?: unknown } }>((res) => {
        const n = ++id
        waiting.set(n, res as (value: unknown) => void)
        ws.send(JSON.stringify({ id: n, method, params }))
      })
    const ev = async (expr: string) =>
      (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.value
    const until = async (expr: string, what: string) => {
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 250))
        if (await ev(expr)) return
      }
      assert.fail(`waited 50s for ${what}`)
    }

    await send("Page.enable")
    await send("Page.navigate", { url })
    await until(`!!document.querySelector('[data-section="kpis_overview"]')`, "the summary")

    assert.deepEqual(await ev(tabs), ["desprawl", "Overview", "Graph", "Tasks"])
    const panels = (await ev(shown)) as string[]
    for (const id of ["kpis_overview", "tree_files", "table_languages", "history_commits"])
      assert.ok(panels.includes(id), `${id} missing from ${panels.join(", ")}`)

    // a windowed table builds a screenful, never the whole list
    await ev(`location.hash = "#tab=Graph&panel=table_declarations"`)
    await until(
      `!!document.querySelector('[data-section="table_declarations"] tr[data-row]')`,
      "the declarations table",
    )
    const table = (await ev(`(() => {
      const p = document.querySelector('[data-section="table_declarations"]')
      const box = p.querySelector('div[class*="overflow-y"]')
      return {
        built: p.querySelectorAll('tr[data-row]').length,
        spacers: p.querySelectorAll('tbody tr[aria-hidden]').length,
        scrolls: box ? box.scrollHeight > box.clientHeight + 2 : false,
      }
    })()`)) as { built: number; spacers: number; scrolls: boolean }
    assert.ok(table.scrolls, "the declarations table never became a scroll box")
    assert.ok(table.built > 0 && table.built < 60, `built ${table.built} rows, wanted a screenful`)
    assert.ok(table.spacers > 0, "nothing stood in for the rows that were not built")

    // searching answers with panels and puts the tabs away
    const type = async (said: string) => {
      await ev(`(() => {
        const box = document.querySelector('header input')
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        set.call(box, ${JSON.stringify(said)})
        box.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await new Promise((r) => setTimeout(r, 1200))
    }
    await ev(
      `[...document.querySelectorAll('header button')].find(b => b.getAttribute('aria-label') === 'Search panels')?.click()`,
    )
    await type("coverage")
    assert.deepEqual(await ev(shown), ["card_tests"])
    assert.deepEqual(await ev(tabs), ["desprawl"], "the tabs stayed while searching")

    await type("zzzznothing")
    assert.deepEqual(await ev(shown), [])
    assert.ok(
      await ev(
        `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Clear search')`,
      ),
      "nothing matched and nothing offered a way out",
    )

    await type("")
    assert.deepEqual(await ev(tabs), ["desprawl", "Overview", "Graph", "Tasks"])
    ws.close()
  } finally {
    stop()
  }
})
