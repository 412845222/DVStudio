<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalized, type NavigationGuardNext } from 'vue-router'
import { ThemeStore } from '../../store/theme'

const props = defineProps<{
	disabled?: boolean
}>()

// —— 动画状态 ——
// 遮罩是否可见（进入动画、粒子下落阶段、退出动画三个阶段共用）
const visible = ref(false)
// 进度条百分比（0 → 100，带停顿与冲刺）
const progress = ref(0)
// 当前目标页面的中文名称
const currentLabel = ref('')

// —— 粒子（与项目主题色一致的翡翠/青绿配色，深浅色各一套）——
type Particle = { id: number; style: Record<string, string> }
const particleCount = 22

// 深色模式调色板（适合暗色背景，粒子色更亮，带发光感）
const darkPalette = [
	'#1f9d84',
	'#27b99c',
	'#17a773',
	'#4caf88',
	'#148a73',
	'#2ec4a6',
	'#0f6d5c',
]

// 浅色模式调色板（适合亮色背景，主色稍深以保证对比）
const lightPalette = [
	'#17a773',
	'#1f9d84',
	'#0f6d5c',
	'#27b99c',
	'#2ec4a6',
	'#4caf88',
	'#148a73',
]

// 根据当前主题选择调色板
function currentPalette(): string[] {
	return ThemeStore.getters.isDarkMode ? darkPalette : lightPalette
}
const particles = ref<Particle[]>([])

function buildParticles(): Particle[] {
	const list: Particle[] = []
	const palette = currentPalette()
	for (let i = 0; i < particleCount; i++) {
		const size = 4 + Math.round(Math.random() * 7)
		const left = Math.random() * 100
		const top = -10 - Math.random() * 10
		const delay = Math.random() * 0.6
		const duration = 1.8 + Math.random() * 1.0
		const rotate = Math.round(Math.random() * 360)
		const color = palette[i % palette.length]
		const opacity = (0.55 + Math.random() * 0.4).toFixed(2)
		const sway = (-20 + Math.random() * 40).toFixed(2)
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
				'--sway': sway + 'px',
			},
		})
	}
	return list
}

// —— 进度条动画 ——
let rafId: number | null = null

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3)
}

function animateTo(target: number, durationMs: number): Promise<void> {
	return new Promise<void>((resolve) => {
		if (rafId !== null) {
			window.cancelAnimationFrame(rafId)
			rafId = null
		}
		const start = performance.now()
		const from = progress.value
		function step(now: number) {
			const elapsed = now - start
			const t = Math.min(1, elapsed / durationMs)
			progress.value = from + (target - from) * easeOutCubic(t)
			if (t < 1) {
				rafId = window.requestAnimationFrame(step)
			} else {
				rafId = null
				resolve()
			}
		}
		rafId = window.requestAnimationFrame(step)
	})
}

function sleep(ms: number): Promise<void> {
	return new Promise<void>((r) => setTimeout(r, ms))
}

// —— 路由拦截 ——
const route = useRoute()
const router = useRouter()

const NAV_LABELS: Record<string, string> = {
	ProjectList: '项目列表',
	Welcome: '欢迎',
	AIWorkflow: 'AI 素材工作流',
	VideoStudio: '动画编辑器',
	Settings: '设置',
}

const isDisabled = computed(() => Boolean(props.disabled))

// 最少播放时间（毫秒）：确保至少完整播放一次粒子下落动画
const MIN_TRANSITION_MS = 2400

// 防止在 overlay 仍在播放时重复导航
let navigationInFlight = false

const beforeHook = async (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
	if (isDisabled.value) { next(); return }
	// 初始加载或同页面跳转不触发
	if (!from || !from.name || from.name === to.name) { next(); return }

	if (navigationInFlight) {
		// 正在过渡中：直接跳过并让其继续
		next(false)
		return
	}
	navigationInFlight = true

	// —— 阶段 A：显示遮罩 + 粒子，进度条从 0% → 60% ——
	particles.value = buildParticles()
	currentLabel.value = NAV_LABELS[String(to.name)] || '切换中'
	progress.value = 0
	visible.value = true

	await Promise.all([
		animateTo(62, 900),
		sleep(220), // 保留一小段让粒子进入并稳定
	])

	// —— 阶段 B：中等保持阶段（60% → 80%）——
	await animateTo(82, 700)

	// —— 阶段 C：放行导航 ——
	// 导航的切换将在 vue-router 内部发生（即 <router-view> 的切换）
	next()
}

const afterHook = async (to: RouteLocationNormalized, from: RouteLocationNormalized) => {
	if (isDisabled.value) { resetState(); return }
	if (!from || !from.name || from.name === to.name) { resetState(); return }

	// —— 阶段 D：冲刺到 100% 并淡出 ——
	try {
		await animateTo(100, 420)
	} catch (_) { /* ignore */ }
	// 给用户留下一小段 100% 感知，再淡出
	await sleep(280)

	visible.value = false
	// 淡出结束后重置
	await sleep(360)
	progress.value = 0
	navigationInFlight = false
}

function resetState() {
	visible.value = false
	progress.value = 0
	navigationInFlight = false
}

let registered = false

onMounted(() => {
	if (registered) return
	registered = true
	router.beforeEach(beforeHook)
	router.afterEach(afterHook)
	router.onError(() => resetState())
})

onBeforeUnmount(() => {
	if (rafId !== null) window.cancelAnimationFrame(rafId)
	rafId = null
	navigationInFlight = false
})
</script>

<template>
	<Transition name="pto-fade">
		<div v-if="visible" class="pto-overlay" aria-hidden="true">
			<div class="pto-blur" />

			<div class="pto-particles" aria-hidden="true">
				<span
					v-for="p in particles"
					:key="p.id"
					class="pto-particle"
					:style="p.style"
				/>
			</div>

			<div class="pto-panel">
				<div class="pto-label">{{ currentLabel }}</div>
				<div class="pto-bar">
					<div
						class="pto-bar-fill"
						:style="{ width: progress + '%' }"
					/>
					<div class="pto-bar-shimmer" />
				</div>
				<div class="pto-percent">{{ Math.round(progress) }}%</div>
			</div>
		</div>
	</Transition>
</template>

<style scoped>
.pto-overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 900;
	display: flex;
	align-items: center;
	justify-content: center;
}

.pto-blur {
	position: absolute;
	inset: 0;
	background: var(--pto-overlay-bg, color-mix(in srgb, var(--theme-bg-secondary, #1e1e1e) 62%, transparent));
	backdrop-filter: blur(18px) saturate(140%);
	-webkit-backdrop-filter: blur(18px) saturate(140%);
}

/* —— 过渡进入/退出的淡入淡出 —— */
.pto-fade-enter-active,
.pto-fade-leave-active {
	transition: opacity 280ms ease;
}
.pto-fade-enter-from,
.pto-fade-leave-to {
	opacity: 0;
}

/* —— 粒子 —— */
.pto-particles {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
}

.pto-particle {
	position: absolute;
	display: block;
	box-shadow:
		0 0 8px var(--color, var(--theme-accent, #1f9d84)),
		0 0 2px var(--color, var(--theme-accent, #1f9d84));
	opacity: var(--base-opacity, 0.7);
	animation: pto-fall 2.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}

@keyframes pto-fall {
	0% {
		transform: translateY(0) translateX(0) rotate(0deg);
		opacity: 0;
	}
	10% {
		opacity: var(--base-opacity, 0.7);
	}
	50% {
		transform: translateY(50vh) translateX(var(--sway, 0)) rotate(180deg);
	}
	90% {
		opacity: var(--base-opacity, 0.7);
	}
	100% {
		transform: translateY(110vh) translateX(calc(var(--sway, 0) * -1)) rotate(540deg);
		opacity: 0;
	}
}

/* —— 信息面板 —— */
.pto-panel {
	position: relative;
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 14px 22px 14px 18px;
	min-width: 320px;
	background: var(--pto-panel-bg, rgba(14, 22, 20, 0.78));
	border: 1px solid var(--pto-panel-border, color-mix(in srgb, var(--theme-accent, #1f9d84) 50%, transparent));
	box-shadow:
		var(--pto-panel-shadow-1, 0 16px 48px rgba(0, 0, 0, 0.6)),
		var(--pto-panel-shadow-2, 0 0 0 1px color-mix(in srgb, var(--theme-accent, #1f9d84) 18%, transparent));
	z-index: 2;
}

.pto-label {
	font-size: 13px;
	color: var(--pto-label-color, var(--theme-text-primary, #d4d4d4));
	font-weight: 500;
	letter-spacing: 0.02em;
	white-space: nowrap;
}

.pto-bar {
	position: relative;
	width: 220px;
	height: 8px;
	background: var(--pto-bar-track-bg, color-mix(in srgb, var(--theme-accent, #1f9d84) 8%, transparent));
	border: 1px solid var(--pto-bar-track-border, color-mix(in srgb, var(--theme-accent, #1f9d84) 25%, transparent));
	overflow: hidden;
	flex: 1;
}

.pto-bar-fill {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	background: var(--pto-bar-fill, linear-gradient(90deg, #0f6d5c 0%, #17a773 25%, #1f9d84 55%, #27b99c 80%, #2ec4a6 100%));
	background-size: 200% 100%;
	box-shadow:
		0 0 12px var(--pto-bar-glow, color-mix(in srgb, var(--theme-accent, #1f9d84) 45%, transparent)),
		inset 0 0 0 1px var(--pto-bar-inner-border, color-mix(in srgb, var(--theme-accent, #1f9d84) 22%, transparent));
	animation: pto-bar-shimmer 1.8s linear infinite;
}

@keyframes pto-bar-shimmer {
	0% { background-position: 200% 0; }
	100% { background-position: -200% 0; }
}

.pto-bar-shimmer {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background-image: linear-gradient(
		45deg,
		var(--pto-bar-shimmer, color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent)) 25%,
		transparent 25%,
		transparent 50%,
		var(--pto-bar-shimmer, color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent)) 50%,
		var(--pto-bar-shimmer, color-mix(in srgb, var(--theme-accent, #1f9d84) 40%, transparent)) 75%,
		transparent 75%,
		transparent
	);
	background-size: 10px 10px;
	opacity: 0.3;
	animation: pto-shimmer-drift 1.1s linear infinite;
}

@keyframes pto-shimmer-drift {
	from { background-position: 0 0; }
	to { background-position: 10px 0; }
}

.pto-percent {
	font-size: 11px;
	font-family: 'Cascadia Code', 'Consolas', 'Menlo', monospace;
	color: var(--pto-percent-color, var(--theme-accent, #1f9d84));
	min-width: 32px;
	text-align: right;
	letter-spacing: 0.04em;
}
</style>
