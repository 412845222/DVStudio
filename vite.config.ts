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
  plugins: [vue()],
  // Electron 生产环境通过 file:// 加载 dist/index.html，
  // 这里使用相对路径避免资源被解析为 file:///assets/* 而 404。
  base: './',
  define: {
    __DWEB_REPO_URL__: JSON.stringify(REPO_URL),
  },
  server: {
    // Vite DevServer HTTP server 配置：
    // Seedance 视频生成 SSE 流可能持续十几分钟，
    // 必须显式设置 keepAliveTimeout > headersTimeout，
    // 防止浏览器或中间层因 idle 断开长连接。
    http: {
      // keepAliveTimeout：Socket 在响应完成后保持 open 的最大时间，设为 20 分钟。
      // headersTimeout：Socket 在等待 headers 时的最大时间，设为 25 分钟。
      // 这确保 Vite DevServer 不会因 idle 超时而主动关闭 SSE 长连接。
      maxConnections: 100,
      keepAliveTimeout: 1_200_000, // 20 min
      headersTimeout: 1_500_000, // 25 min
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5800',
        changeOrigin: true,
        // Seedance 视频生成可能需要十几分钟，
        // 完全禁用代理层超时，让 SSE 流保持长连接。
        timeout: 0,
        proxyTimeout: 0,
        // SSE / 流式响应配置：设置 Connection: keep-alive，
        // 告知 Django 和浏览器端不要关闭连接。
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 确保 HTTP 长连接不断开。
            proxyReq.setHeader('Connection', 'keep-alive')
            // 告诉上游（Django）和中间层不要缓冲 SSE 响应。
            res.setHeader('X-Accel-Buffering', 'no')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
          })
          proxy.on('error', (err, req, res) => {
            try {
              const msg = err?.message || String(err || 'unknown')
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
})
