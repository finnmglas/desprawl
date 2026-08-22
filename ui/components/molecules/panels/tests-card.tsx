// owner: finn
// goal: what the suite is, and running it

import { useEffect, useState } from "react"
import { Button } from "../../atoms/button.tsx"
import { Card, CardContent } from "../../atoms/card.tsx"
import { CardHead } from "../card-head.tsx"
import { Section } from "../../atoms/section.tsx"
import { Tip } from "../../atoms/tip.tsx"
import { toast } from "../../atoms/toast.tsx"
import { isLive, runTests, testSuite } from "../../../lib/app/live.ts"
import { num } from "../../../lib/say/format.ts"
import { TONES, coverageOf, suiteOf, type Verdict } from "../../../lib/say/verdict.ts"
import { cn } from "../../../lib/app/ui.ts"
import type { Suite } from "../../../../src/facts/tests.ts"

/** a lone number explains nothing */
const Fact = ({
  label,
  value,
  note,
  verdict,
}: {
  label: string
  value: string
  note: string
  verdict?: Verdict
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      {label}
      {verdict && (
        <Tip text={verdict.why} side="bottom">
          <span
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", TONES[verdict.tone])}
          >
            {verdict.label}
          </span>
        </Tip>
      )}
    </span>
    <span className="text-lg font-semibold tabular-nums">{value}</span>
    <span className="text-muted-foreground truncate text-[11px]">{note}</span>
  </div>
)

export function TestsCard() {
  const [suite, setSuite] = useState<Suite | null>(null)
  const [running, setRunning] = useState("")
  useEffect(() => {
    void testSuite().then(setSuite)
  }, [])

  return (
    <>
      {suite && (suite.files > 0 || suite.script) && (
        <Section id="card_tests">
          <Card>
            <CardHead
              title="Tests"
              hint={
                suite.runners.length
                  ? `${suite.runners.join(", ")}, counted by reading the files rather than running them`
                  : "no runner named in the manifest"
              }
            >
              {suite.script && isLive() && (
                <div className="ml-auto flex items-center gap-1">
                  {[
                    { label: suite.script, note: suite.command, cover: false },
                    ...(suite.measured || suite.measure
                      ? [
                          {
                            label: "with coverage",
                            note: suite.measure ? `the ${suite.measure} script` : suite.measured,
                            cover: true,
                          },
                        ]
                      : []),
                  ].map((one) => (
                    <Button
                      key={one.label}
                      variant="outline"
                      size="sm"
                      className="bg-card"
                      title={one.note}
                      disabled={!!running}
                      onClick={() => {
                        setRunning(one.label)
                        toast(`Running ${one.note}`, "the slow one, so it only runs on a click")
                        void runTests(suite.script, one.cover).then((made) => {
                          setRunning("")
                          if (made) setSuite(made)
                          toast(
                            made?.ran?.ok ? "Tests passed" : "Tests failed",
                            made?.ran ? `${made.ran.seconds}s, exit ${made.ran.code}` : "no answer",
                          )
                        })
                      }}
                    >
                      {running === one.label ? "running…" : one.label}
                    </Button>
                  ))}
                </div>
              )}
            </CardHead>
            <CardContent className="flex flex-col gap-3">
              {/* five facts, so four across leaves one alone on a second row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Fact
                  label="Suite"
                  value={suite.ran ? (suite.ran.ok ? "green" : "red") : "not run"}
                  note={
                    suite.ran
                      ? `${suite.ran.seconds}s, exit ${suite.ran.code}`
                      : "read, not run: press the button"
                  }
                  verdict={suiteOf(suite.ran, suite.cases)}
                />
                <Fact label="Test files" value={num(suite.files)} note="by folder and file name" />
                <Fact
                  label="Cases"
                  value={num(suite.cases)}
                  note="test and it calls, read off the code"
                />
                <Fact
                  label="Coverage"
                  value={suite.coverage ? `${suite.coverage.lines}%` : "—"}
                  note={
                    suite.coverage
                      ? `${suite.coverage.branches}% branches, ${suite.coverage.functions}% functions`
                      : "no report on disk, run the suite with coverage"
                  }
                  verdict={suite.coverage ? coverageOf(suite.coverage.lines) : undefined}
                />
                <Fact
                  label="Command"
                  value={suite.script || suite.command || "none"}
                  note={
                    suite.script
                      ? suite.command
                      : suite.command
                        ? "what these files are written for, and no manifest script runs it"
                        : "no test script in the manifest"
                  }
                />
              </div>
              {/* a file cannot run anything, and a number in one is as old as the file */}
              {!isLive() && (
                <p className="text-muted-foreground text-xs">
                  Counted when this page was saved, by reading the files rather than running them.
                  {suite.coverage
                    ? ` The coverage figure is whatever ${suite.covered} held at that moment.`
                    : " No coverage report was on disk then, so there is no figure to show."}{" "}
                  Running the suite needs a live desprawl:{" "}
                  <span className="font-mono">npx desprawl</span>
                  {suite.script && (
                    <>
                      {" "}
                      here, then the <span className="font-mono">{suite.script}</span> button.
                    </>
                  )}
                </p>
              )}
              {suite.ran && (
                <pre
                  className={cn(
                    "max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs",
                    suite.ran.ok ? "bg-muted" : "border-red-500/50",
                  )}
                >
                  {suite.ran.output || "(no output)"}
                </pre>
              )}
              {suite.ran && !isLive() && (
                <p className="text-muted-foreground text-xs">
                  That run happened before this page was saved, so it says what passed then, not
                  now.
                </p>
              )}
            </CardContent>
          </Card>
        </Section>
      )}{" "}
    </>
  )
}
