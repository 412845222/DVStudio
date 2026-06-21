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

// 根据 env 中的 VITE_BACKEND_BASE_URL（用于开发/测试时指定后端地址）。
const VITE_BACKEND_BASE_URL = process.env.VITE_BACKEND_BASE_URL || 'http://127.0.0.1:5800'

// 自定义 HTTP agent: 禁用连接池的 keepAlive，
// 避免 Node.js 默认 agent 的 socket 超时/重用问题影响长连接 SSE。
const noKeepAliveAgent = new http.Agent({
  keepAlive: false,
  maxSockets: 1000,
})

// https://vitejs.dev/config/
export default defineConfig({
  // Electron 生产环境通过 file:// 加载 dist/index.html，
  // 这里使用相对路径避免资源被解析为 file:///assets/* 而 404。
  base: './',
  define: {
    __DWEB_REPO_URL__: JSON.stringify(REPO_URL),
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: VITE_BACKEND_BASE_URL,
        changeOrigin: true,
        ws: false,
        // 完全禁用代理层超时：Seedance 视频生成可能十几分钟。
        // 注意：http-proxy 在 timeout=0 时不会调用 socket.setTimeout，
        // 所以我们在 proxyReq 事件中主动将超时设为 0。
        timeout: 0,
        proxyTimeout: 0,
        // 不使用 followRedirects，避免 RedirectableRequest 引入额外超时逻辑。
        followRedirects: false,
        // 使用自定义 agent 来控制连接行为。
        agent: noKeepAliveAgent,
        configure: (proxy, _options) => {
          // proxyReq：在代理请求发送到 Django 前调用。
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // ⭐ 关键修复：主动将入站 & 出站 socket 的 idle timeout 设为 0，
            // 避免 Node.js/Vite 默认值（如 30 秒）中断 SSE 长连接。
            try {
              if (req.socket) {
                req.socket.setTimeout(0)
                req.socket.setKeepAlive(true, 0)
              }
            } catch {}
            try {
              // 对 proxyReq（到 Django 的出站请求）也禁用超时。
              proxyReq.setTimeout(0)
            } catch {}

            // 告诉上游 Django 不要压缩 / 缓冲 SSE 响应。
            proxyReq.setHeader('X-Accel-Buffering', 'no')
            proxyReq.setHeader('Accept-Encoding', 'identity')
          })

          // proxyRes：在收到 Django 响应后调用。
          // 正确设置响应头，确保 SSE 流到达浏览器时带有正确的头部。
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // ⭐ 再次保险：入站 socket 的超时设为 0，
            // 避免在响应持续期间被意外关闭。
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
              // 不要设置 Connection: keep-alive — HTTP/1.1 默认就是 keep-alive，
              // 显式声明反而可能让某些 hop-by-hop 处理出错。
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
    // 自定义 plugin：通过 configureServer hook 直接操作 Node.js HTTP 服务器实例，
    // 显式设置 keepAliveTimeout / headersTimeout / requestTimeout 以支持长达十几分钟的 SSE 流。
    {
      name: 'configure-http-server-timeouts',
      configureServer(server) {
        if (server.httpServer) {
          // Node.js 默认 keepAliveTimeout = 5000ms，会导致长连接被主动关闭。
          // 这里显式将所有相关超时设为 0（禁用），以保证 SSE 流不被底层中断。
          // 注意：必须 keepAliveTimeout < headersTimeout（Node.js 的要求），
          // 所以将 keepAliveTimeout 设为 0，headersTimeout 设为一个较大的值。
          ;(server.httpServer as any).keepAliveTimeout = 0
          ;(server.httpServer as any).headersTimeout = 24 * 60 * 60 * 1000 // 24h 兜底
          ;(server.httpServer as any).requestTimeout = 0
          ;(server.httpServer as any).timeout = 0

          // 允许最大并发连接数，避免批量请求被拒绝。
          try {
            ;(server.httpServer as any).maxConnections = 1000
          } catch {}

          // ⭐ 额外兜底：监听 connection 事件，对每个新 socket 主动设置 timeout=0，
          // 确保没有任何继承的默认值影响长连接。
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
})
