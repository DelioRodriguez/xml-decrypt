import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_BODY_SIZE = MAX_FILE_SIZE + 64 * 1024
const ENDPOINT = 'https://api.syselbombillo.com/nomina/decrypt'

function fail(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ message }))
}

export async function decryptHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    fail(res, 405, 'Este endpoint solo acepta POST.')
    return
  }
  const origin = req.headers.origin
  let allowedOrigin = true
  try {
    const parsedOrigin = origin ? new URL(origin) : null
    allowedOrigin = !parsedOrigin || (process.env.PUBLIC_ORIGIN
      ? parsedOrigin.origin === process.env.PUBLIC_ORIGIN
      : parsedOrigin.host === req.headers.host)
  } catch { allowedOrigin = false }
  if (!allowedOrigin) {
    fail(res, 403, 'Origen de la solicitud no permitido.')
    return
  }
  if (!process.env.DECRYPT_API_KEY?.trim()) {
    fail(res, 503, 'Falta configurar DECRYPT_API_KEY en el servidor.')
    return
  }
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    fail(res, 400, 'Envía el archivo en el campo file de un formulario multipart.')
    return
  }
  if (Number(req.headers['content-length']) > MAX_BODY_SIZE) {
    fail(res, 413, 'El archivo supera el límite de 10 MB.')
    return
  }
  try {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        fail(res, 413, 'El archivo supera el límite de 10 MB.')
        return
      }
      chunks.push(Buffer.from(chunk))
    }
    let form: FormData
    try {
      const request = new Request('http://localhost/api/decrypt', {
        method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(Buffer.concat(chunks)),
      })
      form = await request.formData()
    } catch {
      fail(res, 400, 'El formulario enviado no es válido.')
      return
    }
    const files = form.getAll('file')
    const file = files[0]
    if (files.length !== 1 || !(file instanceof File) || !file.name.toLowerCase().endsWith('.enc')) {
      fail(res, 400, 'Envía un archivo .enc en el campo file.')
      return
    }
    if (!file.size || file.size > MAX_FILE_SIZE) {
      fail(res, file.size ? 413 : 400, file.size ? 'El archivo supera el límite de 10 MB.' : 'El archivo está vacío.')
      return
    }
    const body = new FormData()
    body.append('file', file, file.name)
    const upstream = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'X-Api-Key': process.env.DECRYPT_API_KEY }, body,
      signal: AbortSignal.timeout(90000), redirect: 'error',
    })
    const response = new Uint8Array(await upstream.arrayBuffer())
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    })
    res.end(response)
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError'
    fail(res, timeout ? 504 : 502, timeout
      ? 'El servicio tardó demasiado. Vuelve a intentarlo.'
      : 'No se pudo conectar con el servicio de desencriptación.')
  }
}
