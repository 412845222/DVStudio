
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
	{
		path: '/',
		name: 'AIWorkflow',
		component: () => import('../views/AIWorkflow.vue'),
	},
	{
		path: '/studio',
		name: 'VideoStudio',
		component: () => import('../views/VideoStudio.vue'),
	},
]

const router = createRouter({
	history: createWebHistory(),
	routes,
})

export default router

