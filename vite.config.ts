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
      },
    },
  },
})
