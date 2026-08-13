// owner: finn
// goal: hand one task to an agent on this machine, and watch it

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "../atoms/button.tsx"
import { Select } from "../atoms/input.tsx"
import { Sparkle } from "../atoms/icons.tsx"
import { Tabs } from "../atoms/tabs.tsx"
import { toast } from "../atoms/toast.tsx"
import { agentHere, isLive, startFix, stopAction, talksNow } from "../../lib/live.ts"
import { Transcript } from "./transcript.tsx"
import { readPrefs, savePrefs, type Prefs } from "../../lib/prefs.ts"
import { cn } from "../../lib/ui.ts"
import type { Agent } from "../../../src/agent.ts"
import type { Talk } from "../../../src/talk.ts"
import type { Task } from "../../lib/tasks.ts"

/** asked once for the whole page rather than once per row */
let asked: Promise<Agent | null> | null = null
const here = () => (asked ??= agentHere())

const WIDE = 380
const EDGE = 12

/** no task is the wildcard: whatever the person types becomes the task */
export function Fix({
  task,
  label,
  className,
}: {
  task?: Task
  label?: string
  className?: string
}) {
  const [wish, setWish] = useState("")
  const [agent, setAgent] = useState<Agent | null>(null)
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState("")
  // every row has one of these panels, so the choice is read off the saved settings rather
  // than held anywhere a second row could miss
  const [pick, setPick] = useState(() => readPrefs().agent)
  const set = (next: Partial<Prefs["agent"]>) => {
    const merged = { ...pick, ...next }
    setPick(merged)
    savePrefs({ ...readPrefs(), agent: merged })
  }
  const [more, setMore] = useState(false)
  // one panel per row and one loose one, and every one of them opens somewhere else
  const seat = task?.id ?? "anything"
  const [run, setRun] = useState<Talk | null>(null)
  const [at, setAt] = useState({ top: 0, left: 0 })
  const host = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isLive()) void here().then(setAgent)
  }, [])

  // a table clips whatever grows out of a cell, so the panel is not in the table at all:
  // it hangs off the body and is put where the button is
  const place = () => {
    const box = host.current?.getBoundingClientRect()
    if (!box) return
    // measured rather than assumed: it grows as it runs, and a guessed height puts the
    // button that starts it under the fold
    const tall = document.getElementById(`fix-${seat}`)?.getBoundingClientRect().height ?? 360
    setAt({
      top: Math.max(EDGE, Math.min(box.bottom + 6, innerHeight - EDGE - tall)),
      left: Math.max(EDGE, Math.min(box.right - WIDE, innerWidth - WIDE - EDGE)),
    })
  }
  // once it is there, it can be measured, and once measured it can be put where it fits
  useEffect(() => {
    if (open) place()
  }, [open, run?.running, more, pick.mode])

  useEffect(() => {
    if (!open) return
    const shut = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      if (event.type === "pointerdown" && host.current?.contains(event.target as globalThis.Node))
        return
      const panel = document.getElementById(`fix-${seat}`)
      if (event.type === "pointerdown" && panel?.contains(event.target as globalThis.Node)) return
      setOpen(false)
    }
    addEventListener("pointerdown", shut)
    addEventListener("keydown", shut)
    addEventListener("scroll", place, true)
    addEventListener("resize", place)
    return () => {
      removeEventListener("pointerdown", shut)
      removeEventListener("keydown", shut)
      removeEventListener("scroll", place, true)
      removeEventListener("resize", place)
    }
  }, [open])

  // while it works, the same panel that started it says how far it got
  useEffect(() => {
    if (!run?.running) return
    const timer = setInterval(() => {
      void talksNow().then((list) => {
        const mine = list.find((one) => one.id === run.id)
        if (!mine) return
        setRun(mine)
        if (!mine.running) toast(mine.code ? "It stopped" : "It finished", `exit ${mine.code}`)
      })
    }, 1500)
    return () => clearInterval(timer)
  }, [run?.running, run?.id])

  if (!isLive() || !agent) return null

  const said = agent.modes.find((one) => one.id === pick.mode) ?? agent.modes[0]
  const chosen = agent.installs.find((one) => one.id === pick.install) ?? agent.installs[0]
  // switching from claude to codex leaves "opus" selected, which codex has never heard of
  const picked = chosen.models.includes(pick.model) ? pick.model : chosen.models[0]
  const leash = chosen.trusts.includes(pick.trust) ? pick.trust : "auto"
  // a typed wish is a task with nothing measured about it, which is the honest shape
  const asked: Task = task ?? {
    id: `asked:${wish.slice(0, 40).replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`,
    title: wish.trim(),
    kind: "shape",
    where: ".",
    why: "asked for by hand, rather than found by reading the repo",
    lines: 0,
    reach: 0,
    minutes: 0,
    mechanical: false,
    hits: "maintainability",
  }
  const start = () => {
    void startFix({
      ...asked,
      extra,
      model: picked,
      mode: said.id,
      install: chosen.id,
      trust: leash,
    }).then((made) => {
      if (!made) return toast("Could not start it", `${chosen.tool} did not take the task`)
      setRun(made)
      toast(`${chosen.tool} is on it, ${picked}`, said.note)
      setWish("")
    })
  }

  return (
    <>
      <button
        ref={host}
        title={task ? `Hand "${task.title}" to an agent` : "Hand an agent anything"}
        onClick={(event) => {
          // the row underneath opens the file, and pressing this is not asking for that
          event.stopPropagation()
          // the settings on disk land after this page did, and every other row's panel
          // saves to the same place
          if (!open) setPick(readPrefs().agent)
          place()
          setOpen(!open)
        }}
        className={cn(
          "hover:border-ring text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 rounded-md border transition-colors",
          label ? "h-9 px-3 text-sm" : "p-1.5",
          (open || run?.running) && "border-ring text-foreground",
          run?.running && "animate-pulse",
          className,
        )}
      >
        <Sparkle />
        {label}
      </button>

      {open &&
        createPortal(
          <div
            id={`fix-${seat}`}
            // it hangs off the body, but react sends events up the tree it was written in,
            // not the one it is drawn in: without this every click in here also presses the
            // row underneath, which opens the file
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{ top: at.top, left: at.left, width: WIDE }}
            className="bg-card fixed z-50 flex flex-col gap-3 rounded-lg border p-3 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Sparkle />
                {/* which account, since the picker that says so is folded away by default */}
                Hand this to {chosen.tool}
                {chosen.who && `, ${chosen.who}`}
              </div>
              {task ? (
                <>
                  <div className="text-sm">{task.title}</div>
                  {/* two lines and a hover: a reason can be a paragraph, and this is a panel */}
                  <div className="text-muted-foreground line-clamp-2 text-xs" title={task.why}>
                    {task.why}
                  </div>
                </>
              ) : (
                <textarea
                  value={wish}
                  onChange={(event) => setWish(event.target.value)}
                  autoFocus
                  placeholder="what should it do? it works in this repo, with the same conventions"
                  className="border-input focus-visible:ring-ring h-20 w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-xs focus-visible:ring-1 focus-visible:outline-none"
                />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Model</span>
              <Tabs grow tabs={chosen.models} value={picked} onChange={(model) => set({ model })} />
            </div>

            {/* everything anybody sets once and never touches again. Folded away, the panel is
                a model and a button that says what pressing it does */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setMore(!more)}
                className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-xs"
              >
                <span className="w-3">{more ? "▾" : "▸"}</span>
                {more ? "less" : "more, and what it will run"}
              </button>

              {more && (
                <div className="flex flex-col gap-2 pt-1">
                  {agent.installs.length > 1 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">Which AI</span>
                      <Select
                        value={chosen.id}
                        onChange={(event) => set({ install: event.target.value })}
                      >
                        {agent.installs.map((one) => (
                          <option key={one.id} value={one.id}>
                            {one.label}
                          </option>
                        ))}
                      </Select>
                      <span className="text-muted-foreground text-xs">
                        {chosen.who
                          ? `billed to ${chosen.who}`
                          : "billed to whatever account it is signed in as, which nothing here could read"}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">
                      What it does with the work
                    </span>
                    {/* one line whatever it holds: four of these as tabs cut the last one off,
                        and four as a list made the panel taller than the screen */}
                    <Select value={said.id} onChange={(event) => set({ mode: event.target.value })}>
                      {agent.modes.map((one) => (
                        <option key={one.id} value={one.id}>
                          {one.label}
                          {one.blocked ? " (not here)" : ""}
                        </option>
                      ))}
                    </Select>
                    <span className="text-muted-foreground text-xs">{said.note}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">What it may do unasked</span>
                    <Select value={leash} onChange={(event) => set({ trust: event.target.value })}>
                      <option value="auto">auto, whatever the work above needs</option>
                      {chosen.trusts.map((one) => (
                        <option key={one} value={one}>
                          {one}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">Anything else to tell it</span>
                    <textarea
                      value={extra}
                      onChange={(event) => setExtra(event.target.value)}
                      placeholder="or leave it empty"
                      className="border-input focus-visible:ring-ring h-16 w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-xs focus-visible:ring-1 focus-visible:outline-none"
                    />
                  </div>

                  <code className="text-muted-foreground bg-muted/40 rounded px-2 py-1 text-[10px] break-all">
                    {chosen.bin.split(/[\\/]/).pop()}{" "}
                    {chosen.config && `(${chosen.config.split(/[\\/]/).pop()}) `}… {picked}, {leash}
                  </code>
                </div>
              )}
            </div>

            {/* folded or not: the button is about to be disabled and this says why */}
            {said.blocked && <span className="text-xs text-amber-500">{said.blocked}</span>}

            {run?.running ? (
              <div className="flex flex-col gap-2">
                <div className="bg-muted/40 max-h-40 overflow-auto rounded px-2 py-1.5">
                  <Transcript turns={run.turns.slice(-8)} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void stopAction(run.id).then(() => setRun({ ...run, running: false }))
                  }}
                >
                  stop it
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {run && !run.running && run.turns.length > 1 && (
                  <div className="bg-muted/40 max-h-40 overflow-auto rounded px-2 py-1.5">
                    <Transcript turns={run.turns.slice(-8)} />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={start}
                  disabled={!!said.blocked || (!task && !wish.trim())}
                >
                  {said.id === "plan" ? "ask it for a plan" : said.label}
                </Button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
