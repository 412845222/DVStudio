import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

// 全局拦截浏览器默认交互：避免右键菜单/保存网页干扰编辑器体验
window.addEventListener('contextmenu', (e) => {
	e.preventDefault()
})

// 统一派发“时间轴前进/后退”事件（用于把浏览器 Back/Forward 映射为时间轴滚动）
const dispatchTimelineNav = (dir: -1 | 1) => {
	window.dispatchEvent(new CustomEvent('dweb:timeline-nav', { detail: { dir } }))
}

window.addEventListener(
	'keydown',
	(e) => {
		// Ctrl+S / Cmd+S: 阻止浏览器“保存网页”
		if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
			e.preventDefault()
			e.stopPropagation()
		}

		// 屏蔽浏览器“上一页/下一页”快捷键，并转为时间轴水平滚动
		// - Alt + ← / →
		// - BrowserBack / BrowserForward
		// 说明：这里做“全局屏蔽”，避免误触导致页面跳转。
		const isBack = (e.altKey && e.key === 'ArrowLeft') || e.key === 'BrowserBack'
		const isForward = (e.altKey && e.key === 'ArrowRight') || e.key === 'BrowserForward'
		if (isBack || isForward) {
			e.preventDefault()
			e.stopPropagation()
			dispatchTimelineNav(isBack ? -1 : 1)
		}
	},
	{ capture: true }
)

// 鼠标侧键（上一页/下一页）拦截：
// - MouseEvent.button: 3/4 通常对应 Back/Forward
// - MouseEvent.buttons: bitmask 8/16 对应 XButton1/XButton2
// 备注：不同浏览器/驱动可能只触发 auxclick。
const onMouseNav = (e: MouseEvent | PointerEvent) => {
	const me = e as MouseEvent
	const btn = me.button
	const mask = typeof (me as any).buttons === 'number' ? (me as any).buttons : 0
	const isBack = btn === 3 || (mask & 8) === 8
	const isForward = btn === 4 || (mask & 16) === 16
	if (!isBack && !isForward) return

	e.preventDefault()
	e.stopPropagation()
	// 更强的阻断，尽量在浏览器历史导航前截住
	;(e as any).stopImmediatePropagation?.()
	dispatchTimelineNav(isBack ? -1 : 1)
}

window.addEventListener('pointerdown', onMouseNav, { capture: true })
window.addEventListener('mousedown', onMouseNav, { capture: true })
window.addEventListener('mouseup', onMouseNav, { capture: true })
window.addEventListener('auxclick', onMouseNav as any, { capture: true })

// 兜底：某些浏览器/鼠标驱动会直接触发“历史回退”而吞掉页面可监听的鼠标事件。
// 这里用 popstate 拦截回退，并转成时间轴后退。
// 说明：会禁用浏览器历史回退（满足“屏蔽上一页/下一页”的目标）。
const enableHistoryBackTrap = () => {
	try {
		// 追加一个同 URL 的 state，让 back 先落到站内，再由 popstate 兜底拦截。
		history.pushState({ __dweb_trap: true }, document.title, window.location.href)
	} catch {
		// ignore
	}

	window.addEventListener(
		'popstate',
		(e) => {
			// 尽量阻止路由/其它监听器处理
			e.stopPropagation()
			;(e as any).stopImmediatePropagation?.()
			// 回到当前页，避免真正发生历史回退
			try {
				history.go(1)
			} catch {
				// ignore
			}
			dispatchTimelineNav(-1)
		},
		{ capture: true } as any
	)
}

createApp(App).use(router).mount('#app')

enableHistoryBackTrap()
