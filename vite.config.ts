import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vitest/config'

interface VercelHeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

// Applies the response headers from vercel.json to `vite preview`, so the
// Content-Security-Policy is exercised by the local end-to-end run as well.
function vercelHeadersInPreview(): Plugin {
  return {
    name: 'vercel-headers-in-preview',
    configurePreviewServer(server) {
      const file = fileURLToPath(new URL('./vercel.json', import.meta.url))
      const rules = (JSON.parse(readFileSync(file, 'utf8')).headers ?? []) as VercelHeaderRule[]
      const compiled = rules.map((rule) => ({ test: new RegExp(`^${rule.source}$`), headers: rule.headers }))
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0] ?? '/'
        for (const rule of compiled) {
          if (rule.test.test(path)) {
            for (const header of rule.headers) res.setHeader(header.key, header.value)
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), vercelHeadersInPreview()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 3401, strictPort: true },
  preview: { port: 3401, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.ts'],
    restoreMocks: true,
  },
})
