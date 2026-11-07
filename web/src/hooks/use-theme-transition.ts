"use client"

import { useTheme } from "next-themes"
import { flushSync } from "react-dom"

type Origin = { x: number; y: number }

function coverRadius({ x, y }: Origin) {
  return Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )
}

/** Toggle light/dark with a circle reveal from `origin` (usually the click point). */
export function useThemeTransition() {
  const { resolvedTheme, setTheme } = useTheme()

  return async (origin: Origin) => {
    const next = resolvedTheme === "dark" ? "light" : "dark"
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    if (!document.startViewTransition || reduceMotion) {
      setTheme(next)
      return
    }

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        document.documentElement.classList.toggle("dark", next === "dark")
        document.documentElement.style.colorScheme = next
        setTheme(next)
      })
    })

    await transition.ready

    const { x, y } = origin
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${coverRadius(origin)}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 500,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      }
    )
  }
}
