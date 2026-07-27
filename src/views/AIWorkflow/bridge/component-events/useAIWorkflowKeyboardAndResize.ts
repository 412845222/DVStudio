const DVSTUDIO_NODES_MIME = 'application/x-dvstudio-workflow-nodes'

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
	hasClipboardNodes: () => boolean
	undo: () => void
	redo: () => void
	removeSelectedNodes: (nodeIds: string[]) => void
	removeSelectedEdge: (edgeId: string) => void
	scheduleAsyncEdgeRender: () => void
}) => {
	const onWorkflowKeyDown = (ev: KeyboardEvent) => {
		if (!payload.isRouteActive()) return
		if (isEditableEventTarget(ev.target ?? null)) return

		const key = String(ev.key || '').toLowerCase()
		const mod = ev.ctrlKey || ev.metaKey

		if (mod && key === 'a') {
			ev.preventDefault()
			payload.selectAllNodes()
			return
		}

		// Ctrl+C：不在这里直接处理复制，而是让浏览器触发原生 copy 事件
		// 在 copy 事件中设置内部剪贴板并写入自定义 MIME 标记
		if (mod && key === 'c') {
			const selected = payload.getSelectedNodeIds()
			if (selected.length > 0) {
				// 执行内部复制
				payload.copySelectedNodes(selected[0])
				// 不 preventDefault，让浏览器触发 copy 事件以便我们写入自定义标记
				// 但我们会在 copy 事件中 preventDefault 阻止默认的文本/选区复制
			}
			return
		}

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

	// copy 事件：当用户在蓝图中按 Ctrl+C 复制节点时，向系统剪贴板写入自定义标记
	// 这样后续粘贴时能准确区分"内部节点粘贴"和"外部资产导入"
	const onWorkflowCopy = (ev: ClipboardEvent) => {
		if (!payload.isRouteActive()) return
		if (isEditableEventTarget(ev.target ?? null)) return

		const selected = payload.getSelectedNodeIds()
		if (selected.length === 0) return

		ev.preventDefault()
		const cd = ev.clipboardData
		if (cd) {
			// 写入自定义 MIME 标记，用于粘贴时识别
			cd.setData(DVSTUDIO_NODES_MIME, '1')
			// 写入一个空字符串覆盖默认的文本复制，避免泄露节点内容
			cd.setData('text/plain', '')
		}
	}

	// 处理 Ctrl+V 粘贴：
	// 1. 如果剪贴板包含我们的自定义标记（来自蓝图内的节点复制），粘贴节点
	// 2. 如果剪贴板包含文件/截图/HTTP URL，导入外部资产（系统截图、文件、网页图片等）
	// 3. 兜底：如果没有外部数据但内部有节点剪贴板数据，粘贴节点
	// 4. 节点粘贴后会消费（清空）内部剪贴板，不会永久拦截后续系统粘贴
	const onWorkflowPaste = (ev: ClipboardEvent) => {
		if (!payload.isRouteActive()) return
		if (isEditableEventTarget(ev.target ?? null)) return

		const cd = ev.clipboardData ?? null

		// 检查是否是我们自己复制的节点
		const isOurNodeCopy = cd && cd.getData(DVSTUDIO_NODES_MIME) === '1'
		if (isOurNodeCopy) {
			ev.preventDefault()
			if (payload.hasClipboardNodes()) {
				payload.pasteNodesAtCanvasCenter()
			}
			return
		}

		// 检测系统剪贴板中是否有外部可导入数据（文件/截图/URL）
		let hasExternalData = false
		if (cd) {
			const hasFiles = Array.from(cd.items ?? []).some(
				(it) => it.kind === 'file' || (it.type && it.type.startsWith('image/'))
			)
			if (hasFiles) {
				hasExternalData = true
			} else {
				const text = (cd.getData('text') ?? '').trim()
				if (text && /^https?:\/\//i.test(text)) {
					hasExternalData = true
				}
			}
		}

		if (hasExternalData && cd) {
			ev.preventDefault()
			const handled = payload.pasteMediaData(cd)
			Promise.resolve(handled).then((ok) => {
				if (!ok && payload.hasClipboardNodes()) {
					payload.pasteNodesAtCanvasCenter()
				}
			})
			return
		}

		// 系统剪贴板中没有外部数据：兜底尝试粘贴内部节点
		if (payload.hasClipboardNodes()) {
			ev.preventDefault()
			payload.pasteNodesAtCanvasCenter()
		}
	}

	const onContentResize = () => {
		payload.scheduleAsyncEdgeRender()
	}

	const mountWindowEvents = () => {
		window.addEventListener('keydown', onWorkflowKeyDown, true)
		window.addEventListener('copy', onWorkflowCopy as EventListener, true)
		window.addEventListener('paste', onWorkflowPaste as EventListener, true)
		window.addEventListener('dweb:content/resize', onContentResize as EventListener, true)
	}

	const unmountWindowEvents = () => {
		window.removeEventListener('keydown', onWorkflowKeyDown, true)
		window.removeEventListener('copy', onWorkflowCopy as EventListener, true)
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
