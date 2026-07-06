import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import http from 'node:http'
import pkg from './package.json'

const normalizeRepoUrl = (raw: unknown): string => {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  return v.replace(/^git\+/, '').replace(/\.git$/, '')
}

const REPO_URL = normalizeRepoUrl((pkg as any)?.repository?.url ?? (pkg as any)?.repository)
const APP_VERSION = String((pkg as any)?.version ?? '0.0.0')
const APP_NAME = String((pkg as any)?.build?.productName ?? (pkg as any)?.productName ?? 'DVStudio')
const APP_COPYRIGHT = String((pkg as any)?.copyright ?? 'Copyright (c) 2026 DwebStudio')
const BILIBILI_URL = String((pkg as any)?.funding?.url ?? 'https://space.bilibili.com/22690066')
const ISSUES_URL = REPO_URL ? `${REPO_URL}/issues` : 'https://github.com/412845222/DVStudio/issues'
const HOMEPAGE_URL = String((pkg as any)?.homepage ?? 'https://www.dweb.club/')

const VITE_BACKEND_BASE_URL = process.env.VITE_BACKEND_BASE_URL || 'http://127.0.0.1:5800'

const noKeepAliveAgent = new http.Agent({
  keepAlive: false,
  maxSockets: 1000,
})

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  return {
    base: isDev ? '/' : './',
    define: {
      __DWEB_REPO_URL__: JSON.stringify(REPO_URL),
      __DWEB_APP_VERSION__: JSON.stringify(APP_VERSION),
      __DWEB_APP_NAME__: JSON.stringify(APP_NAME),
      __DWEB_APP_COPYRIGHT__: JSON.stringify(APP_COPYRIGHT),
      __DWEB_HOMEPAGE_URL__: JSON.stringify(HOMEPAGE_URL),
      __DWEB_BILIBILI_URL__: JSON.stringify(BILIBILI_URL),
      __DWEB_ISSUES_URL__: JSON.stringify(ISSUES_URL),
    },
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: VITE_BACKEND_BASE_URL,
          changeOrigin: true,
          ws: false,
          timeout: 0,
          proxyTimeout: 0,
          followRedirects: false,
          agent: noKeepAliveAgent,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              try {
                if (req.socket) {
                  req.socket.setTimeout(0)
                  req.socket.setKeepAlive(true, 0)
                }
              } catch {}
              try {
                proxyReq.setTimeout(0)
              } catch {}

              proxyReq.setHeader('X-Accel-Buffering', 'no')
              proxyReq.setHeader('Accept-Encoding', 'identity')
            })

            proxy.on('proxyRes', (proxyRes, req, res) => {
              try {
                if (req.socket) {
                  req.socket.setTimeout(0)
                  req.socket.setKeepAlive(true, 0)
                }
              } catch {}

              if (!res.headersSent) {
                const existingCT = proxyRes.headers['content-type']
                if (existingCT) {
                  res.setHeader('Content-Type', existingCT)
                } else {
                  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
                }
                res.setHeader('Cache-Control', 'no-cache, no-transform')
                res.setHeader('X-Accel-Buffering', 'no')
              }
            })

            proxy.on('error', (err, req, res) => {
              try {
                const msg = err?.message || String(err || 'unknown error')
                if (res && !(res as any).writableEnded && !(res as any).finished) {
                  if (!(res as any).headersSent) {
                    ;(res as any).writeHead?.(502, { 'Content-Type': 'text/plain; charset=utf-8' })
                  }
                  ;(res as any).write?.(`Proxy error: ${msg}`)
                  ;(res as any).end?.()
                }
              } catch {}
            })
          },
        },
        '/media': {
          target: VITE_BACKEND_BASE_URL,
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
        },
      },
    },
    plugins: [
      vue(),
      {
        name: 'configure-http-server-timeouts',
        configureServer(server) {
          if (server.httpServer) {
            ;(server.httpServer as any).keepAliveTimeout = 0
            ;(server.httpServer as any).headersTimeout = 24 * 60 * 60 * 1000
            ;(server.httpServer as any).requestTimeout = 0
            ;(server.httpServer as any).timeout = 0

            try {
              ;(server.httpServer as any).maxConnections = 1000
            } catch {}

            server.httpServer.on('connection', (socket) => {
              try {
                socket.setTimeout(0)
                socket.setKeepAlive(true, 0)
              } catch {}
            })
          }
        },
      },
    ],
  }
})
