import http from "node:http"

const targetPort = 3000
const port = 2000

const server = http.createServer((req, res) => {
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
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

server.listen(port, () => {
  console.log(`Landing page http://localhost:${port}`)
})
