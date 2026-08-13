// owner: finn
// goal: the agent runs going on right now, watched and answered without leaving the page

import { useEffect, useRef, useState } from "react"
import { Button } from "../atoms/button.tsx"
import { Card, CardContent, Note } from "../atoms/card.tsx"
import { CardHead } from "../molecules/card-head.tsx"
import { Badge } from "../atoms/badge.tsx"
import { Sparkle } from "../atoms/icons.tsx"
import { plural } from "../../lib/format.ts"
import { Transcript } from "./transcript.tsx"
import { toast } from "../atoms/toast.tsx"
import { closeTalk, isLive, onAgent, sayToAgent, stopAction, talksNow } from "../../lib/live.ts"
import { readPrefs } from "../../lib/prefs.ts"
import { OUTLINE } from "../../lib/verdict.ts"
import { cn } from "../../lib/ui.ts"
import type { Talk } from "../../../src/talk.ts"

const BEAT = 1200
const SLOW = 5000

/** how long it took, or how long it has been going, said the way a person would */
const spent = (since: number, until: number) => {
  const seconds = Math.round(((until || Date.now()) - since) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes}m ${seconds % 60}s`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function One({
  talk,
  onChange,
  onGone,
}: {
  talk: Talk
  onChange: (next: Talk) => void
  onGone: () => void
}) {
  const [said, setSaid] = useState("")
  const [open, setOpen] = useState(true)
  // closing throws away the only record of what it did, so it is asked twice, and the
  // second press is somewhere the first one was not
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (!sure) return
    const undo = setTimeout(() => setSure(false), 4000)
    return () => clearTimeout(undo)
  }, [sure])
  const foot = useRef<HTMLDivElement>(null)

  // a transcript that grows while you read it is only useful if it follows the last line
  useEffect(() => {
    if (open && talk.running) foot.current?.scrollIntoView({ block: "nearest" })
  }, [talk.turns.length, open, talk.running])

  const send = () => {
    const text = said.trim()
    if (!text) return
    const pick = readPrefs().agent
    setSaid("")
    void sayToAgent({ id: talk.id, text, install: pick.install, trust: pick.trust }).then(
      (next) => {
        if (next) return onChange(next)
        toast("It did not take that", `${talk.tool} could not pick the conversation back up`)
      },
    )
  }

  const state = talk.running ? "working" : talk.code ? "stopped" : "done"
  const tone = talk.running ? OUTLINE.cool : talk.code ? OUTLINE.warn : OUTLINE.good
  // what it was told to do with the work, since that is the difference between a diff to
  // read and a pull request somebody has to close
  const did = talk.mode === "unstaged" ? "left in the working tree" : talk.mode

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", talk.running && "border-ring")}>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkle className={cn("shrink-0", talk.running && "animate-pulse")} />
        <button
          onClick={() => setOpen(!open)}
          title={open ? "fold it away" : "read the whole thing"}
          className="hover:text-foreground min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium"
        >
          {talk.task || talk.id}
        </button>
        <Badge variant="outline" className={tone}>
          {state}
          {talk.code ? ` ${talk.code}` : ""}
        </Badge>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {spent(talk.since, talk.until)}
          {talk.cost > 0 && ` · ${talk.cost.toFixed(2)}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {talk.running ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void stopAction(talk.id).then(() =>
                  onChange({ ...talk, running: false, until: Date.now() }),
                )
              }}
            >
              stop it
            </Button>
          ) : (
            <Button
              variant={sure ? "outline" : "ghost"}
              size="sm"
              title="closing it throws away everything it said"
              className={cn(sure && "border-amber-500/60 text-amber-600 dark:text-amber-400")}
              onClick={() => {
                if (!sure) return setSure(true)
                void closeTalk(talk.id).then((done) => {
                  if (done.closed) return onGone()
                  toast("It stayed", done.why ?? "nothing here would close it")
                  setSure(false)
                })
              }}
            >
              {sure ? "throw it away?" : "close"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            {open ? "hide" : "show"}
          </Button>
        </div>
      </div>

      <div className="text-muted-foreground -mt-1 flex flex-wrap items-center gap-1.5 pl-6 text-xs">
        <span>{talk.tool}</span>
        <span className="opacity-40">·</span>
        <span>{talk.model}</span>
        <span className="opacity-40">·</span>
        <span>{did}</span>
        <span className="opacity-40">·</span>
        <span>{plural(talk.turns.filter((one) => one.tool).length, "tool call")}</span>
      </div>

      {open && (
        <>
          <div className="bg-muted/40 max-h-72 overflow-auto rounded px-2 py-2">
            <Transcript turns={talk.turns} />
            <div ref={foot} />
          </div>
          {talk.answerable ? (
            <div className="flex items-center gap-2">
              <textarea
                value={said}
                onChange={(event) => setSaid(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return
                  event.preventDefault()
                  send()
                }}
                placeholder={
                  talk.running ? "it is working, this goes in when it stops" : "say something back"
                }
                className="border-input focus-visible:ring-ring h-9 flex-1 resize-none rounded-md border bg-transparent px-2 py-2 text-xs focus-visible:ring-1 focus-visible:outline-none"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={send}
                disabled={talk.running || !said.trim()}
              >
                send
              </Button>
            </div>
          ) : (
            <Note>
              {talk.tool} was run once and cannot be picked back up here, so this is what it said
            </Note>
          )}
        </>
      )}
    </div>
  )
}

/** nothing at all until something is running, since an empty panel is a panel in the way */
export function Agents() {
  const [talks, setTalks] = useState<Talk[]>([])

  useEffect(() => {
    if (!isLive()) return
    let timer: ReturnType<typeof setTimeout>
    const beat = () => {
      void talksNow().then((list) => {
        setTalks(list)
        timer = setTimeout(beat, list.some((one) => one.running) ? BEAT : SLOW)
      })
    }
    beat()
    // a press that starts one puts it here on the press: waiting a beat for it to appear
    // reads as the button having done nothing
    const stop = onAgent((made) => {
      setTalks((all) => [made, ...all.filter((one) => one.id !== made.id)])
      clearTimeout(timer)
      timer = setTimeout(beat, BEAT)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [])

  if (!talks.length) return null
  const working = talks.filter((one) => one.running).length

  return (
    <Card>
      <CardHead
        title={
          <span className="flex items-center gap-1.5">
            <Sparkle className={cn(working && "animate-pulse")} />
            Agents
          </span>
        }
        hint={
          working
            ? `${working} working, and desprawl stays up until they are done`
            : `${talks.length} here, kept until you close them, and each can be picked back up`
        }
      />
      <CardContent className="flex flex-col gap-2">
        {talks.map((talk) => (
          <One
            key={talk.id}
            talk={talk}
            onChange={(next) =>
              setTalks((all) => all.map((one) => (one.id === next.id ? next : one)))
            }
            onGone={() => setTalks((all) => all.filter((one) => one.id !== talk.id))}
          />
        ))}
      </CardContent>
    </Card>
  )
}
