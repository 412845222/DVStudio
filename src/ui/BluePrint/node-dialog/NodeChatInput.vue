<template>
	<div
		ref="wrapRef"
		class="bp-node-chat-input-wrap"
		:class="{ 'is-dragging': isDragging, 'is-empty': isEmpty }"
		:style="{ minHeight: `${currentHeight}px` }"
	>
		<div class="bp-node-chat-input-inner" ref="innerRef" @mousedown="onInnerMouseDown">
			<div
				ref="editorRef"
				class="bp-node-chat-editor"
				:class="{ 'is-disabled': disabled }"
				contenteditable="true"
				@wheel.stop
				@input="onEditorInput"
				@keydown="onEditorKeydown"
				@keyup="onEditorKeyup"
				@focus="onFocus"
				@blur="onBlur"
				@mousedown="onEditorMouseDown"
				@mouseup="onEditorMouseUp"
				@paste="onPaste"
			></div>
			<div v-if="isEmpty" class="bp-node-chat-placeholder">{{ resolvedPlaceholder }}</div>
		</div>
		<div class="bp-node-chat-input-footer">
			<span class="bp-node-chat-char-count">
				{{ charCount }}{{ maxLength ? `/${maxLength}` : '' }}
			</span>
			<span v-if="focused" class="bp-node-chat-hint">
				<kbd>@</kbd>
				引用 ·
				<kbd>Enter</kbd>
				发送 ·
				<kbd>Shift</kbd>
				+
				<kbd>Enter</kbd>
				换行
			</span>
		</div>
		<div class="bp-node-chat-resize-handle" @mousedown="onResizeStart"></div>
		<NodeMentionPopup
			:visible="isMentionOpen"
			:items="filteredItems"
			:selected-index="selectedMentionIndex"
			@mousedown.prevent.stop
			@select="handleMentionSelect"
			@update:selected-index="selectedMentionIndex = $event"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../../i18n'
import NodeMentionPopup from './components/NodeMentionPopup.vue'
import type { InputParamPreviewRef } from './index'
import {
	areSelectedRefsEqual,
	CHIP_MARKER,
	matchSelectedRefsWithSerializedDraft,
	type StoredNodeChatRef
} from './chatStateUtils'

const { t } = useI18n()

const calcDisplayLength = (serialized: string, refs: InputParamPreviewRef[]): number => {
	const parts = serialized.split(CHIP_MARKER)
	let len = 0
	let refIdx = 0
	for (let i = 0; i < parts.length; i++) {
		len += parts[i].length
		if (i < parts.length - 1) {
			const ref = refs[refIdx++]
			if (ref) len += (ref.label || '').length
		}
	}
	return len
}

const props = withDefaults(
	defineProps<{
		modelValue: string
		placeholder?: string
		disabled?: boolean
		maxLength?: number
		inputParamPreviewRefs?: InputParamPreviewRef[]
		selectedReferences?: InputParamPreviewRef[]
	}>(),
	{
		placeholder: undefined,
		disabled: false,
		maxLength: undefined,
		inputParamPreviewRefs: () => [],
		selectedReferences: () => []
	}
)

const emit = defineEmits<{
	(e: 'update:modelValue', value: string): void
	(e: 'update:selectedReferences', refs: InputParamPreviewRef[]): void
	(e: 'submit'): void
	(e: 'focus'): void
	(e: 'blur'): void
}>()

const wrapRef = ref<HTMLDivElement | null>(null)
const innerRef = ref<HTMLDivElement | null>(null)
const editorRef = ref<HTMLDivElement | null>(null)
const focused = ref(false)
const isDragging = ref(false)
const initialText = (props.modelValue ?? '').replace(new RegExp(CHIP_MARKER, 'g'), '')
const isEmpty = ref(initialText.trim() === '' && (props.selectedReferences?.length ?? 0) === 0)
const currentSerializedText = ref(props.modelValue ?? '')
const currentHeight = ref(120)
const MIN_HEIGHT = 100
const MAX_HEIGHT = 400
let dragStartY = 0
let dragStartHeight = 0

let isComposing = false
let isInternalUpdate = false

const isMentionOpen = ref(false)
const mentionFilter = ref('')
const selectedMentionIndex = ref(0)

const charCount = ref(calcDisplayLength(props.modelValue ?? '', props.selectedReferences ?? []))
const inputParamRefs = computed(() => props.inputParamPreviewRefs ?? [])
const selectedRefs = ref<InputParamPreviewRef[]>([...(props.selectedReferences ?? [])])

const syncSelectedRefsFromProps = () => {
	// 关键修复：不能直接把 props.selectedReferences 复制过来 —— 父层（Vuex Store / Dialog props）
	// 可能下发的是“排序后/去重后的 refs”，顺序不一定等于 props.modelValue 中 CHIP_MARKER 的出现顺序。
	// 必须以 serialized draft 为真源，用 matchSelectedRefsWithSerializedDraft 对齐后再赋值，
	// 才能保证 renderFromModel 遍历 marker 时 refs[i] 不会越界或错配，最终导致全部 fallback 到 "引用丢失"。
	const aligned = matchSelectedRefsWithSerializedDraft(
		props.modelValue ?? currentSerializedText.value,
		props.selectedReferences ?? []
	)
	const newRefs: InputParamPreviewRef[] = aligned
		? [...(aligned as unknown as InputParamPreviewRef[])]
		: []
	// 使用深比较：内容一致就不更新，避免引用变化导致虚假重渲染
	if (areSelectedRefsEqual(newRefs, selectedRefs.value)) {
		return false
	}
	selectedRefs.value = newRefs
	return true
}

const availableForMention = computed(() => {
	return inputParamRefs.value
})

const filteredItems = computed(() => {
	const filter = mentionFilter.value.toLowerCase().trim()
	if (!filter) return availableForMention.value
	return availableForMention.value.filter((item) => {
		const label = (item.label || item.name || '').toLowerCase()
		const kind = item.kind.toLowerCase()
		return label.includes(filter) || kind.includes(filter)
	})
})

const resolvedPlaceholder = computed(() => {
	return props.placeholder || t('aichat.nodeChat.placeholder')
})

const getTextFromNodeStartToCaret = (): {
	text: string
	atTextNode: Text
	atOffset: number
} | null => {
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
			if (el.classList && el.classList.contains('bp-mention-chip')) break
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

const createChipElement = (item: InputParamPreviewRef): HTMLSpanElement => {
	const span = document.createElement('span')
	span.className = `bp-mention-chip is-${item.kind}`
	span.setAttribute('contenteditable', 'false')
	span.setAttribute('data-edge-id', item.edgeId || '')
	span.setAttribute('data-node-id', item.fromNodeId || '')
	span.setAttribute('data-anchor-id', item.fromAnchorId || '')
	span.setAttribute('data-kind', item.kind)
	span.setAttribute('data-label', item.label || '')

	// ===== 关键修复：稳定 refKey（优先级 edgeId > fromNodeId:fromAnchorId > fallback）=====
	// 避免存储时排序 + 仅按出现顺序索引 refs，导致 save→read 后 chip 对应错位 / 消失。
	const rawAsAny = item as unknown as StoredNodeChatRef
	const rawKey = typeof rawAsAny?.refKey === 'string' && rawAsAny.refKey ? rawAsAny.refKey : null
	const fallbackKey = item.edgeId
		? item.edgeId
		: item.fromNodeId || item.fromAnchorId
			? `${item.fromNodeId || ''}:${item.fromAnchorId || ''}`
			: `__chip_${Math.random().toString(36).slice(2, 10)}__`
	const refKey = rawKey || fallbackKey
	span.setAttribute('data-ref-key', refKey)

	if (item.previewUrl) {
		const img = document.createElement('img')
		img.className = 'bp-mention-chip-thumb'
		img.src = item.previewUrl
		img.alt = item.label || ''
		img.draggable = false
		// 图片加载失败时回退到类型图标，避免显示破碎图片占位符
		img.onerror = () => {
			const parent = img.parentNode
			if (!parent) return
			const icon = document.createElement('span')
			icon.className = 'bp-mention-chip-icon'
			icon.textContent = getTypeIcon(item.kind)
			parent.replaceChild(icon, img)
		}
		span.appendChild(img)
	} else {
		const icon = document.createElement('span')
		icon.className = 'bp-mention-chip-icon'
		icon.textContent = getTypeIcon(item.kind)
		span.appendChild(icon)
	}

	const label = document.createElement('span')
	label.className = 'bp-mention-chip-label'
	label.textContent = item.label || ''
	span.appendChild(label)

	const removeBtn = document.createElement('span')
	removeBtn.className = 'bp-mention-chip-remove'
	removeBtn.setAttribute('contenteditable', 'false')
	removeBtn.textContent = '×'
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

const getTypeIcon = (kind: string): string => {
	if (kind === 'image') return '🖼'
	if (kind === 'video') return '🎬'
	if (kind === 'model3d') return '3D'
	if (kind === 'blender') return '🎨'
	if (kind === 'audio') return '🎵'
	return '📝'
}

const removeChipElement = (chipEl: HTMLElement) => {
	isInternalUpdate = true
	const parent = chipEl.parentNode
	if (!parent) {
		isInternalUpdate = false
		return
	}
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
		isInternalUpdate = false
		editorRef.value?.focus()
	})
}

const insertChipAtCursor = (item: InputParamPreviewRef) => {
	isInternalUpdate = true
	const sel = window.getSelection()
	if (!sel || sel.rangeCount === 0 || !editorRef.value) {
		isInternalUpdate = false
		return
	}

	const info = getTextFromNodeStartToCaret()
	if (!info) {
		isInternalUpdate = false
		return
	}

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
	nextTick(() => {
		isInternalUpdate = false
	})
}

const syncFromDOM = () => {
	if (!editorRef.value) return
	const wasInternalUpdate = isInternalUpdate
	isInternalUpdate = true

	let serializedText = ''
	let displayText = ''
	const refs: InputParamPreviewRef[] = []
	const processNode = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const t = node.textContent || ''
			serializedText += t
			displayText += t
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as HTMLElement
			if (el.classList && el.classList.contains('bp-mention-chip')) {
				const label = el.getAttribute('data-label') || ''
				const kind = el.getAttribute('data-kind') || ''
				const edgeId = el.getAttribute('data-edge-id') || undefined
				const fromNodeId = el.getAttribute('data-node-id') || undefined
				const fromAnchorId = el.getAttribute('data-anchor-id') || undefined
				const refKey = el.getAttribute('data-ref-key') || undefined
				const previewImg = el.querySelector('img.bp-mention-chip-thumb') as HTMLImageElement | null
				const previewUrl = previewImg?.src || ''
				refs.push({
					kind: kind as any,
					label,
					edgeId: edgeId || undefined,
					fromNodeId: fromNodeId || undefined,
					fromAnchorId: fromAnchorId || undefined,
					previewUrl: previewUrl || undefined,
					...(refKey ? ({ refKey } as unknown as object) : {})
				} as InputParamPreviewRef)
				serializedText += CHIP_MARKER
				displayText += label
			} else if (el.classList && el.classList.contains('bp-mention-chip-remove')) {
				return
			} else if (el.tagName === 'BR') {
				serializedText += '\n'
				displayText += '\n'
			} else {
				el.childNodes.forEach(processNode)
			}
		}
	}
	editorRef.value.childNodes.forEach(processNode)

	serializedText = serializedText.replace(/\u00A0/g, ' ')
	displayText = displayText.replace(/\u00A0/g, ' ')
	isEmpty.value = displayText.trim() === '' && refs.length === 0
	charCount.value = displayText.length
	currentSerializedText.value = serializedText
	selectedRefs.value = refs
	// 注意：必须先emit selectedReferences再emit modelValue
	// 因为modelValue的handler(onDraftInput)会设置isInternalUpdate=true，
	// 导致后续selectedReferences的handler(onSelectedRefsChange)被SKIP，
	// 造成新增的@引用无法保存到store
	emit('update:selectedReferences', refs)
	emit('update:modelValue', serializedText)

	if (!wasInternalUpdate) {
		nextTick(() => {
			isInternalUpdate = false
		})
	}
}

const renderFromModel = () => {
	if (!editorRef.value || isInternalUpdate) return
	isInternalUpdate = true
	const editor = editorRef.value
	// Always sync refs from props before rendering to ensure we use the latest state
	syncSelectedRefsFromProps()
	const refs = selectedRefs.value
	const serialized = props.modelValue

	if (refs.length === 0 && !serialized) {
		editor.innerHTML = ''
		isEmpty.value = true
		charCount.value = 0
		nextTick(() => {
			isInternalUpdate = false
		})
		return
	}

	editor.innerHTML = ''

	// ===== 简化：CHIP_MARKER 本身不携带 refKey，因此只要 syncSelectedRefsFromProps
	//       已确保 refs.length == chipCount，就可以按 refs[i] 顺序直接消耗 =====
	// （如果用户多次 @同一个上游节点，顺序就是对齐的核心依据，靠 byKey 无法区分。）
	let displayLen = 0
	const parts = serialized.split(CHIP_MARKER)
	const chipCount = Math.max(0, parts.length - 1)
	const safeChipCount = Math.min(chipCount, refs.length)

	parts.forEach((part, i) => {
		if (part) {
			const lines = part.split('\n')
			lines.forEach((line, li) => {
				if (li > 0) {
					editor.appendChild(document.createElement('br'))
					displayLen += 1
				}
				if (line) {
					editor.appendChild(document.createTextNode(line))
					displayLen += line.length
				}
			})
		}
		if (i < chipCount) {
			if (i < safeChipCount) {
				const ref = refs[i]
				const chipEl = createChipElement(ref)
				editor.appendChild(chipEl)
				displayLen += (ref.label || '').length
			} else {
				// marker 比 refs 多的极端场景 → 显示"引用丢失"占位，避免静默丢失
				const missing = {
					kind: 'text' as any,
					label: '引用丢失',
					edgeId: undefined,
					fromNodeId: undefined,
					fromAnchorId: undefined,
					previewUrl: undefined
				}
				const chipEl = createChipElement(missing)
				editor.appendChild(chipEl)
				displayLen += (missing.label || '').length
			}
		}
	})

	isEmpty.value = displayLen === 0 && refs.length === 0
	charCount.value = displayLen
	nextTick(() => {
		isInternalUpdate = false
	})
}

const onEditorInput = () => {
	if (isInternalUpdate) return
	detectMention()
	syncFromDOM()
}

const onEditorKeydown = (e: KeyboardEvent) => {
	if (isComposing) return

	if (isMentionOpen.value) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault()
				selectedMentionIndex.value = Math.min(
					selectedMentionIndex.value + 1,
					Math.max(0, filteredItems.value.length - 1)
				)
				return
			case 'ArrowUp':
				e.preventDefault()
				selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0)
				return
			case 'Enter':
			case 'Tab':
				if (filteredItems.value.length > 0) {
					e.preventDefault()
					const item = filteredItems.value[selectedMentionIndex.value]
					insertChipAtCursor(item)
				}
				return
			case 'Escape':
				e.preventDefault()
				closeMention()
				return
		}
	}

	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault()
		const hasText = !isEmpty.value
		const hasRefs = selectedRefs.value.length > 0
		if ((hasText || hasRefs) && !props.disabled) {
			emit('submit')
		}
		return
	}

	if (e.key === 'Backspace') {
		const sel = window.getSelection()
		if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
			const range = sel.getRangeAt(0)
			const nodeBefore = getNodeBeforeCursor(range)
			if (nodeBefore && nodeBefore.nodeType === Node.ELEMENT_NODE) {
				const el = nodeBefore as HTMLElement
				if (el.classList.contains('bp-mention-chip')) {
					e.preventDefault()
					removeChipElement(el)
					return
				}
			}
		}
	}
}

const onEditorKeyup = () => {
	detectMention()
}

const getNodeBeforeCursor = (range: Range): Node | null => {
	const container = range.startContainer
	const offset = range.startOffset
	if (container.nodeType === Node.TEXT_NODE) {
		if (offset === 0) {
			return container.previousSibling
		}
		return null
	}
	if (container.nodeType === Node.ELEMENT_NODE) {
		if (offset > 0) {
			return (container as Element).childNodes[offset - 1]
		}
	}
	return null
}

const onEditorMouseDown = () => {}
const onEditorMouseUp = () => {
	detectMention()
}

const onPaste = (e: ClipboardEvent) => {
	if (isComposing) return
	e.preventDefault()

	let text = e.clipboardData?.getData('text/plain') || ''
	if (!text) return
	text = text.replace(new RegExp(CHIP_MARKER, 'g'), '')

	const sel = window.getSelection()
	if (!sel || sel.rangeCount === 0 || !editorRef.value) {
		document.execCommand('insertText', false, text)
		syncFromDOM()
		return
	}

	const range = sel.getRangeAt(0)
	range.deleteContents()

	const lines = text.split(/\r?\n/)
	const fragment = document.createDocumentFragment()

	lines.forEach((line, index) => {
		if (index > 0) {
			fragment.appendChild(document.createElement('br'))
		}
		if (line) {
			fragment.appendChild(document.createTextNode(line))
		}
	})

	const lastNode = fragment.lastChild
	range.insertNode(fragment)

	if (lastNode) {
		const newRange = document.createRange()
		newRange.setStartAfter(lastNode)
		newRange.collapse(true)
		sel.removeAllRanges()
		sel.addRange(newRange)
	}

	syncFromDOM()
	editorRef.value?.focus()
}

const onInnerMouseDown = (e: MouseEvent) => {
	if (e.target === editorRef.value) return
	if (editorRef.value?.contains(e.target as Node)) return
	e.preventDefault()
	editorRef.value?.focus()
	placeCaretAtEnd()
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

const onFocus = () => {
	focused.value = true
	if (blurTimer) {
		clearTimeout(blurTimer)
		blurTimer = null
	}
	emit('focus')
}

let blurTimer: ReturnType<typeof setTimeout> | null = null

const onBlur = () => {
	blurTimer = setTimeout(() => {
		focused.value = false
		closeMention()
		emit('blur')
	}, 200)
}

const handleMentionSelect = (item: InputParamPreviewRef) => {
	editorRef.value?.focus()
	insertChipAtCursor(item)
}

const onResizeStart = (e: MouseEvent) => {
	e.preventDefault()
	isDragging.value = true
	dragStartY = e.clientY
	dragStartHeight = currentHeight.value
	document.addEventListener('mousemove', onResizeMove)
	document.addEventListener('mouseup', onResizeEnd)
}

const onResizeMove = (e: MouseEvent) => {
	const delta = e.clientY - dragStartY
	let newHeight = dragStartHeight + delta
	newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight))
	currentHeight.value = newHeight
}

const onResizeEnd = () => {
	isDragging.value = false
	document.removeEventListener('mousemove', onResizeMove)
	document.removeEventListener('mouseup', onResizeEnd)
}

onMounted(() => {
	currentHeight.value = MIN_HEIGHT + 20
	selectedRefs.value = [...(props.selectedReferences ?? [])]
	renderFromModel()

	const editor = editorRef.value
	if (editor) {
		editor.addEventListener('compositionstart', () => {
			isComposing = true
		})
		editor.addEventListener('compositionend', () => {
			isComposing = false
			nextTick(() => {
				detectMention()
				syncFromDOM()
			})
		})
	}
})

watch(
	() => props.modelValue,
	(newVal) => {
		// If the new value matches what we just serialized from DOM, this update was
		// triggered by user input -> skip re-rendering to preserve caret position.
		if (newVal === currentSerializedText.value) {
			// Still sync selectedRefs from props in case they changed
			syncSelectedRefsFromProps()
			return
		}
		// External/programmatic update -> reset guard and re-render from model.
		isInternalUpdate = false
		syncSelectedRefsFromProps()
		charCount.value = calcDisplayLength(props.modelValue, selectedRefs.value)
		renderFromModel()
	},
	{ flush: 'post' }
)

watch(
	() => props.selectedReferences,
	() => {
		// When selectedReferences change externally (e.g. dialog reopens with saved refs),
		// sync and re-render to show the chips.
		if (isInternalUpdate) return
		const changed = syncSelectedRefsFromProps()
		if (changed) {
			isInternalUpdate = false
			charCount.value = calcDisplayLength(props.modelValue ?? '', selectedRefs.value)
			renderFromModel()
		}
	},
	{ deep: true, flush: 'post' }
)

onBeforeUnmount(() => {
	document.removeEventListener('mousemove', onResizeMove)
	document.removeEventListener('mouseup', onResizeEnd)
})

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

const blur = () => {
	editorRef.value?.blur()
}

const getFullText = (): string => {
	if (!editorRef.value) return props.modelValue
	let text = ''
	const walk = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			text += node.textContent || ''
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as HTMLElement
			if (el.tagName === 'BR') {
				return
			}
			if (el.classList && el.classList.contains('bp-mention-chip')) {
				const label = el.getAttribute('data-label') || ''
				text += label
				return
			}
			if (
				el.classList &&
				(el.classList.contains('bp-mention-chip-remove') ||
					el.classList.contains('bp-mention-chip-icon') ||
					el.classList.contains('bp-mention-chip-thumb'))
			) {
				return
			}
			el.childNodes.forEach(walk)
		}
	}
	editorRef.value.childNodes.forEach(walk)
	return text.replace(/\u00A0/g, ' ')
}

defineExpose({ focus, blur, getFullText })
</script>

<style scoped>
.bp-node-chat-input-wrap {
	position: relative;
	width: calc(100% - 20px);
	margin: 6px 10px;
	box-sizing: border-box;
	border: 1px solid transparent;
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	transition:
		border-color 0.22s ease,
		box-shadow 0.22s ease,
		background-color 0.22s ease;
}

.bp-node-chat-input-wrap:focus-within {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
}

.bp-node-chat-input-wrap.is-dragging {
	user-select: none;
}

.bp-node-chat-input-inner {
	position: relative;
	padding: 8px 10px 24px 10px;
	min-height: inherit;
	box-sizing: border-box;
}

.bp-node-chat-placeholder {
	position: absolute;
	top: 10px;
	left: 10px;
	right: 10px;
	font-size: 14px;
	line-height: 22px;
	color: color-mix(in srgb, var(--wf-text-muted, #aeb8bd) 60%, transparent);
	opacity: 0.7;
	pointer-events: none;
	user-select: none;
}

.bp-node-chat-editor {
	width: 100%;
	min-height: 80px;
	max-height: 300px;
	outline: none;
	border: none;
	background: transparent;
	color: var(--wf-text, #edf2f4);
	font-size: 14px;
	line-height: 22px;
	font-family: inherit;
	word-wrap: break-word;
	word-break: break-word;
	white-space: pre-wrap;
	overflow-y: auto;
	box-sizing: border-box;
	cursor: text;
	padding: 2px 0;
}

.bp-node-chat-editor.is-disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.bp-node-chat-editor :deep(.bp-mention-chip) {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 1px 4px 1px 3px;
	margin: 0 2px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
	border-radius: 3px;
	background: color-mix(in srgb, var(--wf-surface-muted, rgba(36, 42, 48, 0.9)) 80%, transparent);
	font-size: 12px;
	line-height: 1.4;
	vertical-align: baseline;
	user-select: none;
	cursor: default;
	transition: all 0.15s ease;
	white-space: nowrap;
	position: relative;
	top: -1px;
}

.bp-node-chat-editor :deep(.bp-mention-chip:hover) {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.bp-node-chat-editor :deep(.bp-mention-chip-thumb) {
	width: 16px;
	height: 16px;
	object-fit: cover;
	border-radius: 1px;
	flex-shrink: 0;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	vertical-align: middle;
}

.bp-node-chat-editor :deep(.bp-mention-chip-icon) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	font-size: 9px;
	flex-shrink: 0;
	vertical-align: middle;
}

.bp-node-chat-editor :deep(.bp-mention-chip-label) {
	font-size: 12px;
	font-weight: 500;
	color: var(--wf-text, #edf2f4);
	white-space: nowrap;
	vertical-align: middle;
	line-height: 1;
}

.bp-node-chat-editor :deep(.bp-mention-chip-remove) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 14px;
	height: 14px;
	border-radius: 2px;
	cursor: pointer;
	font-size: 13px;
	line-height: 1;
	padding: 0;
	flex-shrink: 0;
	color: var(--wf-text-muted, #aeb8bd);
	vertical-align: middle;
	transition: all 0.15s ease;
	margin-left: 1px;
}

.bp-node-chat-editor :deep(.bp-mention-chip-remove:hover) {
	background: color-mix(in srgb, var(--wf-danger, #cf5a46) 25%, transparent);
	color: var(--wf-danger, #cf5a46);
}

.bp-node-chat-editor :deep(.bp-mention-chip.is-text .bp-mention-chip-icon),
.bp-node-chat-editor :deep(.bp-mention-chip.is-text .bp-mention-chip-label) {
	color: #f59e0b;
	border-color: color-mix(in srgb, #f59e0b 45%, transparent);
}

.bp-node-chat-editor :deep(.bp-mention-chip.is-image .bp-mention-chip-icon),
.bp-node-chat-editor :deep(.bp-mention-chip.is-image .bp-mention-chip-label) {
	color: #60a5fa;
}

.bp-node-chat-editor :deep(.bp-mention-chip.is-video .bp-mention-chip-icon),
.bp-node-chat-editor :deep(.bp-mention-chip.is-video .bp-mention-chip-label) {
	color: #4ade80;
}

.bp-node-chat-editor :deep(.bp-mention-chip.is-model3d .bp-mention-chip-icon),
.bp-node-chat-editor :deep(.bp-mention-chip.is-model3d .bp-mention-chip-label) {
	color: #c084fc;
}

.bp-node-chat-editor :deep(.bp-mention-chip.is-blender .bp-mention-chip-icon),
.bp-node-chat-editor :deep(.bp-mention-chip.is-blender .bp-mention-chip-label) {
	color: #f472b6;
}

.bp-node-chat-editor :deep(.bp-mention-chip.is-audio .bp-mention-chip-icon),
.bp-node-chat-editor :deep(.bp-mention-chip.is-audio .bp-mention-chip-label) {
	color: #a78bfa;
}

.bp-node-chat-input-footer {
	position: absolute;
	bottom: 4px;
	left: 12px;
	right: 24px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	pointer-events: none;
	font-size: 11px;
	color: var(--wf-text-muted, #aeb8bd);
}

.bp-node-chat-char-count {
	opacity: 0.6;
}

.bp-node-chat-hint {
	opacity: 0.7;
}

.bp-node-chat-hint kbd {
	display: inline-block;
	padding: 1px 5px;
	margin: 0 1px;
	font-size: 10px;
	font-family: monospace;
	background: color-mix(in srgb, var(--wf-surface-muted, rgba(36, 42, 48, 0.9)) 80%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	border-radius: 2px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 75%, transparent);
	line-height: 1;
}

.bp-node-chat-resize-handle {
	position: absolute;
	bottom: 0;
	right: 0;
	width: 18px;
	height: 18px;
	cursor: ns-resize;
	z-index: 10;
}

.bp-node-chat-resize-handle::after {
	content: '';
	position: absolute;
	bottom: 3px;
	right: 3px;
	width: 8px;
	height: 8px;
	border-right: 2px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	border-bottom: 2px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	opacity: 0.6;
	transition: opacity 0.15s ease;
}

.bp-node-chat-resize-handle:hover::after {
	opacity: 1;
}
</style>
