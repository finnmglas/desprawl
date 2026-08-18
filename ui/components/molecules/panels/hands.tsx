// owner: finn
// goal: show responsible devs

import { Avatar, profileOf } from "../../atoms/avatar.tsx"
import type { Hand } from "../../../lib/app/people.ts"

export function Face({
  of,
  faces,
  className,
}: {
  of: Hand[]
  faces: Record<string, string>
  className?: string
}) {
  const [main] = of
  if (!main) return null
  return (
    <a
      href={profileOf(main.who.email) || undefined}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="block w-fit"
    >
      <Avatar
        name={main.who.name}
        email={main.who.email}
        found={faces[main.who.email.toLowerCase()]}
        className={className}
      />
    </a>
  )
}

export function Hands({
  of,
  faces,
  most = 5,
}: {
  of: Hand[]
  faces: Record<string, string>
  most?: number
}) {
  return (
    <>
      {of.slice(0, most).map((one) => (
        <span key={one.who.email} className="mt-1 flex items-center gap-1.5">
          <Avatar
            name={one.who.name}
            email={one.who.email}
            found={faces[one.who.email.toLowerCase()]}
          />
          <span className="flex-1">{one.who.name}</span>
          <span className="tabular-nums">{Math.round(one.share * 100)}%</span>
        </span>
      ))}
      {of.length > most && <span className="mt-1 block">and {of.length - most} more</span>}
    </>
  )
}
