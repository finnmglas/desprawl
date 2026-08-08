// owner: finn
// goal: show face/initial circle

import { useState } from "react"
import { cn } from "../lib/ui.ts"

/**
 * A github noreply address carries the numeric user id, which addresses the avatar directly.
 * No api call and no guessing, so it is the only source trusted here.
 */
export function faceOf(email: string): string {
  const noreply = /^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email)
  if (!noreply) return ""
  return noreply[1]
    ? `https://avatars.githubusercontent.com/u/${noreply[1]}?s=48`
    : `https://github.com/${noreply[2]}.png?size=48`
}

const initialsOf = (name: string): string =>
  name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "?"

export function Avatar({
  name,
  email,
  found,
  className,
}: {
  name: string
  email: string
  /** Resolved by github, wins over anything the address alone can tell us. */
  found?: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const src = found || faceOf(email)

  return (
    <span
      title={name}
      className={cn(
        "bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-medium",
        className,
      )}
    >
      {src && !broken ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
