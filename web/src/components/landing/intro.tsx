"use client"

import { useLayoutEffect, useRef, useState } from "react"

const storageKey = "comera-intro"
const stepMs = 300
const holdMs = 420
const leaveMs = 680

const greetings = [
  "Hello",
  "Bonjour",
  "Hola",
  "Ciao",
  "Olá",
  "Hallo",
  "Salam",
  "नमस्ते",
  "مرحبا",
  "މަރުޙަބާ",
  "Привет",
  "こんにちは",
  "你好",
  "안녕하세요",
  "Aloha",
]

type Phase = "play" | "leave" | "done"

function rememberVisit() {
  try {
    document.cookie = "comera-intro=1; Path=/; SameSite=Lax"
  } catch {
    // The overlay still has to leave if cookies are blocked.
  }
}

function markSeen() {
  rememberVisit()
  try {
    sessionStorage.setItem(storageKey, "1")
  } catch {
    // Private mode can block storage. The overlay still has to leave.
  }
}

function finishIntro() {
  markSeen()
  document.documentElement.classList.add("intro-done")
  document.body.style.overflow = ""
}

export function Intro() {
  const [phase, setPhase] = useState<Phase>("play")
  const [index, setIndex] = useState(0)
  const dismissRef = useRef<() => void>(() => {})

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let seen = false
    try {
      seen = sessionStorage.getItem(storageKey) === "1"
    } catch {
      seen = false
    }

    if (reduce || seen) {
      finishIntro()
      setPhase("done")
      return
    }

    document.documentElement.classList.remove("intro-done")
    rememberVisit()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const overlay = document.querySelector(".hello")
    const parked: Element[] = []
    overlay?.parentElement?.querySelectorAll(":scope > :not(.hello)").forEach((node) => {
      if (!(node instanceof HTMLElement) || node.hasAttribute("inert")) return
      node.setAttribute("inert", "")
      parked.push(node)
    })

    let stopped = false
    const release = () => {
      if (stopped) return
      stopped = true
      document.body.style.overflow = previousOverflow
      parked.forEach((node) => node.removeAttribute("inert"))
      window.clearInterval(step)
      window.clearTimeout(leaveTimer)
      window.clearTimeout(doneTimer)
      window.removeEventListener("keydown", skip)
      window.removeEventListener("pageshow", onPageShow)
    }

    const step = window.setInterval(() => {
      setIndex((value) => (value + 1 < greetings.length ? value + 1 : value))
    }, stepMs)

    const leaveAt = (greetings.length - 1) * stepMs + holdMs
    const leaveTimer = window.setTimeout(() => setPhase("leave"), leaveAt)
    const dismiss = () => {
      finishIntro()
      release()
      setPhase("done")
    }
    dismissRef.current = dismiss

    const doneTimer = window.setTimeout(dismiss, leaveAt + leaveMs)

    const skip = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Enter") return
      dismiss()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) dismiss()
    }
    window.addEventListener("keydown", skip)
    window.addEventListener("pageshow", onPageShow)

    return () => release()
  }, [])

  if (phase === "done") return null

  return (
    <div
      className={`hello${phase === "leave" ? " is-leaving" : ""}`}
      role="status"
      onClick={() => dismissRef.current()}
    >
      <span className="sr-only">Loading</span>
      <div className="hello-mask" aria-hidden="true">
        {index > 0 ? (
          <p key={`out-${index - 1}`} className="hello-word is-out" dir="auto">
            {greetings[index - 1]}
          </p>
        ) : null}
        <p key={`in-${index}`} className={index === 0 ? "hello-word" : "hello-word is-in"} dir="auto">
          {greetings[index]}
        </p>
      </div>
    </div>
  )
}
