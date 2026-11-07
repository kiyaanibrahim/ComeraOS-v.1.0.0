import { spawn } from "node:child_process"
import { mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { WebSocket } from "undici"

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(webRoot, "public", "landing")
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const port = 9333
const profile = path.join(tmpdir(), "comera-landing-chrome")

const shots = [
  ["constellation", "http://localhost:3000/app"],
  ["core", "http://localhost:3000/app/demo"],
  ["pos", "http://localhost:3000/app/demo/pos"],
  ["inventory", "http://localhost:3000/app/demo/inventory"],
  ["products", "http://localhost:3000/app/demo/products"],
  ["orders", "http://localhost:3000/app/demo/orders"],
  ["expenses", "http://localhost:3000/app/demo/financials/expenses"],
  ["crm", "http://localhost:3000/app/demo/crm"],
]

await rm(profile, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

const chromeProc = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function debuggerUrl() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        const json = await response.json()
        return json.webSocketDebuggerUrl
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(250)
  }
  throw new Error("Chrome did not open a debugging port")
}

const browser = new WebSocket(await debuggerUrl())
const pending = new Map()
const events = []

browser.addEventListener("message", (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
    return
  }
  events.push(message)
})

await new Promise((resolve, reject) => {
  browser.addEventListener("open", resolve)
  browser.addEventListener("error", reject)
})

let nextId = 0
function send(method, params = {}, sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 20000)
    pending.set(id, (message) => {
      clearTimeout(timer)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    })
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    browser.send(JSON.stringify(payload))
  })
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })

await send("Page.enable", {}, sessionId)
await send(
  "Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  sessionId,
)

const readyExpression = `(() => {
  document.querySelectorAll('nextjs-portal').forEach((node) => node.remove())
  if (document.querySelector('.animate-pulse')) return false
  const areas = [...document.querySelectorAll('.recharts-area')]
  if (areas.length > 0) {
    return areas.some((node) => node.getBoundingClientRect().height > 80)
  }
  return Boolean(document.querySelector('table, form, button'))
})()`

for (const [name, url] of shots) {
  events.length = 0
  await send("Page.navigate", { url }, sessionId)
  const started = Date.now()
  let ready = false
  while (Date.now() - started < 20000) {
    const result = await send(
      "Runtime.evaluate",
      { expression: readyExpression, returnByValue: true },
      sessionId,
    )
    if (result.result?.value === true) {
      ready = true
      break
    }
    await sleep(250)
  }
  if (!ready) console.log(`timed out waiting for ${name}`)
  await sleep(1800)
  await send(
    "Runtime.evaluate",
    {
      expression: `document.querySelectorAll('nextjs-portal').forEach((node) => node.remove())`,
    },
    sessionId,
  )
  const shot = await send(
    "Page.captureScreenshot",
    { format: "png", fromSurface: true },
    sessionId,
  )
  const file = path.join(outDir, `${name}.png`)
  await writeFile(file, Buffer.from(shot.data, "base64"))
  console.log(`saved ${name}`)
}

browser.close()
chromeProc.kill()
await sleep(400)
await rm(profile, { recursive: true, force: true }).catch(() => {})
