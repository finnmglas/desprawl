// owner: finn
// goal: show face/initial circle

import { useState } from "react"
import { cn } from "../../lib/ui.ts"

// a noreply address carries the user id, which addresses the avatar directly
export function faceOf(email: string): string {
  const noreply = /^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email)
  if (!noreply) return ""
  return noreply[1]
    ? `https://avatars.githubusercontent.com/u/${noreply[1]}?s=48`
    : `https://github.com/${noreply[2]}.png?size=48`
}

/** the same address that names the avatar also names the profile */
export function profileOf(email: string): string {
  const github = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email)
  if (github) return `https://github.com/${github[1]}`
  const gitlab = /^(?:\d+-)?([^@]+)@users\.noreply\.gitlab\.com$/i.exec(email)
  if (gitlab) return `https://gitlab.com/${gitlab[1]}`
  return ""
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
  /** Resolved by github, wins over the address */
  found?: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const src = found || faceOf(email)
  const profile = profileOf(email)

  const face = (
    <span
      title={profile ? `${name}, open the profile` : name}
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

  return profile ? (
    <a href={profile} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {face}
    </a>
  ) : (
    face
  )
}
