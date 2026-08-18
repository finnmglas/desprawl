// owner: finn
// goal: what repo this is, and everything that moves the whole page

import { Find } from "../find.tsx"
import { NpmMark } from "../../atoms/icons.tsx"
import { RemoteLink } from "../remote-link.tsx"
import { Settings } from "../agent/settings.tsx"
import { Tabs } from "../../atoms/tabs.tsx"
import { toast } from "../../atoms/toast.tsx"
import { copy } from "../../../lib/app/export.ts"
import { num } from "../../../lib/say/format.ts"
import type { Prefs } from "../../../lib/app/prefs.ts"
import type { useTheme } from "../../../lib/app/theme.tsx"
import type { Stats } from "../../../../src/read/model.ts"

interface Props {
  stats: Stats
  name: string
  /** the tab bar, and what is typed into the panel search */
  tabs: string[]
  icons: Record<string, string | undefined>
  tab: string
  onTab: (next: string) => void
  typed: string
  setTyped: (next: string) => void
  /** what the search found, once something is typed */
  said: string
  found: number
  /** still reading something */
  slow: boolean
  /** the repos in this folder, when it is a folder of them */
  repos: string[]
  only: string
  onRepo?: (one: string) => void
  onHome: () => void
  prefs: Prefs
  change: (next: Partial<Prefs>) => void
  reload?: () => void
  onPaper: (kind: "pdf" | "pptx") => Promise<void>
  themed: ReturnType<typeof useTheme>
}

export function Masthead(props: Props) {
  const { stats, name, said, found, slow, repos, only, onRepo, typed, setTyped } = props
  const { prefs, change, reload, themed } = props
  const TABS = props.tabs
  const BAR = props.icons
  const tab = props.tab
  const paper = props.onPaper

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      {/* min-w-0 lets a long path truncate */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {/* folder name is the repo name */}
          <button
            onClick={props.onHome}
            className="hover:text-muted-foreground cursor-pointer truncate text-2xl font-semibold"
          >
            {name}
          </button>
          {stats.remotes.map((remote) => (
            <RemoteLink key={remote.url} remote={remote} />
          ))}
          {/* a manifest that is not private is one npm would take, so its page exists */}
          {stats.stack.name && !stats.stack.private && (
            <a
              href={`https://www.npmjs.com/package/${stats.stack.name}`}
              target="_blank"
              rel="noreferrer"
              title={`${stats.stack.name} on npm, read off package.json rather than the registry`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <NpmMark className="size-5" />
            </a>
          )}
        </div>
        <button
          onClick={async () =>
            toast(
              (await copy(stats.repo)) ? "Path copied" : "Copy blocked by the browser",
              stats.repo,
            )
          }
          title="Copy the path"
          className="text-muted-foreground hover:text-foreground w-fit max-w-full cursor-pointer truncate text-left font-mono text-xs"
        >
          {stats.repo}
        </button>
        <p className="text-muted-foreground text-xs">
          @{stats.head} · {stats.first.slice(0, 10)} to {stats.last.slice(0, 10)} ·{" "}
          {num(stats.commits)} commits · desprawl {stats.version}
          {stats.thin && (
            <span
              className="text-amber-600 dark:text-amber-400"
              title="cloned with --filter=blob:none, so git holds no file contents to diff. Commits, authors, dates and renames are right, every added or removed line reads 0"
            >
              {" "}
              · partial clone, no line counts
            </span>
          )}
          {slow && <span className="text-foreground"> · working…</span>}
        </p>
      </div>
      {/* seven tabs, a theme switch and a menu need most of a laptop, so they keep a
          row of their own until there is room for the repo name beside them */}
      <div data-print="hide" className="flex w-full min-w-0 items-center gap-2 xl:w-auto">
        {said ? (
          <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
            {found === 0
              ? `nothing here matches ${said}`
              : `${found === 1 ? "1 panel" : `${found} panels`} matching ${said}`}
          </p>
        ) : (
          <Tabs
            grow
            icons={BAR}
            className="xl:w-auto"
            tabs={TABS}
            value={TABS.includes(tab) ? tab : TABS[0]}
            // by hand means the whole tab
            onChange={props.onTab}
          />
        )}
        <Find value={typed} onChange={setTyped} placeholder="Search panels" />
        {repos.length > 0 && onRepo && (
          <select
            value={only}
            onChange={(event) => onRepo(event.target.value)}
            title="Which repo in this folder"
            className="bg-card h-9 max-w-40 shrink-0 rounded-md border px-2 text-sm"
          >
            <option value="">every repo</option>
            {repos.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </select>
        )}
        <Settings
          stats={stats}
          prefs={prefs}
          change={change}
          reload={reload}
          onPaper={paper}
          themed={themed}
        />
      </div>
    </header>
  )
}
