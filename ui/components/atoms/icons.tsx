// owner: finn
// goal: icons, every one we draw by hand. brands are generated instead

import { cn } from "../../lib/ui.ts"

/** outline, for chrome: follows the text colour, and the hover state with it */
const Line = ({ d, circle, className }: { d?: string; circle?: boolean; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("size-3.5 shrink-0", className)}
  >
    {circle && <circle cx="12" cy="12" r="9" />}
    {d && <path d={d} />}
  </svg>
)

/** filled, for a small mark that must read at a glance, tinted by whoever renders it */
const Solid = ({ d, className }: { d: string; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    fill="currentColor"
    className={cn("size-3.5 shrink-0", className)}
  >
    <path d={d} />
  </svg>
)

// the tabs
export const FolderMark = () => (
  <Line d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
)
export const Clock = () => <Line circle d="M12 7v5l3 2" />
export const Run = () => <Line d="M5 4h4l6 8-6 8H5l6-8-6-8ZM15 4h4" />
export const Checks = () => <Line d="M4 7l2.5 2.5L11 5M4 17l2.5 2.5L11 15M14 8h6M14 18h6" />
export const Sparkle = ({ className }: { className?: string }) => (
  <Line
    className={className}
    d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3ZM18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9L18 15Z"
  />
)
export const Dots = () => (
  <Line d="M6 7a2 2 0 1 0 0-.1ZM18 6a2 2 0 1 0 0-.1ZM12 18a2 2 0 1 0 0-.1ZM7.5 8.5l3 8M16.8 7.6l-3.4 8.6M8 6.6h8" />
)

// the theme switch
export const Sun = () => (
  <Line
    className="size-4"
    d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
  />
)
export const Moon = () => (
  <Line className="size-4" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
)

// a row in the tree, filled because an outline turns to mush at this size
export const Folder = ({ className }: { className?: string }) => (
  <Solid
    className={className}
    d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"
  />
)
export const File = ({ className }: { className?: string }) => (
  <Solid
    className={className}
    d="M6 2h8l6 6v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V9h5.5L14 3.5Z"
  />
)

// the actions, drawn from lucide's own paths
export const Copy = ({ className }: { className?: string }) => (
  <Line
    className={className}
    d="M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2ZM4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"
  />
)
export const Check = ({ className }: { className?: string }) => (
  <Line className={className} d="m20 6-11 11-5-5" />
)
export const Refresh = ({ className }: { className?: string }) => (
  <Line
    className={className}
    d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M21 21v-5h-5"
  />
)
export const Download = ({ className }: { className?: string }) => (
  <Line className={className} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
)

export const Blocks = ({ className }: { className?: string }) => (
  <Line
    className={className}
    d="M4.5 3h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3 9.5v-5A1.5 1.5 0 0 1 4.5 3ZM14.5 3h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 13 9.5v-5A1.5 1.5 0 0 1 14.5 3ZM4.5 13h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 3 19.5v-5A1.5 1.5 0 0 1 4.5 13ZM14.5 13h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 13 19.5v-5A1.5 1.5 0 0 1 14.5 13Z"
  />
)

export const Caret = ({ className }: { className?: string }) => (
  <Line className={className} d="m6 9 6 6 6-6" />
)

// where the repo is hosted
const HOSTS: Record<string, string> = {
  github:
    "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z",
  gitlab:
    "m12 21-3.7-11.4H15.7L12 21ZM3 9.6 12 21 1.5 13.4a.9.9 0 0 1-.3-1L2.7 8c.2-.5.9-.5 1.1 0L5.6 13H3Zm18 0h-2.6l1.8-5c.2-.5.9-.5 1.1 0l1.5 4.4a.9.9 0 0 1-.3 1L12 21l9-11.4Z",
  bitbucket: "M3 3h18l-3 18H6L3 3Zm6 6-1 6h8l1-6H9Z",
  git: "M12 2 2 12l10 10 10-10L12 2Zm0 4 6 6-6 6-6-6 6-6Z",
}

// the npm wordmark box, since a package page is where a reader goes next
export const NpmMark = ({ className }: { className?: string }) => (
  <Solid className={className} d="M2 7v10h6v-8h3v8h3V9h3v8h3V7H2Z" />
)

export const HostMark = ({ host, className }: { host: string; className?: string }) => (
  <Solid className={className} d={HOSTS[host] ?? HOSTS.git} />
)
