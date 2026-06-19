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
        // 字节方舟的视频/图片生成任务需要长时间保持连接（30-60 秒），
        // 显式关闭代理超时，禁止 http-proxy 主动断开发起端连接。
        timeout: 600000,
        proxyTimeout: 600000,
        // text/event-stream 是流式响应，不要缓冲，直接透传。
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 让后端知道连接来自代理长轮询。
            proxyReq.setHeader('Connection', 'keep-alive')
            // 流式响应的 Content-Type 由后端决定（text/event-stream），
            // 不要让中间层做 chunked 以外的缓冲。
            res.setHeader('X-Accel-Buffering', 'no')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
          })
          proxy.on('error', (err, req, res) => {
            try {
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
              }
              res.write(`Proxy error: ${err?.message || err || 'unknown'}`)
              res.end()
            } catch {}
          })
        },
      },
      '/media': {
        target: 'http://127.0.0.1:5800',
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
})
