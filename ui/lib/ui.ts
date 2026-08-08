// owner: finn
// goal: cn, variants, asChild, vendored

import { clsx, type ClassValue } from "clsx"
import * as React from "react"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type Variants = Record<string, Record<string, string>>
type Chosen<V extends Variants> = { [K in keyof V]?: keyof V[K] | null }

// the arg is optional, so infer would fold in undefined
export type VariantProps<F extends (...args: never[]) => string> = Omit<
  NonNullable<Parameters<F>[0]>,
  "class"
>

// cva, minus compound variants we do not use
export function variants<V extends Variants>(
  base: string,
  config: { variants: V; defaults: { [K in keyof V]: keyof V[K] } },
) {
  return (props: Chosen<V> & { class?: ClassValue } = {}) => {
    const picked = Object.keys(config.variants).map((key) => {
      const choice = props[key] ?? config.defaults[key]
      return config.variants[key][choice as string]
    })
    return cn(base, picked, props.class)
  }
}

// radix Slot, merging our props onto the single child
export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ children, ...props }, ref) => {
    if (!React.isValidElement(children)) return null
    const child = children as React.ReactElement<Record<string, unknown>>
    return React.cloneElement(child, {
      ...props,
      ...child.props,
      className: cn(props.className, child.props.className as string),
      ref,
    })
  },
)
Slot.displayName = "Slot"
