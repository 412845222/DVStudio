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
        ws: false,
        // Seedance 视频生成可能需要十几分钟，
        // 完全禁用代理层超时，让 SSE 流保持长连接。
        timeout: 0,
        proxyTimeout: 0,
        followRedirects: true,
        configure: (proxy, _options) => {
          // proxyReq：在代理请求发送到 Django 前调用。
          // 在这里只能修改请求头，不能修改客户端响应头。
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 确保 HTTP 长连接不断开。
            proxyReq.setHeader('Connection', 'keep-alive')
            // 告诉上游 Django 不要压缩 / 缓冲 SSE 响应。
            proxyReq.setHeader('X-Accel-Buffering', 'no')
            proxyReq.setHeader('Accept-Encoding', 'identity')
          })
          // proxyRes：在收到 Django 响应后调用。
          // 这是正确设置客户端响应头的位置，确保 SSE 流到达浏览器时带有正确的头部。
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // 仅设置响应头，让 http-proxy 默认的管道机制自动传递 SSE 数据流。
            if (!res.headersSent) {
              // 如果上游已经设置了 content-type，保留它；
              // 否则标注为 text/event-stream。
              const existingCT = proxyRes.headers['content-type']
              if (existingCT) {
                res.setHeader('Content-Type', existingCT)
              } else {
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
              }
              res.setHeader('Cache-Control', 'no-cache, no-transform')
              res.setHeader('X-Accel-Buffering', 'no')
              res.setHeader('Connection', 'keep-alive')
            }
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
