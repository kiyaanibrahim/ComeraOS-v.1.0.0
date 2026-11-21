"use client"

import { pushIslandToast, type IslandToast } from "@/lib/island-toast"

function messageText(value: unknown) {
  if (typeof value === "string" && value.trim()) return value
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message
  return "Done"
}

function islandWords(text: string, tone: IslandToast["tone"]) {
  const lower = text.toLowerCase()
  if (lower.includes("completed") || lower.includes("posted") || lower.includes("sale ")) return "Completed"
  if (lower.includes("opened")) return "Opened"
  if (lower.includes("closed") || lower.includes("close")) return "Closed"
  if (lower.includes("void")) return "Voided"
  if (tone === "error") return "Failed"
  const words = text.trim().split(/\s+/).slice(0, 2)
  if (tone === "success" && words.length > 2) return "Saved"
  return words.join(" ") || (tone === "success" ? "Saved" : "Done")
}

function show(value: unknown, tone: IslandToast["tone"]) {
  pushIslandToast(islandWords(messageText(value), tone), tone)
}

export const toast = Object.assign((value: unknown) => show(value, "info"), {
  success: (value: unknown) => show(value, "success"),
  error: (value: unknown) => show(value, "error"),
  message: (value: unknown) => show(value, "info"),
  info: (value: unknown) => show(value, "info"),
})
