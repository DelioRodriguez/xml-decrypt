import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IncomingMessage } from 'node:http'
import type { ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { decryptHandler } from './decrypt.ts'

test('multipart upload, authentication, responses and validation', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.DECRYPT_API_KEY
  process.env.DECRYPT_API_KEY = 'test-server-key'
  const url = 'http://localhost/api/decrypt'
  async function localFetch(target: string, options?: RequestInit) {
    const request = new Request(target, options)
    const req = new IncomingMessage(new Socket())
    req.method = request.method
    req.headers = Object.fromEntries(request.headers)
    req.headers.host = 'localhost'
    req.push(Buffer.from(await request.arrayBuffer()))
    req.push(null)
    let status = 200
    const headers = new Headers()
    let body: string | Uint8Array | undefined
    const res = {
      setHeader(name: string, value: string) { headers.set(name, value) },
      writeHead(code: number, values: Record<string, string>) {
        status = code
        for (const [name, value] of Object.entries(values)) headers.set(name, value)
      },
      end(value?: string | Uint8Array) { body = value },
    } as unknown as ServerResponse
    await decryptHandler(req, res)
    return new Response(typeof body === 'string' || body === undefined ? body : new Uint8Array(body), { status, headers })
  }
  let calls = 0
  globalThis.fetch = async (target, options) => {
    calls++
    assert.equal(target, 'https://api.syselbombillo.com/nomina/decrypt')
    assert.equal(options?.method, 'POST')
    assert.equal(new Headers(options?.headers).get('X-Api-Key'), 'test-server-key')
    assert(options?.body instanceof FormData)
    const file = options.body.get('file')
    assert(file instanceof File)
    assert.equal(file.name, 'nomina.enc')
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([0, 255, 17, 64]))
    return new Response('<nomina>OK</nomina>', { headers: { 'content-type': 'application/xml' } })
  }
  function form(name = 'nomina.enc', bytes = new Uint8Array([0, 255, 17, 64])) {
    const body = new FormData()
    body.append('file', new Blob([bytes]), name)
    return body
  }
  try {
    const success = await localFetch(url, { method: 'POST', body: form() })
    assert.equal(success.status, 200)
    assert.equal(success.headers.get('content-type'), 'application/xml')
    assert.equal(await success.text(), '<nomina>OK</nomina>')
    assert.equal(success.headers.get('cache-control'), 'no-store')
    assert.equal((await localFetch(url)).status, 405)
    assert.equal((await localFetch(url, { method: 'POST', body: form('nomina.xml') })).status, 400)
    assert.equal((await localFetch(url, { method: 'POST', body: form('nomina.enc', new Uint8Array()) })).status, 400)
    assert.equal((await localFetch(url, { method: 'POST', body: new FormData() })).status, 400)
    const duplicate = form()
    duplicate.append('file', new Blob(['other']), 'other.enc')
    assert.equal((await localFetch(url, { method: 'POST', body: duplicate })).status, 400)
    assert.equal((await localFetch(url, { method: 'POST', headers: { Origin: 'https://other.example' }, body: form() })).status, 403)
    assert.equal((await localFetch(url, { method: 'POST', body: form('large.enc', new Uint8Array(10 * 1024 * 1024 + 1)) })).status, 413)
    assert.equal(calls, 1, 'invalid files never reach the external service')
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Archivo inválido' }), { status: 422, headers: { 'content-type': 'application/json' } })
    const failure = await localFetch(url, { method: 'POST', body: form() })
    assert.equal(failure.status, 422)
    assert.deepEqual(await failure.json(), { message: 'Archivo inválido' })
    globalThis.fetch = async () => { throw new TypeError('network failure') }
    assert.equal((await localFetch(url, { method: 'POST', body: form() })).status, 502)
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError') }
    assert.equal((await localFetch(url, { method: 'POST', body: form() })).status, 504)
    delete process.env.DECRYPT_API_KEY
    assert.equal((await localFetch(url, { method: 'POST', body: form() })).status, 503)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DECRYPT_API_KEY
    else process.env.DECRYPT_API_KEY = originalKey
  }
})
