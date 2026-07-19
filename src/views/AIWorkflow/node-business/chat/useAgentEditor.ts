import { ref, computed, nextTick } from 'vue'
import type { Ref } from 'vue'
export type AgentEditorMentionItem = {
	id: string
	kind: string
	label: string
	name?: string
	text?: string
	previewUrl?: string
	dataUrl?: string
	url?: string
	mimeType?: string
	description?: string
	nodeId?: string
	nodeType?: string
	anchorId?: string
	contextItemId?: string
}

export type AgentEditorChipData = {
	id: string
	kind: string
	label: string
	previewUrl?: string
	contextItemId?: string
}

export function useAgentEditor(
	editorRef: Ref<HTMLDivElement | null>,
	getMentionItems: () => AgentEditorMentionItem[],
	onContentChange: (text: string, chips: AgentEditorChipData[]) => void
) {
	const isMentionOpen = ref(false)
	const mentionFilter = ref('')
	const selectedMentionIndex = ref(0)

	let isComposing = false
	let isInternalUpdate = false

	const filteredItems = computed(() => {
		if (!isMentionOpen.value) return []
		const items = getMentionItems()
		if (!mentionFilter.value) return items
		const lower = mentionFilter.value.toLowerCase()
		return items.filter(item =>
			item.label.toLowerCase().includes(lower) ||
			(item.name && item.name.toLowerCase().includes(lower)) ||
			item.kind.toLowerCase().includes(lower)
		)
	})

	const getTextFromNodeStartToCaret = (): { text: string; atTextNode: Text; atOffset: number } | null => {
		const sel = window.getSelection()
		if (!sel || sel.rangeCount === 0 || !editorRef.value) return null
		const range = sel.getRangeAt(0)
		if (!editorRef.value.contains(range.startContainer)) return null

		let atTextNode: Text | null = null
		let atOffset = -1
		let textAfterAt = ''

		const endNode = range.startContainer
		const endOffset = range.startOffset

		if (endNode.nodeType === Node.TEXT_NODE) {
			const tn = endNode as Text
			const t = tn.textContent || ''
			const before = t.substring(0, endOffset)
			const idx = before.lastIndexOf('@')
			if (idx !== -1) {
				return { text: before.substring(idx + 1), atTextNode: tn, atOffset: idx }
			}
		}

		let sib: Node | null = endNode
		if (endNode.nodeType !== Node.TEXT_NODE) {
			sib = endNode.childNodes[endOffset - 1] || null
		} else {
			sib = endNode.previousSibling
		}
		while (sib) {
			if (sib.nodeType === Node.ELEMENT_NODE) {
				const el = sib as HTMLElement
				if (el.classList && el.classList.contains('agent-mention-chip')) break
			}
			if (sib.nodeType === Node.TEXT_NODE) {
				const tn = sib as Text
				const t = tn.textContent || ''
				const idx = t.lastIndexOf('@')
				if (idx !== -1) {
					atTextNode = tn
					atOffset = idx
					textAfterAt = t.substring(idx + 1)
					break
				}
			}
			sib = sib.previousSibling
		}

		if (!atTextNode || atOffset < 0) return null
		return { text: textAfterAt, atTextNode, atOffset }
	}

	const detectMention = () => {
		if (isComposing || !editorRef.value) return

		const info = getTextFromNodeStartToCaret()
		if (!info) {
			closeMention()
			return
		}

		const afterAt = info.text
		if (afterAt.includes(' ') || afterAt.includes('\n') || afterAt.includes('\u00A0')) {
			closeMention()
			return
		}

		mentionFilter.value = afterAt

		if (!isMentionOpen.value) {
			isMentionOpen.value = true
			selectedMentionIndex.value = 0
		}
		if (selectedMentionIndex.value >= filteredItems.value.length) {
			selectedMentionIndex.value = Math.max(0, filteredItems.value.length - 1)
		}
	}

	const closeMention = () => {
		isMentionOpen.value = false
		mentionFilter.value = ''
		selectedMentionIndex.value = 0
	}

	const getKindIcon = (kind: string): string => {
		if (kind === 'image') return '🖼'
		if (kind === 'video') return '🎬'
		if (kind === 'model3d') return '🧊'
		if (kind === 'blender') return '🎨'
		if (kind === 'audio') return '🎵'
		if (kind === 'file') return '📎'
		if (kind === 'skill') return '⚡'
		if (kind === 'text') return '📝'
		return '📦'
	}

	const createChipElement = (item: AgentEditorMentionItem): HTMLSpanElement => {
		const span = document.createElement('span')
		span.className = `agent-mention-chip is-${item.kind}`
		span.setAttribute('contenteditable', 'false')
		span.setAttribute('data-context-id', item.contextItemId || item.id)
		span.setAttribute('data-kind', item.kind)
		span.setAttribute('data-label', item.label)
		span.style.display = 'inline-flex'
		span.style.alignItems = 'center'
		span.style.gap = '4px'
		span.style.height = '20px'
		span.style.padding = '0 4px 0 2px'
		span.style.borderRadius = '3px'
		span.style.fontSize = '11px'
		span.style.lineHeight = '20px'
		span.style.verticalAlign = 'middle'
		span.style.userSelect = 'none'
		span.style.whiteSpace = 'nowrap'
		span.style.cursor = 'default'
		span.style.background = 'color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent)'
		span.style.border = '1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent)'
		span.style.color = 'var(--wf-primary, #1f9d84)'
		span.style.margin = '0 2px'
		span.style.boxSizing = 'border-box'
		span.style.maxWidth = '160px'
		span.style.overflow = 'hidden'

		const previewSrc = item.dataUrl || item.previewUrl || item.url
		if (previewSrc && (item.kind === 'image' || item.kind === 'video')) {
			const img = document.createElement('img')
			img.className = 'agent-mention-chip-thumb'
			img.src = previewSrc
			img.alt = item.label
			img.draggable = false
			img.style.width = '14px'
			img.style.height = '14px'
			img.style.objectFit = 'cover'
			img.style.borderRadius = '2px'
			img.style.flexShrink = '0'
			img.style.display = 'block'
			span.appendChild(img)
		} else {
			const icon = document.createElement('span')
			icon.className = 'agent-mention-chip-icon'
			icon.textContent = getKindIcon(item.kind)
			icon.style.width = '14px'
			icon.style.height = '14px'
			icon.style.display = 'inline-flex'
			icon.style.alignItems = 'center'
			icon.style.justifyContent = 'center'
			icon.style.fontSize = '10px'
			icon.style.flexShrink = '0'
			span.appendChild(icon)
		}

		const label = document.createElement('span')
		label.className = 'agent-mention-chip-label'
		label.textContent = item.label
		label.style.maxWidth = '100px'
		label.style.overflow = 'hidden'
		label.style.textOverflow = 'ellipsis'
		label.style.whiteSpace = 'nowrap'
		label.style.flexShrink = '1'
		span.appendChild(label)

		const removeBtn = document.createElement('span')
		removeBtn.className = 'agent-mention-chip-remove'
		removeBtn.setAttribute('contenteditable', 'false')
		removeBtn.textContent = '×'
		removeBtn.style.width = '12px'
		removeBtn.style.height = '12px'
		removeBtn.style.display = 'inline-flex'
		removeBtn.style.alignItems = 'center'
		removeBtn.style.justifyContent = 'center'
		removeBtn.style.borderRadius = '2px'
		removeBtn.style.cursor = 'pointer'
		removeBtn.style.fontSize = '11px'
		removeBtn.style.lineHeight = '1'
		removeBtn.style.flexShrink = '0'
		removeBtn.style.marginLeft = '1px'
		removeBtn.style.opacity = '0.7'
		removeBtn.addEventListener('mousedown', (e) => {
			e.preventDefault()
			e.stopPropagation()
		})
		removeBtn.addEventListener('click', (e) => {
			e.preventDefault()
			e.stopPropagation()
			removeChipElement(span)
		})
		span.appendChild(removeBtn)

		return span
	}

	const removeChipElement = (chipEl: HTMLElement) => {
		const parent = chipEl.parentNode
		if (!parent) return
		const next = chipEl.nextSibling

		parent.removeChild(chipEl)

		if (next && next.nodeType === Node.TEXT_NODE) {
			const tn = next as Text
			const t = tn.textContent || ''
			if (t.startsWith(' ')) {
				const rest = t.substring(1)
				if (rest) {
					tn.textContent = rest
				} else {
					parent.removeChild(next)
				}
			}
		}

		syncFromDOM()
		nextTick(() => {
			editorRef.value?.focus()
		})
	}

	const insertChipAtCursor = (item: AgentEditorMentionItem) => {
		const sel = window.getSelection()
		if (!sel || sel.rangeCount === 0 || !editorRef.value) return

		const info = getTextFromNodeStartToCaret()
		if (!info) return

		const { atTextNode, atOffset } = info

		const currentRange = sel.getRangeAt(0)

		const deleteRange = document.createRange()
		deleteRange.setStart(atTextNode, atOffset)

		let endNode = currentRange.startContainer
		let endOffset = currentRange.startOffset
		if (endNode === atTextNode) {
			endOffset = Math.max(atOffset, endOffset)
		}
		deleteRange.setEnd(endNode, endOffset)
		deleteRange.deleteContents()

		const chipEl = createChipElement(item)
		const spaceText = document.createTextNode(' ')

		const insertRange = document.createRange()
		insertRange.setStart(atTextNode, atOffset)
		insertRange.collapse(true)
		insertRange.insertNode(chipEl)
		insertRange.setStartAfter(chipEl)
		insertRange.collapse(true)
		insertRange.insertNode(spaceText)

		const newRange = document.createRange()
		newRange.setStartAfter(spaceText)
		newRange.collapse(true)
		sel.removeAllRanges()
		sel.addRange(newRange)

		closeMention()
		syncFromDOM()
	}

	const selectItem = (index: number) => {
		if (index < 0 || index >= filteredItems.value.length) return
		const item = filteredItems.value[index]
		insertChipAtCursor(item)
		nextTick(() => {
			editorRef.value?.focus()
		})
	}

	const syncFromDOM = () => {
		if (!editorRef.value) return
		isInternalUpdate = true

		let text = ''
		const chips: AgentEditorChipData[] = []
		const processNode = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || ''
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement
				if (el.classList && el.classList.contains('agent-mention-chip')) {
					const label = el.getAttribute('data-label') || ''
					const kind = el.getAttribute('data-kind') || ''
					const contextItemId = el.getAttribute('data-context-id') || undefined
					const previewImg = el.querySelector('img.agent-mention-chip-thumb') as HTMLImageElement | null
					const previewUrl = previewImg?.src || ''
					chips.push({
						id: `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
						kind,
						label,
						previewUrl: previewUrl || undefined,
						contextItemId
					})
				} else if (el.tagName !== 'BR') {
					el.childNodes.forEach(processNode)
				}
			}
		}
		editorRef.value.childNodes.forEach(processNode)

		text = text.replace(/\u00A0/g, ' ')
		onContentChange(text, chips)

		nextTick(() => {
			isInternalUpdate = false
		})
	}

	const setContent = (text: string, chips?: AgentEditorChipData[]) => {
		if (!editorRef.value || isInternalUpdate) return
		const editor = editorRef.value

		if ((!chips || chips.length === 0) && !text) {
			editor.innerHTML = ''
			return
		}

		editor.innerHTML = ''

		if (chips) {
			for (const chipData of chips) {
				const item: AgentEditorMentionItem = {
					id: chipData.id,
					kind: chipData.kind,
					label: chipData.label,
					previewUrl: chipData.previewUrl,
					contextItemId: chipData.contextItemId
				}
				const chipEl = createChipElement(item)
				editor.appendChild(chipEl)
				editor.appendChild(document.createTextNode(' '))
			}
		}

		if (text) {
			const textNode = document.createTextNode(text)
			editor.appendChild(textNode)
		}
	}

	const onEditorInput = () => {
		if (isInternalUpdate) return
		detectMention()
		syncFromDOM()
	}

	const getNodeBeforeCursor = (range: Range): Node | null => {
		const container = range.startContainer
		const offset = range.startOffset
		if (container.nodeType === Node.TEXT_NODE) {
			if (offset === 0) return container.previousSibling
			return null
		}
		if (container.nodeType === Node.ELEMENT_NODE) {
			if (offset > 0) return (container as Element).childNodes[offset - 1]
		}
		return null
	}

	const onEditorKeydown = (e: KeyboardEvent): boolean => {
		if (isComposing) return false

		if (isMentionOpen.value) {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault()
					selectedMentionIndex.value = Math.min(selectedMentionIndex.value + 1, Math.max(0, filteredItems.value.length - 1))
					return true
				case 'ArrowUp':
					e.preventDefault()
					selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0)
					return true
				case 'Enter':
				case 'Tab':
					if (filteredItems.value.length > 0) {
						e.preventDefault()
						selectItem(selectedMentionIndex.value)
						return true
					}
					break
				case 'Escape':
					e.preventDefault()
					closeMention()
					return true
			}
		}

		if (e.key === 'Backspace') {
			const sel = window.getSelection()
			if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
				const range = sel.getRangeAt(0)
				const nodeBefore = getNodeBeforeCursor(range)
				if (nodeBefore && nodeBefore.nodeType === Node.ELEMENT_NODE) {
					const el = nodeBefore as HTMLElement
					if (el.classList.contains('agent-mention-chip')) {
						e.preventDefault()
						removeChipElement(el)
						return true
					}
				}
			}
		}

		return false
	}

	const onEditorKeyup = () => {
		detectMention()
	}

	const onCompositionStart = () => {
		isComposing = true
	}

	const onCompositionEnd = () => {
		isComposing = false
		nextTick(() => {
			detectMention()
			syncFromDOM()
		})
	}

	const focus = () => {
		nextTick(() => {
			if (!editorRef.value) return
			editorRef.value.focus()
			const range = document.createRange()
			range.selectNodeContents(editorRef.value)
			range.collapse(false)
			const sel = window.getSelection()
			if (sel) {
				sel.removeAllRanges()
				sel.addRange(range)
			}
		})
	}

	const placeCaretAtEnd = () => {
		const editor = editorRef.value
		if (!editor) return
		const sel = window.getSelection()
		if (!sel) return
		editor.focus()
		const range = document.createRange()
		range.selectNodeContents(editor)
		range.collapse(false)
		sel.removeAllRanges()
		sel.addRange(range)
	}

	const clear = () => {
		if (editorRef.value) {
			editorRef.value.innerHTML = ''
		}
		syncFromDOM()
	}

	return {
		isMentionOpen,
		mentionFilter,
		selectedMentionIndex,
		filteredItems,
		onEditorInput,
		onEditorKeydown,
		onEditorKeyup,
		onCompositionStart,
		onCompositionEnd,
		syncFromDOM,
		setContent,
		selectMentionItem: selectItem,
		closeMention,
		focus,
		placeCaretAtEnd,
		clear
	}
}
