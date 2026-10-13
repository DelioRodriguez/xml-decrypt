import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decryptHandler } from './decrypt.ts'

// Works both from server/*.ts and the compiled build-server/*.js.
const root = fileURLToPath(new URL('../dist/', import.meta.url))
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
}

export async function appHandler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  let pathname: string
  try { pathname = new URL(req.url ?? '/', 'http://localhost').pathname }
  catch { res.writeHead(400); res.end('Solicitud inválida'); return }
  if (pathname === '/api/decrypt') { await decryptHandler(req, res); return }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD'); res.writeHead(405); res.end(); return
  }
  if (pathname === '/healthz') {
    const ready = Boolean(process.env.DECRYPT_API_KEY?.trim())
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: ready ? 'ok' : 'unavailable' }))
    return
  }
  let path: string
  try { path = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)) }
  catch { res.writeHead(400); res.end('Solicitud inválida'); return }
  if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return }
  try {
    const body = await readFile(path)
    res.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch { res.writeHead(404); res.end('No encontrado') }
}
