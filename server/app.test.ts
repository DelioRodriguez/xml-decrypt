import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IncomingMessage } from 'node:http'
import type { ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { spawnSync } from 'node:child_process'
import { appHandler } from './app.ts'

async function request(path: string, method = 'GET') {
  const req = new IncomingMessage(new Socket())
  req.url = path
  req.method = method
  let status = 200
  const headers = new Headers()
  let body: string | Uint8Array | undefined
  const res = {
    setHeader(name: string, value: string) { headers.set(name, value) },
    writeHead(code: number, values: Record<string, string> = {}) {
      status = code
      for (const [name, value] of Object.entries(values)) headers.set(name, value)
    },
    end(value?: string | Uint8Array) { body = value },
  } as unknown as ServerResponse
  await appHandler(req, res)
  return new Response(typeof body === 'string' || body === undefined ? body : new Uint8Array(body), { status, headers })
}

test('serves production files, health, headers and blocks traversal', async () => {
  const key = process.env.DECRYPT_API_KEY
  try {
    process.env.DECRYPT_API_KEY = 'test-key'
    assert.equal((await request('/healthz')).status, 200)
    delete process.env.DECRYPT_API_KEY
    assert.equal((await request('/healthz')).status, 503)
    const index = await request('/')
    assert.equal(index.status, 200)
    assert.equal(index.headers.get('cache-control'), 'no-cache')
    assert.equal(index.headers.get('x-frame-options'), 'DENY')
    const html = await index.text()
    assert(html.includes('XML ENCRIPT'))
    const asset = html.match(/src="([^\"]+\.js)"/)?.[1]
    assert(asset)
    const js = await request(asset)
    assert.equal(js.status, 200)
    assert.equal(js.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal((await request('/', 'HEAD')).status, 200)
    assert.equal(await (await request('/', 'HEAD')).text(), '')
    assert.equal((await request('/missing.js')).status, 404)
    assert.equal((await request('/%2e%2e%2f.env.local')).status, 403)
    assert.equal((await request('/%GG')).status, 400)
    assert.equal((await request('/', 'POST')).status, 405)
  } finally {
    if (key === undefined) delete process.env.DECRYPT_API_KEY
    else process.env.DECRYPT_API_KEY = key
  }
})

test('production startup requires a key before binding a port', () => {
  const result = spawnSync(process.execPath, ['build-server/index.js'], {
    env: { ...process.env, NODE_ENV: 'production', DECRYPT_API_KEY: '' }, encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert(result.stderr.includes('Configura DECRYPT_API_KEY'))
})
