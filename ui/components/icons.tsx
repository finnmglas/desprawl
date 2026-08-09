// owner: finn
// goal: icons

const Line = ({ d, circle }: { d?: string; circle?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-3.5 shrink-0"
  >
    {circle && <circle cx="12" cy="12" r="9" />}
    {d && <path d={d} />}
  </svg>
)

/** the tree */
export const FolderMark = () => (
  <Line d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
)

/** the log */
export const Clock = () => <Line circle d="M12 7v5l3 2" />
