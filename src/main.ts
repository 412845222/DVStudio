import { createApp } from 'vue'
import './style.css'
import './styles/workflow/index.css'
import './styles/theme-tokens.css'
import App from './App.vue'
import router from './router'
import { editorPersistence, setEditorSaveHandler } from './adapters/editorPersistence'
import { editorRecentCache } from './adapters/editorRecentCache'
import { dispatchDvsTimelineNav } from './adapters/windowEventBridge'
import {
	DVS_EVENTS,
	type DvsEditorNodeDeleteDetail,
	type DvsEditorNodePatchDetail
} from './core/events/dvsEvents'
import { VideoSceneStore } from './store/videoscene'
import { TimelineStore } from './store/timeline'
import { I18nStore } from './store/i18n'
import { createI18n } from './i18n'
import { getAppName } from './network/appInfo'

if (typeof document !== 'undefined' && document.title) {
	try {
		document.title = getAppName()
	} catch {
		// ignore
	}
}

// 运行环境标记：Web 模式默认注入；Electron 模式由 preload 注入（且可能是只读属性）。
const w = window as unknown as Record<string, unknown>
if (!w.__DWEB_RUNTIME__) {
	w.__DWEB_RUNTIME__ = { platform: 'web', isElectron: false } as unknown
}

// 全局拦截浏览器默认交互：避免右键菜单/保存网页干扰编辑器体验
window.addEventListener('contextmenu', (e) => {
	e.preventDefault()
})

// 保存：将当前项目（含时间轴所有图层数据）写入网页缓存（localStorage）
setEditorSaveHandler((payload) => {
	editorRecentCache.save(payload)
})

window.addEventListener(
	'keydown',
	(e) => {
		const target = e.target as HTMLElement | null
		const tag = (target?.tagName || '').toLowerCase()
		const isEditable =
			tag === 'input' ||
			tag === 'textarea' ||
			(target as { isContentEditable?: boolean } | null)?.isContentEditable === true

		// Ctrl+S / Cmd+S: 阻止浏览器“保存网页”
		if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
			e.preventDefault()
			e.stopPropagation()
			// Allow dialogs to override save behavior (e.g., apply changes)
			const ok = window.dispatchEvent(new CustomEvent('dvs:shortcut/save', { cancelable: true }))
			if (ok) void editorPersistence.save()
			return
		}

		// Ctrl+Z/Ctrl+Y: 撤销/重做（输入框内交给浏览器原生文本撤销）
		if (
			!isEditable &&
			(e.ctrlKey || e.metaKey) &&
			!e.shiftKey &&
			(e.key === 'z' || e.key === 'Z')
		) {
			e.preventDefault()
			e.stopPropagation()
			editorPersistence.undo()
			return
		}
		if (!isEditable && (e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault()
			e.stopPropagation()
			editorPersistence.redo()
			return
		}

		// Backspace/Delete: 删除选中节点（仅在非输入框且确实有舞台选中时触发）
		if (!isEditable && (e.key === 'Backspace' || e.key === 'Delete')) {
			const selected = Array.isArray(VideoSceneStore.state.selectedNodeIds)
				? VideoSceneStore.state.selectedNodeIds
				: []
			if (selected.length) {
				e.preventDefault()
				e.stopPropagation()
				void VideoSceneStore.dispatch('deleteSelectedNodes')
				return
			}
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
			dispatchDvsTimelineNav(isBack ? -1 : 1, 'keyboard')
		}
	},
	{ capture: true }
)

// Agent/UI 或外部集成：通过 window 事件执行节点“修改/删除”
window.addEventListener(DVS_EVENTS.EditorNodePatched, (e) => {
	const detail = (e as CustomEvent<DvsEditorNodePatchDetail>).detail
	if (!detail || typeof detail.nodeId !== 'string' || !detail.nodeId.trim()) return
	void VideoSceneStore.dispatch('patchNodeById', {
		nodeId: detail.nodeId,
		layerId: detail.layerId,
		patch: {
			name: detail.patch?.name as unknown,
			userType: detail.patch?.userType as unknown,
			transform: detail.patch?.transform ?? undefined,
			props: detail.patch?.props ?? undefined
		}
	})
})

window.addEventListener(DVS_EVENTS.EditorNodeDeleted, (e) => {
	const detail = (e as CustomEvent<DvsEditorNodeDeleteDetail>).detail
	if (!detail || typeof detail.nodeId !== 'string' || !detail.nodeId.trim()) return
	void VideoSceneStore.dispatch('deleteNodeById', {
		nodeId: detail.nodeId,
		layerId: detail.layerId
	})
})

// NOTE:
// 不要在“删除节点”时全局清理时间轴里所有快照对该 nodeId 的引用。
// 关键帧语义：每个关键帧的内容应彼此独立；删除前一个关键帧里的节点不应影响后续关键帧。
// 当前实现改为：由 VideoScene 在“当前单选关键帧格子”下按需写回该关键帧快照。

// 鼠标侧键（上一页/下一页）拦截：
// - MouseEvent.button: 3/4 通常对应 Back/Forward
// - MouseEvent.buttons: bitmask 8/16 对应 XButton1/XButton2
// 备注：不同浏览器/驱动可能只触发 auxclick。
let lastMouseNavAt = 0
let lastMouseNavDir: -1 | 1 | 0 = 0
const onMouseNav = (e: MouseEvent | PointerEvent) => {
	const me = e as MouseEvent
	const btn = me.button
	const mask =
		typeof (me as { buttons?: unknown }).buttons === 'number'
			? (me as { buttons: number }).buttons
			: 0
	const isBack = btn === 3 || (mask & 8) === 8
	const isForward = btn === 4 || (mask & 16) === 16
	if (!isBack && !isForward) return

	// One physical click can fire multiple events (e.g. pointerdown + auxclick, or down/up pairs)
	// depending on browser/driver. De-dupe to avoid scrolling twice.
	const dir: -1 | 1 = isBack ? -1 : 1
	const now =
		typeof performance !== 'undefined' && typeof performance.now === 'function'
			? performance.now()
			: Date.now()
	if (dir === lastMouseNavDir && now - lastMouseNavAt < 250) return
	lastMouseNavAt = now
	lastMouseNavDir = dir

	e.preventDefault()
	e.stopPropagation()
	// 更强的阻断，尽量在浏览器历史导航前截住
	;(e as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
	dispatchDvsTimelineNav(dir, 'browser')
}

window.addEventListener('pointerdown', onMouseNav, { capture: true })
window.addEventListener('auxclick', onMouseNav as EventListener, { capture: true })

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
			;(e as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
			// 回到当前页，避免真正发生历史回退
			try {
				history.go(1)
			} catch {
				// ignore
			}
			dispatchDvsTimelineNav(-1, 'browser')
		},
		{ capture: true }
	)
}

const app = createApp(App)
app.use(createI18n())
app.use(router)

void I18nStore.dispatch('initLocale').then(() => {
	app.mount('#app')
	enableHistoryBackTrap()
})
