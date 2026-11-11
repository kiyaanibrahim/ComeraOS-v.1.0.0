"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useThemeTransition } from "@/hooks/use-theme-transition"
import { cn } from "@/lib/utils"

export function ThemeToggle({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { resolvedTheme } = useTheme()
  const toggleTheme = useThemeTransition()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === "dark"
  const label = mounted
    ? isDark
      ? "Switch to light theme"
      : "Switch to dark theme"
    : "Toggle color theme"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn(className)}
      onClick={(event) => {
        const { left, top, width, height } =
          event.currentTarget.getBoundingClientRect()
        void toggleTheme({
          x: left + width / 2,
          y: top + height / 2,
        })
      }}
      {...props}
    >
      {mounted ? (
        isDark ? (
          <SunIcon />
        ) : (
          <MoonIcon />
        )
      ) : (
        <MoonIcon className="opacity-0" />
      )}
    </Button>
  )
}
