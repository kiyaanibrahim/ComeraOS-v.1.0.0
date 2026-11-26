"use client"

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react"
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

type Size = { width: number; height: number }

type IslandContextValue = {
  view: string | null
  report: (id: string, size: Size) => void
}

const IslandContext = createContext<IslandContextValue | null>(null)

export const SHELL_SPRING = { type: "spring", duration: 0.8, bounce: 0.2 } as const
const ISLAND_SPRING = { type: "spring", duration: 0.5, bounce: 0 } as const

function Slot({
  keyId,
  children,
  className,
  enterDelay = 0,
}: {
  keyId: string
  children: ReactNode
  className?: string
  enterDelay?: number
}) {
  const reduce = useReducedMotion()
  const ctx = useContext(IslandContext)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ctx) return
    const send = () => {
      const next = { width: Math.ceil(el.offsetWidth), height: Math.ceil(el.offsetHeight) }
      if (next.width < 1 || next.height < 1) return
      ctx.report(keyId, next)
    }
    send()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(send)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ctx, keyId])

  return (
    <motion.div
      ref={ref}
      key={keyId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.14 } }}
      transition={reduce ? { duration: 0 } : { duration: 0.22, delay: enterDelay }}
      className={cn("col-start-1 row-start-1 flex w-max min-w-max shrink-0 items-center justify-center justify-self-center self-center", className)}
    >
      {children}
    </motion.div>
  )
}

export function DynamicIsland({
  view,
  compact,
  children,
  className,
}: {
  view: string | null
  compact?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  const expanded = view !== null
  const [size, setSize] = useState<Size | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const report = useCallback((id: string, next: Size) => {
    if (id !== (viewRef.current ?? "compact")) return
    setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next))
  }, [])
  const contextValue = useMemo(() => ({ view, report }), [view, report])
  const radius = 9999
  const width = useMotionValue(0)
  const height = useMotionValue(0)
  const roundedWidth = useTransform(width, (value) => Math.round(value))
  const roundedHeight = useTransform(height, (value) => Math.round(value))
  const seen = useRef<Size | null>(null)

  useLayoutEffect(() => {
    if (!size) return
    const previous = seen.current
    seen.current = size
    if (reduce || !previous) {
      width.set(size.width)
      height.set(size.height)
      return
    }
    if (previous.width === size.width && previous.height === size.height) return
    const widthAnimation = animate(width, size.width, ISLAND_SPRING)
    const heightAnimation = animate(height, size.height, ISLAND_SPRING)
    return () => {
      widthAnimation.stop()
      heightAnimation.stop()
    }
  }, [size, reduce, width, height])

  return (
    <IslandContext.Provider value={contextValue}>
      <motion.div
        role="status"
        aria-live="polite"
        className={cn(
          "relative inline-grid place-items-center overflow-clip bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10 transition-[background-color,color,box-shadow] duration-300",
          className,
        )}
        style={{
          width: size ? roundedWidth : "max-content",
          height: size ? roundedHeight : "max-content",
          borderRadius: radius,
        }}
      >
        <AnimatePresence initial={false}>
          {!expanded && compact ? (
            <Slot key="compact" keyId="compact" enterDelay={0.1}>
              {compact}
            </Slot>
          ) : null}
          {Children.map(children, (child) =>
            isValidElement<{ id?: string }>(child)
              ? cloneElement(child as ReactElement<{ id?: string }>, {
                  key: child.props.id || "view",
                })
              : child,
          )}
        </AnimatePresence>
      </motion.div>
    </IslandContext.Provider>
  )
}

export function DynamicIslandView({
  id,
  children,
  className,
}: {
  id: string
  children: ReactNode
  className?: string
  stable?: boolean
}) {
  const ctx = useContext(IslandContext)
  if (!ctx) throw new Error("DynamicIslandView must be used inside DynamicIsland")
  const active = ctx.view === id
  return (
    <AnimatePresence initial={false}>
      {active ? (
        <Slot key={id} keyId={id} className={className} enterDelay={0.06}>
          {children}
        </Slot>
      ) : null}
    </AnimatePresence>
  )
}
