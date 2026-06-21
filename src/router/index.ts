import { createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { isElectron } from '../electronBridge'

const routes: RouteRecordRaw[] = [
  {
    path: '/welcome',
    name: 'Welcome',
    component: () => import('../views/WelCome.vue'),
  },
  {
    path: '/',
    name: 'ProjectList',
    component: () => import('../views/ProjectList.vue'),
  },
  {
    path: '/workflow',
    name: 'AIWorkflow',
    component: () => import('../views/AIWorkflow.vue'),
  },
  {
    path: '/studio',
    name: 'VideoStudio',
    component: () => import('../views/VideoStudio.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/Settings.vue'),
  },
  {
    path: '/image-markup-preview',
    name: 'ImageMarkupPreview',
    component: () => import('../views/ImageMarkupPreviewPage.vue'),
  },
  {
    path: '/resource-manager',
    name: 'ResourceManager',
    component: () => import('../views/AIWorkflow/ResourceManagerWindow.vue'),
  },
]

const router = createRouter({
  history: isElectron() ? createWebHashHistory() : createWebHistory(),
  routes,
})

export default router
