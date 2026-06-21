<template>
	<nav
		class="global-side-nav"
		:class="{ expanded: expandedState, collapsed: isCollapsed }"
		aria-label="全局导航"
		@mouseenter="onHover(true)"
		@mouseleave="onHover(false)"
	>
		<!-- 漂浮方块粒子背景 -->
		<div class="gsn-particles" aria-hidden="true">
			<span
				v-for="p in particles"
				:key="p.id"
				class="gsn-particle"
				:style="p.style"
			/>
		</div>

		<!-- 收缩态：只显示一个展开按钮 -->
		<button
			v-if="isCollapsed"
			class="gsn-toggle gsn-toggle-expand"
			type="button"
			@click="toggleCollapsed"
			aria-label="展开导航"
			title="展开导航"
		>
			<svg viewBox="0 0 24 24" fill="none">
				<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8"
					stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>

		<!-- 展开态：折叠按钮 + 导航项 -->
		<template v-else>
			<button
				class="gsn-toggle gsn-toggle-collapse"
				type="button"
				@click="toggleCollapsed"
				aria-label="收起导航"
				title="收起导航"
			>
				<svg viewBox="0 0 24 24" fill="none">
					<path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8"
						stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>

			<button
				v-for="item in items"
				:key="item.key"
				class="gsn-item"
				:class="{ active: item.active }"
				type="button"
				@click="onSelect(item.key)"
				:title="item.label"
			>
				<span class="gsn-icon" aria-hidden="true">
					<svg v-if="item.key === 'projects'" viewBox="0 0 24 24" fill="none">
						<path
							d="M4 5h7l2 2h7v12H4z"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linejoin="round"
						/>
					</svg>
					<svg v-else-if="item.key === 'workflow'" viewBox="0 0 24 24" fill="none">
						<circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.8" />
						<circle cx="18" cy="6" r="2" stroke="currentColor" stroke-width="1.8" />
						<circle cx="12" cy="18" r="2" stroke="currentColor" stroke-width="1.8" />
						<path d="M8 7.2L10.6 16.8M16 7.2L13.4 16.8M8 6h8"
							stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
					</svg>
					<svg v-else-if="item.key === 'studio'" viewBox="0 0 24 24" fill="none">
						<rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8" />
						<path d="M8 20h8M10 18v2M14 18v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
						<path d="M7.5 9.5h9M7.5 13h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
					</svg>
					<svg v-else viewBox="0 0 24 24" fill="none">
						<path
							d="M12 3.5l2 1.2 2.3-.3.9 2.1 2.1.9-.3 2.3 1.2 2-1.2 2 .3 2.3-2.1.9-.9 2.1-2.3-.3-2 1.2-2-1.2-2.3.3-.9-2.1-2.1-.9.3-2.3-1.2-2 1.2-2-.3-2.3 2.1-.9.9-2.1 2.3.3 2-1.2z"
							stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
						<circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6" />
					</svg>
				</span>
				<span class="gsn-label">{{ item.label }}</span>
			</button>
		</template>
	</nav>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{
	expanded: boolean
	collapsed: boolean
}>()

const emit = defineEmits<{
	(e: 'expand-change', expanded: boolean): void
	(e: 'collapsed-change', collapsed: boolean): void
}>()

const route = useRoute()
const router = useRouter()

// 内部状态：受控于 props.expanded / props.collapsed，hover 时临时展开
const expandedState = ref(props.expanded)
const isCollapsed = ref(props.collapsed)

watch(() => props.expanded, v => { expandedState.value = v })
watch(() => props.collapsed, v => { isCollapsed.value = v })

// 随机生成粒子（与项目主题色一致的翡翠/青绿配色）
// 颜色取自 src/styles/theme-tokens.css：
//   --theme-accent: #1f9d84 / --theme-accent-hover: #27b99c
//   --theme-success: #17a773 / --aiwf-color-success: #4caf88
type Particle = { id: number; style: Record<string, string> }
const particleCount = 10
const palette = [
	'#1f9d84',
	'#27b99c',
	'#17a773',
	'#4caf88',
	'#148a73',
	'#2ec4a6',
]

const particles = ref<Particle[]>([])

function buildParticles(): Particle[] {
	const list: Particle[] = []
	for (let i = 0; i < particleCount; i++) {
		const size = 3 + Math.round(Math.random() * 4)
		const left = 6 + Math.random() * 88
		const top = 6 + Math.random() * 88
		const delay = Math.random() * 3.5
		const duration = 5 + Math.random() * 6
		const rotate = Math.round(Math.random() * 180)
		const color = palette[i % palette.length]
		const opacity = (0.35 + Math.random() * 0.45).toFixed(2)
		list.push({
			id: i,
			style: {
				width: size + 'px',
				height: size + 'px',
				left: left + '%',
				top: top + '%',
				animationDelay: delay + 's',
				animationDuration: duration + 's',
				transform: `rotate(${rotate}deg)`,
				background: color,
				'--color': color,
				'--base-opacity': opacity,
			},
		})
	}
	return list
}

let particlesTimer: number | null = null

function refreshParticlesSoon() {
	if (particlesTimer !== null) {
		window.clearTimeout(particlesTimer)
	}
	particlesTimer = window.setTimeout(() => {
		particles.value = buildParticles()
	}, 60)
}

onMounted(() => {
	particles.value = buildParticles()
})

onBeforeUnmount(() => {
	if (particlesTimer !== null) window.clearTimeout(particlesTimer)
})

const items = computed(() => [
	{ key: 'projects', label: '项目列表', active: route.name === 'ProjectList' },
	{ key: 'workflow', label: 'AI素材工作流', active: route.name === 'AIWorkflow' },
	{ key: 'studio', label: '动画编辑器', active: route.name === 'VideoStudio' },
	{ key: 'settings', label: '设置', active: route.name === 'Settings' },
])

function onHover(v: boolean) {
	if (isCollapsed.value) return
	if (expandedState.value === v) return
	emit('expand-change', v)
}

const LAST_PROJECT_KEY = 'dweb.aiworkflow.lastProjectId.v1'

function getLastProjectId(): number | null {
	const raw = localStorage.getItem(LAST_PROJECT_KEY)
	const id = Number(raw)
	return Number.isFinite(id) && id > 0 ? id : null
}

function onSelect(key: string) {
	if (key === 'projects') void router.push({ name: 'ProjectList' })
	if (key === 'workflow') {
		const lastId = getLastProjectId()
		if (lastId) {
			void router.push({ name: 'AIWorkflow', query: { projectId: String(lastId) } })
		} else {
			void router.push({ name: 'AIWorkflow' })
		}
	}
	if (key === 'studio') void router.push({ name: 'VideoStudio' })
	if (key === 'settings') void router.push({ name: 'Settings' })
}

function toggleCollapsed() {
	const next = !isCollapsed.value
	isCollapsed.value = next
	emit('collapsed-change', next)
	if (!next) {
		// 重新展开时刷新粒子
		refreshParticlesSoon()
	}
}
</script>

<style scoped>
.global-side-nav {
	position: fixed;
	left: 16px;
	top: 50%;
	bottom: auto;
	transform: translateY(-50%);
	width: 56px;
	box-sizing: border-box;
	padding: 12px 6px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #3aa8b4) 35%, transparent);
	background: color-mix(in srgb, var(--theme-bg-primary, #181818) 60%, transparent);
	backdrop-filter: blur(16px) saturate(140%);
	-webkit-backdrop-filter: blur(16px) saturate(140%);
	box-shadow:
		0 10px 32px rgba(0, 0, 0, 0.45),
		0 2px 6px rgba(0, 0, 0, 0.25),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #3aa8b4) 8%, transparent);
	transition:
		width 280ms cubic-bezier(0.22, 0.61, 0.36, 1),
		left 380ms cubic-bezier(0.22, 0.61, 0.36, 1),
		top 380ms cubic-bezier(0.22, 0.61, 0.36, 1),
		transform 380ms cubic-bezier(0.22, 0.61, 0.36, 1),
		padding 220ms ease,
		border-color 220ms ease,
		background 220ms ease,
		box-shadow 220ms ease,
		opacity 280ms ease;
	z-index: 70;
	overflow: hidden;
}

/* hover 展开 */
.global-side-nav.expanded {
	width: 184px;
	padding: 12px 10px;
	align-items: stretch;
	box-shadow:
		0 14px 42px rgba(0, 0, 0, 0.5),
		0 2px 6px rgba(0, 0, 0, 0.28),
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #3aa8b4) 14%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 45%, transparent);
}

/* 完全收起：只有一个小按钮，漂到左下角 */
.global-side-nav.collapsed {
	top: auto;
	bottom: 18px;
	transform: translateY(0);
	width: 44px;
	padding: 4px;
	gap: 0;
	justify-content: center;
}

/* 粒子层 */
.gsn-particles {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
	opacity: 0.85;
}

.gsn-particle {
	position: absolute;
	display: block;
	box-shadow: 0 0 6px var(--color, #1f9d84);
	animation: gsn-drift 7s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
	opacity: var(--base-opacity, 0.6);
}

@keyframes gsn-drift {
	0% {
		transform: translateY(0) translateX(0) rotate(0deg);
		opacity: 0;
	}
	15% {
		opacity: var(--base-opacity, 0.6);
	}
	50% {
		transform: translateY(-18px) translateX(6px) rotate(90deg);
	}
	85% {
		opacity: var(--base-opacity, 0.6);
	}
	100% {
		transform: translateY(-36px) translateX(-4px) rotate(180deg);
		opacity: 0;
	}
}

.global-side-nav.collapsed .gsn-particles {
	opacity: 1;
}

.global-side-nav.collapsed .gsn-particles .gsn-particle {
	animation-duration: 4.5s;
}

/* 折叠/展开切换按钮 */
.gsn-toggle {
	position: relative;
	z-index: 1;
	width: 100%;
	height: 36px;
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #3aa8b4) 30%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 12%, transparent);
	color: var(--theme-accent, #3aa8b4);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 160ms ease, border-color 160ms ease, transform 140ms ease;
}

.gsn-toggle:hover {
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 22%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 60%, transparent);
}

.gsn-toggle:active {
	transform: scale(0.96);
}

.gsn-toggle svg {
	width: 18px;
	height: 18px;
}

.global-side-nav.collapsed .gsn-toggle-expand {
	height: 40px;
	width: 40px;
	border: 1px solid color-mix(in srgb, var(--theme-accent, #3aa8b4) 45%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 16%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--theme-accent, #3aa8b4) 35%, transparent);
}

/* 普通导航项 */
.gsn-item {
	position: relative;
	z-index: 1;
	box-sizing: border-box;
	appearance: none;
	-webkit-appearance: none;
	width: 100%;
	height: 40px;
	flex: 0 0 40px;
	border: 1px solid transparent;
	background: transparent;
	color: var(--theme-text-primary, #d4d4d4);
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0;
	padding: 0;
	margin: 0;
	cursor: pointer;
	overflow: hidden;
	transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
}

.global-side-nav.expanded .gsn-item {
	justify-content: flex-start;
	padding: 0 12px;
	gap: 12px;
}

.gsn-item:hover {
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 10%, transparent);
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 35%, transparent);
	color: var(--theme-accent, #3aa8b4);
}

.gsn-item.active {
	border-color: color-mix(in srgb, var(--theme-accent, #3aa8b4) 65%, transparent);
	background: color-mix(in srgb, var(--theme-accent, #3aa8b4) 20%, transparent);
	color: var(--theme-accent, #3aa8b4);
	box-shadow:
		inset 0 0 0 1px color-mix(in srgb, var(--theme-accent, #3aa8b4) 25%, transparent),
		0 0 14px color-mix(in srgb, var(--theme-accent, #3aa8b4) 22%, transparent);
}

.gsn-icon {
	width: 22px;
	height: 22px;
	flex: 0 0 22px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.gsn-icon svg {
	width: 20px;
	height: 20px;
	display: block;
}

.gsn-label {
	max-width: 0;
	opacity: 0;
	white-space: nowrap;
	transition: max-width 180ms ease, opacity 140ms ease;
	font-size: 12.5px;
	color: inherit;
	flex: 0 0 auto;
	min-width: 0;
	letter-spacing: 0.02em;
}

.global-side-nav.expanded .gsn-label {
	max-width: 160px;
	opacity: 1;
}
</style>
