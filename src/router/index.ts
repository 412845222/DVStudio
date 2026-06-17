
import { createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getBackendStatus, getSetupState, isElectron, pingBackend } from '../electronBridge'

const routes: RouteRecordRaw[] = [
	{
		path: '/welcome',
		name: 'Welcome',
		component: () => import('../views/WelCome.vue'),
	},
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
	{
		path: '/settings',
		name: 'Settings',
		component: () => import('../views/Settings.vue'),
	},
]

const router = createRouter({
	history: isElectron() ? createWebHashHistory() : createWebHistory(),
	routes,
})

const PROTECTED_ROUTES = new Set(['VideoStudio'])
const REQUIRED_SETUP_STEP_KEYS = [
	'python',
	'resource',
	'venv',
	'djangoProject',
	'django',
	'dependencyCheck',
	'dependencyInstall',
]

async function isEnvironmentReadyForProjectRoutes() {
	if (!isElectron()) return true

	const st = await getSetupState()
	if (!st) return false
	if (st.running) return false

	const map = new Map((st.steps || []).map((s) => [s.key, s.status]))
	for (const key of REQUIRED_SETUP_STEP_KEYS) {
		if (map.get(key) !== 'ok') return false
	}

	const backend = await getBackendStatus()
	if (!backend?.running) return false

	const ping = await pingBackend()
	return !!ping?.ok
}

router.beforeEach(async (to) => {
	if (!isElectron()) return true
	if (to.name === 'Welcome') return true
	if (!PROTECTED_ROUTES.has(String(to.name || ''))) return true

	const ready = await isEnvironmentReadyForProjectRoutes()
	if (ready) return true

	return {
		name: 'Welcome',
		query: {
			from: String(to.fullPath || '/'),
		},
	}
})

export default router

