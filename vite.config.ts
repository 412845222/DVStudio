import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

const normalizeRepoUrl = (raw: unknown): string => {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  return v.replace(/^git\+/, '').replace(/\.git$/, '')
}

const REPO_URL = normalizeRepoUrl((pkg as any)?.repository?.url ?? (pkg as any)?.repository)

// https://vitejs.dev/config/
export default defineConfig({
  // Electron 生产环境通过 file:// 加载 dist/index.html，
  // 这里使用相对路径避免资源被解析为 file:///assets/* 而 404。
  base: './',
  define: {
    __DWEB_REPO_URL__: JSON.stringify(REPO_URL),
  },
  server: {
    // 显式设置 HTTP 服务器超时，防止 Vite 代理 / TCP 连接因 idle 断开长连接。
    // 注意：server.http 不是 Vite 标准选项，超时通过 configureServer plugin hook 设置。
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5800',
        changeOrigin: true,
        ws: false,
        // 完全禁用代理层超时：Seedance 视频生成可能十几分钟。
        timeout: 0,
        proxyTimeout: 0,
        followRedirects: true,
        configure: (proxy, _options) => {
          // proxyReq：在代理请求发送到 Django 前调用。
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 确保 HTTP 长连接不断开。
            proxyReq.setHeader('Connection', 'keep-alive')
            // 告诉上游 Django 不要压缩 / 缓冲 SSE 响应。
            proxyReq.setHeader('X-Accel-Buffering', 'no')
            proxyReq.setHeader('Accept-Encoding', 'identity')
          })
          // proxyRes：在收到 Django 响应后调用。
          // 正确设置响应头，确保 SSE 流到达浏览器时带有正确的头部。
          proxy.on('proxyRes', (proxyRes, req, res) => {
            if (!res.headersSent) {
              const existingCT = proxyRes.headers['content-type']
              if (existingCT) {
                res.setHeader('Content-Type', existingCT)
              } else {
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
              }
              res.setHeader('Cache-Control', 'no-cache, no-transform')
              res.setHeader('X-Accel-Buffering', 'no')
              // 注意：不要设置 Connection: keep-alive
              // Connection 是 hop-by-hop header，由 HTTP 层自动管理。
              // HTTP/1.1 默认就是 keep-alive，不需要显式声明。
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
        target: 'http://127.0.0.1:5800',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },

  plugins: [
    vue(),
    // 自定义 plugin：通过 configureServer hook 直接操作 Node.js HTTP 服务器实例，
    // 显式设置 keepAliveTimeout / headersTimeout 以支持长达十几分钟的 SSE 流。
    {
      name: 'configure-http-server-timeouts',
      configureServer(server) {
        if (server.httpServer) {
          // Node.js 默认 keepAliveTimeout = 5000ms，会导致长连接被主动关闭。
          // 这里显式设置为 20 分钟，headersTimeout 设置为 25 分钟。
          // 必须 keepAliveTimeout < headersTimeout（Node.js 的要求）。
          ;(server.httpServer as any).keepAliveTimeout = 20 * 60 * 1000
          ;(server.httpServer as any).headersTimeout = 25 * 60 * 1000
          ;(server.httpServer as any).requestTimeout = 0
          // 允许最大并发连接数，避免批量请求被拒绝。
          try {
            ;(server.httpServer as any).maxConnections = 1000
          } catch {}
        }
      },
    },
  ],
})
