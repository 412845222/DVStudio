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
	pasteMediaData: (
		clipboardData: DataTransfer | null,
		position?: { worldX: number; worldY: number }
	) => Promise<boolean> | boolean
	getMouseWorldPos: () => { worldX: number; worldY: number } | null
	copySelectedNodes: (primaryNodeId: string) => void
	hasClipboardNodes: () => boolean
	removeSelectedNodes: (nodeIds: string[]) => void
	removeSelectedEdge: (edgeId: string) => void
	scheduleAsyncEdgeRender: () => void
	saveProject?: () => void | Promise<void>
	// 可选：查询引擎侧 Canvas 虚拟输入框是否处于编辑态（蓝色临时框 / 绿色已保存分组框标签编辑）。
	// 返回 true 时，Backspace/Delete/Ctrl+C/Ctrl+V 等涉及节点操作的快捷键应直接放行，
	// 让事件继续沿 Window 冒泡阶段传递到图形底座 InputManager → BlueprintEditorTool.onKeyDown，
	// 由已有的 editing 分支负责处理 editText 修改、Enter/Escape 提交/取消等逻辑。
	getCanvasEditingState?: () => boolean
}) => {
	// 辅助函数：创建一个DataTransfer-like对象用于传递文件给pasteMediaData
	const createDataTransferFromFiles = (files: File[]): DataTransfer | null => {
		try {
			const dt = new DataTransfer()
			for (const f of files) {
				dt.items.add(f)
			}
			return dt
		} catch {
			return null
		}
	}

	// 主动通过navigator.clipboard.read()读取剪贴板（用于keydown Ctrl+V时paste事件不触发的场景）
	const readClipboardAndPaste = async (position?: { worldX: number; worldY: number }) => {
		console.log(
			'[AIWorkflow:MediaImport] readClipboardAndPaste: attempting to read clipboard via navigator.clipboard, position:',
			position
		)

		// 首先尝试使用navigator.clipboard.read() API（现代异步剪贴板API）
		if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
			try {
				const items = await navigator.clipboard.read()
				console.log(
					'[AIWorkflow:MediaImport] readClipboardAndPaste: clipboard items count:',
					items.length
				)
				const files: File[] = []
				let textContent = ''
				for (const item of items) {
					// 读取图片/视频/模型文件类型
					for (const type of item.types) {
						console.log(
							'[AIWorkflow:MediaImport] readClipboardAndPaste: clipboard item type:',
							type
						)
						if (
							type.startsWith('image/') ||
							type.startsWith('video/') ||
							type === 'model/gltf-binary' ||
							type === 'model/gltf+json'
						) {
							try {
								const blob = await item.getType(type)
								const ext = type.split('/')[1]?.split(';')[0] || 'bin'
								const fileName = `pasted-file-${Date.now()}.${ext}`
								const file = new File([blob], fileName, { type })
								files.push(file)
								console.log(
									'[AIWorkflow:MediaImport] readClipboardAndPaste: got file from clipboard:',
									{ name: fileName, type, size: blob.size }
								)
							} catch (err) {
								console.warn(
									'[AIWorkflow:MediaImport] readClipboardAndPaste: failed to get blob for type',
									type,
									err
								)
							}
						} else if (type === 'text/plain' || type === 'text/uri-list') {
							try {
								const blob = await item.getType(type)
								textContent = await blob.text()
							} catch {}
						}
					}
				}
				if (files.length > 0) {
					const dt = createDataTransferFromFiles(files)
					if (dt) {
						console.log(
							'[AIWorkflow:MediaImport] readClipboardAndPaste: dispatching files to pasteMediaData, count:',
							files.length
						)
						const ok = await Promise.resolve(payload.pasteMediaData(dt, position))
						if (ok) return true
					}
				}
				if (textContent) {
					// 尝试URL
					const isUrl = /^https?:\/\//i.test(textContent.trim())
					if (isUrl) {
						// 创建一个DataTransfer并写入text/uri-list
						try {
							const dt = new DataTransfer()
							dt.setData('text/uri-list', textContent.trim())
							console.log(
								'[AIWorkflow:MediaImport] readClipboardAndPaste: dispatching URL to pasteMediaData:',
								textContent.slice(0, 100)
							)
							const ok = await Promise.resolve(payload.pasteMediaData(dt, position))
							if (ok) return true
						} catch {}
					}
				}
			} catch (err) {
				console.warn(
					'[AIWorkflow:MediaImport] readClipboardAndPaste: navigator.clipboard.read() failed:',
					err
				)
			}
		} else {
			console.log(
				'[AIWorkflow:MediaImport] readClipboardAndPaste: navigator.clipboard.read() not available'
			)
		}

		// Fallback：创建临时隐藏输入框来触发标准paste事件
		console.log(
			'[AIWorkflow:MediaImport] readClipboardAndPaste: trying fallback with hidden textarea'
		)
		return new Promise<boolean>((resolve) => {
			try {
				const textarea = document.createElement('textarea')
				textarea.style.position = 'fixed'
				textarea.style.left = '-9999px'
				textarea.style.top = '-9999px'
				textarea.style.opacity = '0'
				textarea.setAttribute('readonly', '')
				document.body.appendChild(textarea)
				textarea.focus()

				let resolved = false
				const cleanup = () => {
					if (resolved) return
					resolved = true
					textarea.removeEventListener('paste', onPasteFallback, true)
					document.body.removeChild(textarea)
				}
				const onPasteFallback = async (pasteEv: ClipboardEvent) => {
					console.log('[AIWorkflow:MediaImport] Fallback paste event captured on hidden textarea')
					pasteEv.stopImmediatePropagation()
					pasteEv.preventDefault()
					const cd = pasteEv.clipboardData
					try {
						const ok = await Promise.resolve(payload.pasteMediaData(cd, position))
						cleanup()
						resolve(ok)
					} catch (err) {
						console.error('[AIWorkflow:MediaImport] Fallback pasteMediaData error:', err)
						cleanup()
						resolve(false)
					}
				}
				textarea.addEventListener('paste', onPasteFallback, true)

				// 触发粘贴命令
				const success = document.execCommand('paste')
				console.log('[AIWorkflow:MediaImport] Fallback execCommand paste result:', success)

				// 超时兜底
				setTimeout(() => {
					if (!resolved) {
						console.warn('[AIWorkflow:MediaImport] Fallback paste timed out')
						cleanup()
						resolve(false)
					}
				}, 1000)
			} catch (err) {
				console.error('[AIWorkflow:MediaImport] Fallback failed:', err)
				resolve(false)
			}
		})
	}

	// 防重复粘贴：keydown触发后等待原生paste事件，超时则用readClipboardAndPaste兜底
	let pasteHandled = false
	let pasteFallbackTimer: ReturnType<typeof setTimeout> | null = null
	const PASTE_FALLBACK_DELAY_MS = 80

	const onWorkflowKeyDown = (ev: KeyboardEvent) => {
		const key = String(ev.key || '').toLowerCase()
		const mod = ev.ctrlKey || ev.metaKey
		const tag = ((ev.target as HTMLElement | null)?.tagName || '').toLowerCase()
		if (!payload.isRouteActive()) {
			return
		}

		if (mod && key === 's') {
			if (payload.saveProject) {
				ev.preventDefault()
				ev.stopImmediatePropagation()
				Promise.resolve(payload.saveProject()).catch(() => {})
			}
			return
		}

		// Ctrl+V / Cmd+V：先尝试让原生paste事件触发，若在Electron/Canvas焦点下paste事件不触发，
		// 则在短延迟后通过readClipboardAndPaste主动读取剪贴板作为兜底。
		if (mod && key === 'v' && !ev.shiftKey && !ev.altKey && !ev.repeat) {
			const targetIsEditable = isEditableEventTarget(ev.target ?? null)
			// Canvas 虚拟输入框编辑中（蓝色临时框 / 绿色分组框标签编辑）：直接放行，
			// 让浏览器按原生粘贴行为处理（粘贴文本到输入框），不触发节点剪贴板/媒体导入。
			const canvasEditing =
				typeof payload.getCanvasEditingState === 'function' && payload.getCanvasEditingState()
			const mousePos = payload.getMouseWorldPos()
			const hasInternalNodes = payload.hasClipboardNodes()
			console.log('[AIWorkflow:MediaImport] === KeyDown Ctrl+V detected ===', {
				targetTag: tag,
				targetIsEditable,
				canvasEditing,
				hasClipboardNodes: hasInternalNodes,
				mousePos,
				note: 'Waiting for native paste event, with fallback to readClipboardAndPaste'
			})

			if (targetIsEditable || canvasEditing) {
				// 可编辑目标（真实DOM输入或Canvas虚拟输入框编辑态）：不干预，让浏览器原生处理
				return
			}

			if (hasInternalNodes) {
				// 内部节点复制粘贴：直接处理
				ev.preventDefault()
				ev.stopImmediatePropagation()
				payload.pasteNodesAtCanvasCenter()
				return
			}

			// 外部媒体粘贴：先重置标志，等待原生paste事件；若超时未触发则主动读取剪贴板
			pasteHandled = false
			if (pasteFallbackTimer) {
				clearTimeout(pasteFallbackTimer)
				pasteFallbackTimer = null
			}
			pasteFallbackTimer = setTimeout(() => {
				pasteFallbackTimer = null
				if (!pasteHandled) {
					console.log(
						'[AIWorkflow:MediaImport] Native paste event did not fire within fallback window, using readClipboardAndPaste'
					)
					Promise.resolve(readClipboardAndPaste(mousePos ?? undefined)).catch((err) => {
						console.error('[AIWorkflow:MediaImport] readClipboardAndPaste error:', err)
					})
				}
			}, PASTE_FALLBACK_DELAY_MS)
			// 不阻止默认行为，让paste事件有机会自然触发
			return
		}

		if (isEditableEventTarget(ev.target ?? null)) {
			return
		}

		// Canvas 虚拟输入框编辑态：跳过所有涉及节点/边操作的快捷键（Ctrl+C / Backspace / Delete 等），
		// 不 preventDefault 也不 stopPropagation，让事件自然沿 Window 冒泡到
		// InputManager → BlueprintEditorTool.onKeyDown，由 Tool 内部处理文字编辑逻辑。
		const canvasEditing =
			typeof payload.getCanvasEditingState === 'function' && payload.getCanvasEditingState()
		if (canvasEditing) {
			return
		}

		if (mod && key === 'c') {
			const selected = payload.getSelectedNodeIds()
			if (selected.length > 0) {
				ev.stopPropagation()
				payload.copySelectedNodes(selected[0])
			}
			return
		}

		if (key === 'backspace' || key === 'delete') {
			if (ev.repeat) {
				return
			}
			const selected = payload.getSelectedNodeIds()
			if (!selected.length) {
				const selectedEdgeId = String(payload.getSelectedEdgeId() ?? '').trim()
				if (!selectedEdgeId) {
					return
				}
				ev.preventDefault()
				ev.stopPropagation()
				payload.removeSelectedEdge(selectedEdgeId)
				return
			}
			ev.preventDefault()
			ev.stopPropagation()
			payload.removeSelectedNodes(selected)
		}
	}

	// copy 事件：当用户在蓝图中按 Ctrl+C 复制节点时，向系统剪贴板写入自定义标记
	// 这样后续粘贴时能准确区分"内部节点粘贴"和"外部资产导入"
	const onWorkflowCopy = (ev: ClipboardEvent) => {
		if (!payload.isRouteActive()) return
		if (isEditableEventTarget(ev.target ?? null)) return
		// Canvas 虚拟输入框编辑态：让浏览器原生处理文本复制（选中的 editText 复制）
		if (typeof payload.getCanvasEditingState === 'function' && payload.getCanvasEditingState())
			return

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
	// 1. 先检测外部数据（文件/截图/URL），优先导入外部资产
	// 2. 如果有自定义标记（来自蓝图内的节点复制），粘贴节点
	// 3. 兜底：如果没有外部数据但内部有节点剪贴板数据，粘贴节点
	// 注意：先检测文件/URL，再调用 cd.getData() 检测内部标记，避免 getData 干扰文件读取
	const onWorkflowPaste = (ev: ClipboardEvent) => {
		// 入口日志：任何情况下都打印，方便诊断为什么粘贴没反应
		const targetEl = ev.target as HTMLElement | null
		const mousePos = payload.getMouseWorldPos()
		console.log('[AIWorkflow:MediaImport] === Paste event fired ===', {
			targetTag: targetEl?.tagName,
			targetId: targetEl?.id,
			targetClass: targetEl?.className,
			isEditable: isEditableEventTarget(ev.target),
			routeActive: payload.isRouteActive(),
			mousePos
		})

		if (!payload.isRouteActive()) {
			console.log('[AIWorkflow:MediaImport] Paste ignored: route not active')
			return
		}
		if (isEditableEventTarget(ev.target ?? null)) {
			console.log('[AIWorkflow:MediaImport] Paste ignored: target is editable element')
			return
		}
		// Canvas 虚拟输入框编辑态：不拦截 paste 事件，让浏览器按原生文本粘贴处理
		const canvasEditingPaste =
			typeof payload.getCanvasEditingState === 'function' && payload.getCanvasEditingState()
		if (canvasEditingPaste) {
			console.log('[AIWorkflow:MediaImport] Paste ignored: canvas selection frame editing')
			return
		}

		// 标记已通过原生paste事件处理，取消keydown fallback定时器，防止重复处理
		pasteHandled = true
		if (pasteFallbackTimer) {
			clearTimeout(pasteFallbackTimer)
			pasteFallbackTimer = null
		}

		const cd = ev.clipboardData ?? null
		if (!cd) {
			console.log('[AIWorkflow:MediaImport] Paste ignored: no clipboardData')
			// 兜底尝试粘贴内部节点
			if (payload.hasClipboardNodes()) {
				console.log('[AIWorkflow:MediaImport] Fallback: pasting internal nodes (no clipboardData)')
				ev.preventDefault()
				payload.pasteNodesAtCanvasCenter()
			}
			return
		}

		// 第一步：检测文件（同时检查 items 和 files，兼容不同Electron/浏览器场景）
		const fileItems = Array.from(cd.items ?? []).filter((it) => it.kind === 'file')
		const mediaFileItems = fileItems.filter((it) => {
			const t = String(it.type || '').toLowerCase()
			return (
				t.startsWith('image/') ||
				t.startsWith('video/') ||
				t === 'model/gltf-binary' ||
				t === 'model/gltf+json' ||
				!t
			)
		})
		const hasFilesInItems = mediaFileItems.length > 0
		const hasFilesInFiles = cd.files && cd.files.length > 0
		const hasAnyFiles = hasFilesInItems || hasFilesInFiles

		if (hasAnyFiles) {
			console.log('[AIWorkflow:MediaImport] Paste detected files:', {
				fromItems: mediaFileItems.length,
				fromFiles: cd.files?.length ?? 0,
				itemTypes: mediaFileItems.map((it) => ({ kind: it.kind, type: it.type })),
				fileNames: Array.from(cd.files ?? []).map((f) => ({
					name: f.name,
					type: f.type,
					size: f.size
				}))
			})
			ev.preventDefault()
			console.log('[AIWorkflow:MediaImport] Processing external media paste (files)...')
			const handled = payload.pasteMediaData(cd, mousePos ?? undefined)
			Promise.resolve(handled).then((ok) => {
				console.log('[AIWorkflow:MediaImport] pasteMediaData handled:', ok)
				if (!ok && payload.hasClipboardNodes()) {
					console.log(
						'[AIWorkflow:MediaImport] pasteMediaData returned false, falling back to internal nodes'
					)
					payload.pasteNodesAtCanvasCenter()
				}
			})
			return
		}

		// 第二步：检测URL文本（包括http/https、blob、data、file://本地文件路径）
		const text = (cd.getData('text/uri-list') || cd.getData('text/plain') || '').trim()
		const isHttpUrl = text && /^https?:\/\//i.test(text)
		const isFileUrl = text && text.startsWith('file://')
		const isDataUrl = text && text.startsWith('data:')
		const isBlobUrl = text && text.startsWith('blob:')
		const isUrl = isHttpUrl || isFileUrl || isDataUrl || isBlobUrl
		if (isUrl) {
			console.log('[AIWorkflow:MediaImport] Paste detected URL/path:', text.slice(0, 100), {
				isHttpUrl,
				isFileUrl,
				isDataUrl,
				isBlobUrl
			})
			ev.preventDefault()
			console.log('[AIWorkflow:MediaImport] Processing external media paste (URL/path)...')
			const handled = payload.pasteMediaData(cd, mousePos ?? undefined)
			Promise.resolve(handled).then((ok) => {
				console.log('[AIWorkflow:MediaImport] pasteMediaData handled:', ok)
				if (!ok && payload.hasClipboardNodes()) {
					console.log(
						'[AIWorkflow:MediaImport] pasteMediaData returned false, falling back to internal nodes'
					)
					payload.pasteNodesAtCanvasCenter()
				}
			})
			return
		}

		// 第三步：检测是否是我们自己复制的节点（注意：cd.getData必须在文件/URL检测之后调用，避免干扰文件读取）
		const isOurNodeCopy = cd.getData(DVSTUDIO_NODES_MIME) === '1'
		if (isOurNodeCopy) {
			console.log('[AIWorkflow:MediaImport] Paste: internal node copy detected')
			ev.preventDefault()
			if (payload.hasClipboardNodes()) {
				payload.pasteNodesAtCanvasCenter()
			} else {
				console.warn(
					'[AIWorkflow:MediaImport] Internal node copy marker found but hasClipboardNodes() is false'
				)
			}
			return
		}

		// 第四步：兜底尝试粘贴内部节点
		if (payload.hasClipboardNodes()) {
			console.log('[AIWorkflow:MediaImport] Fallback: pasting internal nodes (no external data)')
			ev.preventDefault()
			payload.pasteNodesAtCanvasCenter()
			return
		}

		console.log('[AIWorkflow:MediaImport] Paste ignored: no actionable data in clipboard')
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
