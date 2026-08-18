// owner: finn
// goal: repo remote icons

import { HostMark } from "../atoms/icons.tsx"
import type { Remote } from "../../../src/read/model.ts"

export function RemoteLink({ remote }: { remote: Remote }) {
  return (
    <a
      href={remote.url}
      target="_blank"
      rel="noreferrer"
      title={`${remote.name}: ${remote.url}`}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      <HostMark host={remote.host} className="size-5" />
    </a>
  )
}
