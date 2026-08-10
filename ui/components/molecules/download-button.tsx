// owner: finn
// goal: download button

import { Button } from "../atoms/button.tsx"
import { Download } from "../atoms/icons.tsx"
import { Tip } from "../atoms/tip.tsx"
import { toast } from "../atoms/toast.tsx"
import { download } from "../../lib/export.ts"

export function DownloadButton({
  name,
  text,
  note,
  className,
}: {
  name: string
  /** lazy, a large payload is only built on click */
  text: () => string
  note?: string
  className?: string
}) {
  const label = `Downloads ${name}`
  return (
    <Tip text={label} className={className}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={label}
        onClick={() => {
          download(name, text(), name.endsWith(".json") ? "application/json" : "text/csv")
          toast(name, note)
        }}
      >
        <Download />
      </Button>
    </Tip>
  )
}
