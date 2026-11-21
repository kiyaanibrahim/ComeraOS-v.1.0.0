"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

type IslandContextValue = {
  view: string | null
}

const IslandContext = createContext<IslandContextValue | null>(null)

const SHELL_SPRING = { type: "spring", duration: 0.8, bounce: 0.2 } as const
const CONTENT_SPRING = { type: "spring", duration: 0.8, bounce: 0.35 } as const
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const PILL_WIDTH = 126
const PILL_HEIGHT = 37

function useContentSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setSize({ width: el.offsetWidth, height: el.offsetHeight })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

function Slot({
  keyId,
  children,
  className,
}: {
  keyId: string
  children: ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      key={keyId}
      initial={reduce ? { opacity: 0, filter: "blur(0px)" } : { opacity: 0, scale: 0.9, y: -8, filter: "blur(5px)" }}
      animate={reduce ? { opacity: 1, filter: "blur(0px)" } : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={
        reduce
          ? { opacity: 0, filter: "blur(0px)", transition: { duration: 0.1 } }
          : { opacity: 0, scale: 0.9, y: -6, filter: "blur(0px)", transition: { duration: 0.08, ease: EASE_OUT } }
      }
      transition={reduce ? { duration: 0.15 } : CONTENT_SPRING}
      style={{ transformOrigin: "top center" }}
      className={cn("flex items-center justify-center", className)}
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
  const [sizerRef, size] = useContentSize()
  const contextValue = useMemo(() => ({ view }), [view])
  const pill = size ? Math.min(size.width, size.height) / 2 : PILL_HEIGHT / 2
  const radius = view === "receipt" ? "var(--radius-xl)" : pill

  return (
    <IslandContext.Provider value={contextValue}>
      <motion.div
        role="status"
        aria-live="polite"
        initial={false}
        animate={
          size
            ? { width: size.width, height: size.height, borderRadius: radius }
            : { width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: pill }
        }
        transition={reduce ? { duration: 0 } : SHELL_SPRING}
        className={cn(
          "relative inline-flex items-start justify-center overflow-hidden bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10",
          className,
        )}
      >
        <div ref={sizerRef} className="w-max">
          <AnimatePresence mode="popLayout" initial={false}>
            {!expanded && compact ? (
              <Slot key="compact" keyId="compact">
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
        </div>
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
}) {
  const ctx = useContext(IslandContext)
  if (!ctx) throw new Error("DynamicIslandView must be used inside DynamicIsland")
  const active = ctx.view === id
  return (
    <AnimatePresence initial={false}>
      {active ? (
        <Slot key={id} keyId={id} className={className}>
          {children}
        </Slot>
      ) : null}
    </AnimatePresence>
  )
}
