// owner: finn
// goal: hand one task to the claude on this machine, and watch it

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "../atoms/button.tsx"
import { Select } from "../atoms/input.tsx"
import { Sparkle } from "../atoms/icons.tsx"
import { Tabs } from "../atoms/tabs.tsx"
import { toast } from "../atoms/toast.tsx"
import { agentHere, aliveActions, isLive, startFix, stopAction } from "../../lib/live.ts"
import { cn } from "../../lib/ui.ts"
import type { Agent } from "../../../src/agent.ts"
import type { Alive } from "../../../src/actions.ts"
import type { Task } from "../../lib/tasks.ts"

/** asked once for the whole page rather than once per row */
let asked: Promise<Agent | null> | null = null
const here = () => (asked ??= agentHere())

const WIDE = 380
const EDGE = 12

export function Fix({ task }: { task: Task }) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState("")
  const [model, setModel] = useState("opus")
  const [mode, setMode] = useState("unstaged")
  const [run, setRun] = useState<Alive | null>(null)
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
    const tall = document.getElementById(`fix-${task.id}`)?.getBoundingClientRect().height ?? 360
    setAt({
      top: Math.max(EDGE, Math.min(box.bottom + 6, innerHeight - EDGE - tall)),
      left: Math.max(EDGE, Math.min(box.right - WIDE, innerWidth - WIDE - EDGE)),
    })
  }
  // once it is there, it can be measured, and once measured it can be put where it fits
  useEffect(() => {
    if (open) place()
  }, [open, run?.running, mode])

  useEffect(() => {
    if (!open) return
    const shut = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      if (event.type === "pointerdown" && host.current?.contains(event.target as globalThis.Node))
        return
      const panel = document.getElementById(`fix-${task.id}`)
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
      void aliveActions().then((list) => {
        const mine = list.find((one) => one.id === `fix:${task.id}`)
        if (!mine) return
        setRun(mine)
        if (!mine.running)
          toast(mine.code ? "Claude stopped" : "Claude finished", `exit ${mine.code}`)
      })
    }, 1500)
    return () => clearInterval(timer)
  }, [run?.running])

  if (!isLive() || !agent) return null

  const said = agent.modes.find((one) => one.id === mode)
  const start = () => {
    void startFix({ ...task, extra, model, mode }).then((made) => {
      if (!made) return toast("Could not start it", "claude did not take the task")
      setRun(made)
      toast(`Claude is on it, ${model}`, said?.note ?? "")
    })
  }

  return (
    <>
      <button
        ref={host}
        title={`Hand "${task.title}" to claude`}
        onClick={(event) => {
          // the row underneath opens the file, and pressing this is not asking for that
          event.stopPropagation()
          place()
          setOpen(!open)
        }}
        className={cn(
          "hover:border-ring text-muted-foreground hover:text-foreground cursor-pointer rounded-md border p-1.5 transition-colors",
          (open || run?.running) && "border-ring text-foreground",
          run?.running && "animate-pulse",
        )}
      >
        <Sparkle />
      </button>

      {open &&
        createPortal(
          <div
            id={`fix-${task.id}`}
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
                Hand this to claude
              </div>
              <div className="text-sm">{task.title}</div>
              {/* two lines and a hover: the reason can be a paragraph, and this is a panel */}
              <div className="text-muted-foreground line-clamp-2 text-xs" title={task.why}>
                {task.why}
              </div>
            </div>

            <textarea
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
              placeholder="anything else it should know, or leave it empty"
              className="border-input focus-visible:ring-ring h-16 w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-xs focus-visible:ring-1 focus-visible:outline-none"
            />

            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Model</span>
              <Tabs grow tabs={agent.models} value={model} onChange={setModel} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">What it does with the work</span>
              {/* one line whatever it holds: four of these as tabs cut the last one off, and
                  four as a list made the panel taller than the screen it opens on */}
              <Select value={mode} onChange={(event) => setMode(event.target.value)}>
                {agent.modes.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.label}
                    {one.blocked ? " (not here)" : ""}
                  </option>
                ))}
              </Select>
              <span
                className={cn(
                  "text-xs",
                  said?.blocked ? "text-amber-500" : "text-muted-foreground",
                )}
              >
                {said?.blocked ?? said?.note}
              </span>
            </div>

            <code className="text-muted-foreground bg-muted/40 rounded px-2 py-1 text-[10px] break-all">
              claude -p … --model {model} --permission-mode {said?.permission}
            </code>

            {run?.running ? (
              <div className="flex flex-col gap-2">
                <pre className="text-muted-foreground bg-muted/40 max-h-40 overflow-auto rounded px-2 py-1 text-[10px] whitespace-pre-wrap">
                  {run.output.slice(-1400) || "working…"}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void stopAction(`fix:${task.id}`).then(() => setRun(null))
                  }}
                >
                  stop it
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {run && !run.running && run.output && (
                  <pre className="text-muted-foreground bg-muted/40 max-h-40 overflow-auto rounded px-2 py-1 text-[10px] whitespace-pre-wrap">
                    {run.output.slice(-1400)}
                  </pre>
                )}
                <Button variant="outline" size="sm" onClick={start} disabled={!!said?.blocked}>
                  {said?.label === "plan only" ? "ask it for a plan" : (said?.label ?? "fix it")}
                </Button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
