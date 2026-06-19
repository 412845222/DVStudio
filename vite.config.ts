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
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5800',
        changeOrigin: true,
        // 字节方舟 Seedance 视频生成任务通常需要 30~600 秒，
        // 完全禁用代理层超时，让后端 SSE 流保持长连接。
        timeout: 0,
        proxyTimeout: 0,
        // 手动处理响应以确保 SSE / 流式数据零缓冲透传。
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Connection', 'keep-alive')
            // text/event-stream 必须禁用中间层缓冲
            res.setHeader('X-Accel-Buffering', 'no')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // 手动 pipe：零缓冲透传流式响应（SSE / 视频 / 图片）。
            // 这样 http-proxy 不会干预连接生命周期，避免主动断开。
            const statusCode = proxyRes.statusCode || 200
            const headers = proxyRes.headers || {}
            // 复制响应头（保证 Transfer-Encoding / Content-Type 正确）
            for (const [key, value] of Object.entries(headers)) {
              if (Array.isArray(value)) {
                for (const v of value) res.setHeader(key, v as string)
              } else if (value != null) {
                res.setHeader(key, value as string)
              }
            }
            // 若后端没有写 Connection 头，显式写 keep-alive
            if (!res.getHeader('Connection')) {
              res.setHeader('Connection', 'keep-alive')
            }
            if (!res.getHeader('X-Accel-Buffering')) {
              res.setHeader('X-Accel-Buffering', 'no')
            }
            res.writeHead(statusCode)
            proxyRes.pipe(res)
          })
          proxy.on('error', (err, req, res) => {
            try {
              const msg = err?.message || String(err || 'unknown')
              if (!(res as any).writableEnded && !(res as any).finished) {
                if (!res.headersSent) {
                  res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
                }
                res.write(`Proxy error: ${msg}`)
                res.end()
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
