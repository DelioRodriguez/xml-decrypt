import { createServer } from 'node:http'
import { access } from 'node:fs/promises'
import { appHandler } from './app.ts'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido.')
if (process.env.NODE_ENV === 'production' && !process.env.DECRYPT_API_KEY?.trim()) {
  throw new Error('Configura DECRYPT_API_KEY en las variables de entorno de Dokploy antes de desplegar.')
}
if (process.env.PUBLIC_ORIGIN) {
  const origin = new URL(process.env.PUBLIC_ORIGIN)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== process.env.PUBLIC_ORIGIN) {
    throw new Error('PUBLIC_ORIGIN debe ser un origen http(s) exacto, sin rutas ni barra final.')
  }
}
await access(new URL('../dist/index.html', import.meta.url))

const server = createServer((req, res) => {
  void appHandler(req, res).catch(() => {
    console.error('No se pudo completar la solicitud.')
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ message: 'Error interno del servidor.' }))
  })
})
server.requestTimeout = 120000
server.headersTimeout = 15000
server.listen(port, host, () => console.log(`XML ENCRIPT escuchando en ${host}:${port}`))
server.on('error', error => { console.error(`Error del servidor: ${error.message}`); process.exitCode = 1 })

let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  console.log('Cerrando XML ENCRIPT…')
  server.close(() => process.exit(0))
  setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 100000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
