// owner: finn
// goal: run the handful of repo commands from here instead of a terminal

import { useEffect, useState } from "react"
import { Button } from "../../atoms/button.tsx"
import { Card, CardContent, Note } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { Tip } from "../../atoms/tip.tsx"
import { toast } from "../../atoms/toast.tsx"
import {
  aliveActions,
  forgetAction,
  isLive,
  repoActions,
  runAction,
  startAction,
  stopAction,
} from "../../../lib/app/live.ts"
import { cn } from "../../../lib/app/ui.ts"
import type { Action, Alive } from "../../../../src/serve/actions.ts"
import type { Run } from "../../../../src/facts/tests.ts"

const FEW = 8

export function Doing({ onDone }: { onDone?: () => void }) {
  const [list, setList] = useState<Action[]>([])
  const [busy, setBusy] = useState("")
  const [ran, setRan] = useState<{ id: string; run: Run } | null>(null)
  const [all, setAll] = useState(false)
  const [up, setUp] = useState<Alive[]>([])

  useEffect(() => {
    if (isLive()) void repoActions().then(setList)
  }, [])

  // a server writes as it goes, so it is asked on a beat
  useEffect(() => {
    if (!isLive()) return
    const tick = () => void aliveActions().then(setUp)
    tick()
    const timer = setInterval(tick, up.some((one) => one.running) ? 1500 : 5000)
    return () => clearInterval(timer)
  }, [up.some((one) => one.running)])
  if (!isLive() || !list.length) return null

  const press = (one: Action) => {
    // it leaves this machine, so it is asked about rather than just done
    if (one.blocked) return
    if (
      one.outward &&
      !confirm(
        one.caution
          ? `${one.caution}.\n\nRun "${one.command}" anyway?`
          : `Run "${one.command}"? This pushes to the remote.`,
      )
    )
      return
    // a server has no end to wait for, so it is started and then watched
    if (one.long) {
      void startAction(one.id).then((made) => {
        if (!made) return
        setUp((was) => [...was.filter((o) => o.id !== made.id), made])
        toast(`Started ${one.command}`, "it keeps running until you stop it")
      })
      return
    }
    setBusy(one.id)
    setRan(null)
    void runAction(one.id).then((run) => {
      setBusy("")
      if (!run) return
      setRan({ id: one.id, run })
      toast(run.ok ? one.command : `${one.command} failed`, `${run.seconds}s, exit ${run.code}`)
      // the repo may be a different repo now, so whatever is on screen is stale
      if (run.ok && one.kind === "git") onDone?.()
    })
  }

  const groups = [
    { kind: "git" as const, title: "Git" },
    { kind: "project" as const, title: "Project" },
  ]
  return (
    <Card>
      <CardHead title="Actions" hint="run against this repo, from here" />
      <CardContent className="flex flex-col gap-3">
        {/* git on the left and the repo's own scripts on the right, so the two never
            read as one row of eleven buttons */}
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => {
            const held = list.filter((one) => one.kind === group.kind)
            if (!held.length) return null
            const shown = group.kind === "project" && !all ? held.slice(0, FEW) : held
            return (
              <div key={group.kind} className="flex min-w-0 flex-col gap-1.5">
                <Note>{group.title}</Note>
                <div className="flex flex-wrap items-center gap-2">
                  {shown.map((one) => (
                    <Tip
                      key={one.id}
                      text={one.blocked ?? one.caution ?? `${one.command} · ${one.note}`}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!busy || !!one.blocked}
                        onClick={() => press(one)}
                        // the card colour, or on dark these read as holes
                        className={cn(
                          "bg-card",
                          one.outward && "border-amber-500/60",
                          one.blocked && "cursor-not-allowed opacity-40",
                          one.caution && "border-dashed",
                        )}
                      >
                        {busy === one.id ? "running…" : one.long ? `▶ ${one.label}` : one.label}
                      </Button>
                    </Tip>
                  ))}
                  {group.kind === "project" && held.length > FEW && (
                    <button
                      onClick={() => setAll(!all)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-xs"
                    >
                      {all ? "show fewer" : `+${held.length - FEW} more`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {/* whatever is running, and whatever last finished, always on their own rows */}
        <div className={cn("flex w-full flex-col gap-2", !up.length && !ran && "hidden")}>
          {up.length > 0 && (
            <div className="flex flex-col gap-2">
              {up.map((one) => (
                <div key={one.id} className="flex flex-col gap-1 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        one.running ? "animate-pulse bg-emerald-500" : "bg-muted-foreground",
                      )}
                    />
                    <span className="font-mono text-xs">{one.command}</span>
                    <Note>
                      {one.running
                        ? `up for ${Math.round((Date.now() - one.since) / 1000)}s`
                        : `exited ${one.code}`}
                    </Note>
                    {one.running ? (
                      <Button
                        className="ml-auto"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void stopAction(one.id).then(() => toast("Interrupted", one.command))
                        }}
                      >
                        ■ stop
                      </Button>
                    ) : (
                      // it has already exited, so this drops a line off a page rather than
                      // interrupting anything
                      <button
                        title="Clear it away"
                        onClick={() => {
                          setUp((was) => was.filter((o) => o.id !== one.id))
                          void forgetAction(one.id)
                        }}
                        className="text-muted-foreground hover:text-foreground ml-auto cursor-pointer px-1 text-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {one.output && (
                    <pre className="bg-muted max-h-40 overflow-auto rounded p-2 font-mono text-[11px]">
                      {one.output.slice(-4000)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
          {ran && (
            <pre
              className={cn(
                "max-h-56 overflow-auto rounded-md border p-3 font-mono text-xs",
                ran.run.ok ? "bg-muted" : "border-red-500/50",
              )}
            >
              {ran.run.output}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
