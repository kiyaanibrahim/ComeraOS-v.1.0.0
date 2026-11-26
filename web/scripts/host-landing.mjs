import http from "node:http"
import os from "node:os"

const targetPort = 3000
const port = 2000
const targetHost = `localhost:${targetPort}`
const targetOrigin = `http://${targetHost}`

function lanIpv4() {
  const ips = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const ipv4 = addr.family === "IPv4" || addr.family === 4
      if (ipv4 && !addr.internal) ips.push(addr.address)
    }
  }
  return ips
}

function proxyHeaders(req) {
  const headers = { ...req.headers, host: targetHost }
  if (headers.origin) headers.origin = targetOrigin
  if (headers.referer) {
    try {
      const referer = new URL(String(headers.referer))
      headers.referer = `${targetOrigin}${referer.pathname}${referer.search}`
    } catch {
      headers.referer = `${targetOrigin}/`
    }
  }
  return headers
}

const server = http.createServer((req, res) => {
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: proxyHeaders(req),
    },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers)
      upstream.pipe(res)
    },
  )
  proxy.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
    }
    res.end("ComeraOS on port 3000 is not running, so the landing page cannot be served.")
  })
  req.pipe(proxy)
})

function ignoreSocketErrors(socket) {
  socket.on("error", () => {})
}

server.on("clientError", (_err, socket) => {
  socket.destroy()
})

server.on("upgrade", (req, socket, head) => {
  ignoreSocketErrors(socket)
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: proxyHeaders(req),
  })
  proxy.on("upgrade", (res, proxySocket, proxyHead) => {
    ignoreSocketErrors(proxySocket)
    const lines = [`HTTP/1.1 ${res.statusCode ?? 101} Switching Protocols`]
    for (const [key, value] of Object.entries(res.headers)) {
      if (value !== undefined) {
        lines.push(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      }
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`)
    if (proxyHead.length) socket.write(proxyHead)
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)
  })
  proxy.on("error", () => socket.destroy())
  proxy.end(head)
})

server.listen(port, "0.0.0.0", () => {
  console.log(`Landing page http://127.0.0.1:${port}`)
  for (const ip of lanIpv4()) {
    console.log(`LAN         http://${ip}:${port}`)
  }
})
