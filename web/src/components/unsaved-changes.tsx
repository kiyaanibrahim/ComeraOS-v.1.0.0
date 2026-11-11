"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function useUnsavedChanges(when: boolean) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const pending = useRef<string | null>(null)
  const skip = useRef(false)

  useEffect(() => {
    if (!when) return

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (skip.current) return
      event.preventDefault()
      event.returnValue = ""
    }

    function onClick(event: MouseEvent) {
      if (skip.current || event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest("a")
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return
      const next = new URL(href, window.location.href)
      if (next.origin !== window.location.origin) return
      const here = `${window.location.pathname}${window.location.search}`
      const dest = `${next.pathname}${next.search}`
      if (dest === here) return
      event.preventDefault()
      event.stopPropagation()
      pending.current = `${dest}${next.hash}`
      setOpen(true)
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [when])

  function stay() {
    pending.current = null
    setOpen(false)
  }

  function leave() {
    const href = pending.current
    skip.current = true
    setOpen(false)
    if (href) router.push(href)
  }

  return { open, stay, leave }
}

export function UnsavedChangesDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean
  onStay: () => void
  onLeave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onStay() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            This page has changes that are not saved. Leave without saving them?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onStay}>
            Stay
          </Button>
          <Button type="button" variant="destructive" onClick={onLeave}>
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
