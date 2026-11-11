"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

export function Toaster() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <Sonner
      theme={mounted && resolvedTheme === "light" ? "light" : "dark"}
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: "shadow-lg",
        },
      }}
    />
  )
}

export { toast }
