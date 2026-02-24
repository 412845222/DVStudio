/// <reference types="vite/client" />

declare const __DWEB_REPO_URL__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
