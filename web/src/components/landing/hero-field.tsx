"use client"

import { useEffect } from "react"
import type { BackgroundHandle } from "asciify-engine/kit"

export function HeroField() {
  useEffect(() => {
    const host = document.querySelector("#hero")
    const clear = document.querySelector("#hero .copy")
    if (!(host instanceof HTMLElement) || !(clear instanceof HTMLElement)) return

    let destroyed = false
    let field: BackgroundHandle | undefined

    void import("asciify-engine/kit")
      .then(({ background, estuary }) => {
        if (destroyed) return
        const bg = background(host, {
          preset: estuary,
          clear,
          ink: "#8f8d86",
          speed: 1,
          cellSize: 10,
          opacity: 1,
          mark: "glyph",
          cursor: "trail",
          dither: 0,
          lazy: false,
        })
        if (destroyed) {
          bg.destroy()
          return
        }
        field = bg
      })
      .catch(() => {
        // The headline and the link stay in place when the field cannot load.
      })

    return () => {
      destroyed = true
      field?.destroy()
    }
  }, [])

  return null
}
