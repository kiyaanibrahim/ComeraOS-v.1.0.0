"use client"

import { useSyncExternalStore } from "react"

export type IslandReceipt = {
  billNumber: string
  lines: { name: string; quantity: number; amount: number }[]
  subtotal: number
  discount: number
  tax: number
  total: number
  currency: string
  tendered: number | null
  change: number | null
}

export type IslandConfirm = {
  label: string
  destructive?: boolean
  run: () => void
}

export type IslandToast = {
  id: number
  message: string
  tone: "success" | "error" | "info"
  receipt?: IslandReceipt
  confirm?: IslandConfirm
}

type IslandState = {
  current: IslandToast | null
  sequence: number
  timer: number
  held: boolean
  remaining: number
  started: number
  listeners: Set<() => void>
}

const islandState: IslandState = ((globalThis as { __comeraIsland?: IslandState }).__comeraIsland ??= {
  current: null,
  sequence: 0,
  timer: 0,
  held: false,
  remaining: 0,
  started: 0,
  listeners: new Set(),
})

function emit() {
  islandState.listeners.forEach((listener) => listener())
}

function schedule(ms: number) {
  window.clearTimeout(islandState.timer)
  islandState.remaining = ms
  islandState.started = Date.now()
  islandState.timer = window.setTimeout(() => {
    islandState.current = null
    emit()
  }, ms)
}

export function holdIsland(next: boolean) {
  if (!islandState.current?.receipt || next === islandState.held) return
  islandState.held = next
  if (next) {
    islandState.remaining = Math.max(0, islandState.remaining - (Date.now() - islandState.started))
    window.clearTimeout(islandState.timer)
    return
  }
  schedule(Math.max(islandState.remaining, 400))
}

function show(message: string, tone: IslandToast["tone"], receipt?: IslandReceipt, ms = 3200) {
  islandState.held = false
  islandState.sequence += 1
  islandState.current = { id: islandState.sequence, message, tone, receipt }
  emit()
  schedule(ms)
}

export function pushIslandToast(message: string, tone: IslandToast["tone"]) {
  show(message, tone)
}

export function pushIslandReceipt(receipt: IslandReceipt) {
  show("Completed", "success", receipt, 6000)
}

export function pushIslandConfirm(
  message: string,
  run: () => void,
  options?: { label?: string; destructive?: boolean },
) {
  window.clearTimeout(islandState.timer)
  islandState.held = true
  islandState.sequence += 1
  islandState.current = {
    id: islandState.sequence,
    message,
    tone: "info",
    confirm: { label: options?.label ?? "Confirm", destructive: options?.destructive, run },
  }
  emit()
}

export function dismissIsland() {
  window.clearTimeout(islandState.timer)
  islandState.held = false
  islandState.current = null
  emit()
}

export function useIslandToast() {
  return useSyncExternalStore(
    (listener) => {
      islandState.listeners.add(listener)
      return () => islandState.listeners.delete(listener)
    },
    () => islandState.current,
    () => null,
  )
}
