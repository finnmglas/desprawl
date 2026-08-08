// owner: finn
// goal: repo remote icons

import type { Remote } from "../../src/model.ts"

const marks: Record<Remote["host"], React.ReactNode> = {
  github: (
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
  ),
  gitlab: (
    <path d="m12 21-3.7-11.4H15.7L12 21ZM3 9.6 12 21 1.5 13.4a.9.9 0 0 1-.3-1L2.7 8c.2-.5.9-.5 1.1 0L5.6 13H3Zm18 0h-2.6l1.8-5c.2-.5.9-.5 1.1 0l1.5 4.4a.9.9 0 0 1-.3 1L12 21l9-11.4Z" />
  ),
  bitbucket: <path d="M3 3h18l-3 18H6L3 3Zm6 6-1 6h8l1-6H9Z" />,
  git: <path d="M12 2 2 12l10 10 10-10L12 2Zm0 4 6 6-6 6-6-6 6-6Z" />,
}

export function RemoteLink({ remote }: { remote: Remote }) {
  return (
    <a
      href={remote.url}
      target="_blank"
      rel="noreferrer"
      title={`${remote.name}: ${remote.url}`}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        {marks[remote.host]}
      </svg>
    </a>
  )
}
