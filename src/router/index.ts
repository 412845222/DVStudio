import {
	createRouter,
	createWebHashHistory,
	createWebHistory,
	type RouteRecordRaw
} from 'vue-router'
import { isElectron } from '../electronBridge'

const routes: RouteRecordRaw[] = [
	{
		path: '/welcome',
		name: 'Welcome',
		component: () => import('../views/WelCome.vue')
	},
	{
		path: '/',
		name: 'ProjectList',
		component: () => import('../views/ProjectList.vue')
	},
	{
		path: '/workflow',
		name: 'AIWorkflow',
		component: () => import('../views/AIWorkflow.vue')
	},
	{
		path: '/studio',
		name: 'VideoStudio',
		component: () => import('../views/VideoStudio.vue')
	},
	{
		path: '/settings',
		name: 'Settings',
		component: () => import('../views/Settings.vue')
	},
	{
		path: '/image-markup-preview',
		name: 'ImageMarkupPreview',
		component: () => import('../views/ImageMarkupPreviewPage.vue')
	},
	{
		path: '/resource-manager',
		name: 'ResourceManager',
		component: () => import('../views/AIWorkflow/ResourceManagerWindow.vue')
	},
	{
		path: '/3d-editor',
		name: 'Model3DEditor',
		component: () => import('../views/Model3DEditorPage.vue')
	},
	{
		path: '/video-editor',
		name: 'VideoEditor',
		component: () => import('../views/VideoEditorPage.vue')
	},
	{
		path: '/template-center',
		name: 'TemplateCenter',
		component: () => import('../views/AIWorkflow/TemplateCenterWindow.vue')
	},
	{
		path: '/cloud-storage',
		name: 'CloudStorage',
		component: () => import('../views/CloudStorage/CloudStoragePage.vue')
	},
	{
		path: '/comfyui-setup',
		name: 'ComfyUISetup',
		component: () => import('../views/ComfyUISetupPage.vue')
	},
	{
		path: '/services',
		name: 'ServiceCenter',
		component: () => import('../views/ServiceCenterPage.vue')
	}
]

const router = createRouter({
	history: isElectron() ? createWebHashHistory() : createWebHistory(),
	routes
})

export default router
