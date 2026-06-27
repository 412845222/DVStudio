const isEditableEventTarget = (target: EventTarget | null) => {
	const element = target as HTMLElement | null
	if (!element) return false
	if (element.closest('input, textarea, [contenteditable="true"], [contenteditable=""]'))
		return true
	if (element.closest('[data-aiwf-text-selectable="true"]')) return true
	return false
}

export const useAIWorkflowKeyboardAndResize = (payload: {
	isRouteActive: () => boolean
	getSelectedNodeIds: () => string[]
	getSelectedEdgeId: () => string | null
	selectAllNodes: () => void
	pasteNodesAtCanvasCenter: () => void
	pasteMediaData: (clipboardData: DataTransfer | null) => Promise<boolean> | boolean
	copySelectedNodes: (primaryNodeId: string) => void
	undo: () => void
	redo: () => void
	removeSelectedNodes: (nodeIds: string[]) => void
	removeSelectedEdge: (edgeId: string) => void
	scheduleAsyncEdgeRender: () => void
}) => {
	const onWorkflowKeyDown = (ev: KeyboardEvent) => {
		if (!payload.isRouteActive()) return
		if (isEditableEventTarget(ev.target ?? null)) return

		const activeEl = document.activeElement as HTMLElement | null
		if (activeEl?.dataset?.wfSceneLayoutCanvas === 'true') return

		const key = String(ev.key || '').toLowerCase()
		const mod = ev.ctrlKey || ev.metaKey

		if (mod && key === 'a') {
			ev.preventDefault()
			payload.selectAllNodes()
			return
		}

		if (mod && key === 'c') {
			ev.preventDefault()
			const selected = payload.getSelectedNodeIds()
			if (selected.length > 0) {
				payload.copySelectedNodes(selected[0])
			}
			return
		}

		// Ctrl+V：默认交由下面的 paste 事件处理，paste 事件会识别媒体；
		// 只有在明确无剪贴板内容或 paste 事件未触发时才 fallback。
		// 注意：此处不做 preventDefault，让浏览器派发原生 paste 事件。

		if (mod && key === 'z') {
			ev.preventDefault()
			if (ev.shiftKey) {
				payload.redo()
			} else {
				payload.undo()
			}
			return
		}

		if (mod && key === 'y') {
			ev.preventDefault()
			payload.redo()
			return
		}

		if (key === 'backspace' || key === 'delete') {
			const selected = payload.getSelectedNodeIds()
			if (!selected.length) {
				const selectedEdgeId = String(payload.getSelectedEdgeId() ?? '').trim()
				if (!selectedEdgeId) return
				ev.preventDefault()
				payload.removeSelectedEdge(selectedEdgeId)
				return
			}
			ev.preventDefault()
			payload.removeSelectedNodes(selected)
		}
	}

	// 处理 Ctrl+V 时来自操作系统的文件/图片/URL 粘贴。
	// 优先走 paste 事件，可以直接拿到 clipboardData。
	const onWorkflowPaste = (ev: ClipboardEvent) => {
		if (!payload.isRouteActive()) return
		if (isEditableEventTarget(ev.target ?? null)) return

		const activeEl = document.activeElement as HTMLElement | null
		if (activeEl?.dataset?.wfSceneLayoutCanvas === 'true') return

		const cd = ev.clipboardData ?? null
		if (!cd) return

		// 判断剪贴板是否含有媒体内容（文件/图片）——是则拦截，否则交给默认（或页面其他逻辑）。
		const hasFiles = Array.from(cd.items ?? []).some((it) => it.kind === 'file')
		if (!hasFiles) {
			// 无文件：尝试识别 URL（来自浏览器地址栏等的粘贴）
			const text = (cd.getData('text') ?? '').trim()
			if (!text) return
			const isHttpUrl = /^https?:\/\//i.test(text)
			if (!isHttpUrl) return
		}

		ev.preventDefault()
		const handled = payload.pasteMediaData(cd)
		const handledPromise = Promise.resolve(handled)
		handledPromise.then((ok) => {
			if (!ok) payload.pasteNodesAtCanvasCenter()
		})
	}

	const onContentResize = () => {
		payload.scheduleAsyncEdgeRender()
	}

	const mountWindowEvents = () => {
		window.addEventListener('keydown', onWorkflowKeyDown, true)
		window.addEventListener('paste', onWorkflowPaste as EventListener, true)
		window.addEventListener('dweb:content/resize', onContentResize as EventListener, true)
	}

	const unmountWindowEvents = () => {
		window.removeEventListener('keydown', onWorkflowKeyDown, true)
		window.removeEventListener('paste', onWorkflowPaste as EventListener, true)
		window.removeEventListener('dweb:content/resize', onContentResize as EventListener, true)
	}

	return {
		onWorkflowKeyDown,
		onContentResize,
		mountWindowEvents,
		unmountWindowEvents
	}
}
