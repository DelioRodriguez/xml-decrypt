import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { decryptHandler } from './server/decrypt.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env.DECRYPT_API_KEY ??= env.DECRYPT_API_KEY
  const api = {
    name: 'decrypt-api',
    configureServer(server: { middlewares: { use: (path: string, handler: typeof decryptHandler) => void } }) {
      server.middlewares.use('/api/decrypt', decryptHandler)
    },
    configurePreviewServer(server: { middlewares: { use: (path: string, handler: typeof decryptHandler) => void } }) {
      server.middlewares.use('/api/decrypt', decryptHandler)
    },
  }
  return { plugins: [react(), tailwindcss(), api] }
})
