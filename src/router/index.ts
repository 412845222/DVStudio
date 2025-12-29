
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
	{
		path: '/',
		name: 'VideoStudio',
		component: () => import('../views/VideoStudio.vue'),
	},
]

const router = createRouter({
	history: createWebHistory(),
	routes,
})

export default router

