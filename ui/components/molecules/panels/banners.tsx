// owner: finn
// goal: what a reader has to know before the page: saved file, or a server that stopped

import { CopyButton } from "../copy-button.tsx"
import { isLive, token } from "../../../lib/app/live.ts"

interface Props {
  /** the repo folder's own name, and its path */
  name: string
  repo: string
  online: boolean
}

export function Banners({ name, repo, online }: Props) {
  const stats = { repo }
  return (
    <>
      {/* a saved file is read by someone who did not run it, so it says what it is */}
      {!isLive() && (
        <div
          data-print="hide"
          className="bg-card flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {name === "desprawl"
                ? "A static demo of desprawl on its own source."
                : `A static desprawl report for ${name}.`}
            </span>{" "}
            <span className="text-muted-foreground">Run it on your own project:</span>
          </p>
          {/* the command and the button stay one row, whatever the text above them does */}
          <div className="flex shrink-0 items-center gap-2">
            <code className="bg-muted flex-1 rounded-md px-3 py-1.5 font-mono text-sm select-all">
              npx desprawl
            </code>
            <CopyButton
              text={() => "npx desprawl"}
              message="Copied npx desprawl"
              note="Run it in any git repo"
            />
          </div>
        </div>
      )}
      {/* Ctrl+C on the terminal it runs in kills this without a word to the tab */}
      {!online && (
        <div
          data-print="hide"
          className="border-destructive/50 bg-card flex flex-col gap-3 rounded-lg border p-3"
        >
          <p className="flex items-center gap-2 text-sm">
            <span className="bg-destructive size-2 shrink-0 rounded-full" />
            <span>
              <span className="font-medium">Disconnected.</span>{" "}
              <span className="text-muted-foreground">
                The desprawl server behind this tab stopped answering. This starts it again, on the
                same address, so the tab picks back up on its own:
              </span>
            </span>
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 overflow-x-auto rounded-md px-3 py-1.5 font-mono text-sm text-nowrap select-all">
              npx desprawl "{stats.repo}" --token={token()} --port={location.port}
            </code>
            <CopyButton
              text={() => `npx desprawl "${stats.repo}" --token=${token()} --port=${location.port}`}
              message="Copied the reconnect command"
              note="This tab reconnects on its own once the server answers again"
            />
          </div>
        </div>
      )}{" "}
    </>
  )
}
