import { ref, computed, nextTick } from 'vue'
import type { Ref } from 'vue'

export type AgentMentionItem = {
	id: string
	kind: 'text' | 'image' | 'video' | 'model3d' | 'audio' | 'blender'
	nodeId: string
	nodeType: string
	anchorId: string
	label: string
	name?: string
	text?: string
	previewUrl?: string
	meta?: Record<string, unknown>
}

export function useAgentMention(
	textareaRef: Ref<HTMLTextAreaElement | null>,
	getMentionItems: () => AgentMentionItem[],
	onSelectMention: (item: AgentMentionItem) => void
) {
	const isOpen = ref(false)
	const filterText = ref('')
	const selectedIndex = ref(0)
	const atStartPos = ref(-1)

	const filteredItems = computed(() => {
		if (!isOpen.value) {
			return []
		}
		const items = getMentionItems()
		if (!filterText.value) {
			return items
		}
		const lowerFilter = filterText.value.toLowerCase()
		return items.filter((item) => {
			return (
				item.label.toLowerCase().includes(lowerFilter) ||
				(item.name && item.name.toLowerCase().includes(lowerFilter)) ||
				item.kind.toLowerCase().includes(lowerFilter)
			)
		})
	})

	const close = () => {
		isOpen.value = false
		filterText.value = ''
		selectedIndex.value = 0
		atStartPos.value = -1
	}

	const selectItem = (index: number) => {
		if (index < 0 || index >= filteredItems.value.length) {
			return
		}
		const item = filteredItems.value[index]
		const el = textareaRef.value
		if (!el) {
			return
		}
		const val = el.value
		const pos = el.selectionStart
		el.value = val.slice(0, atStartPos.value) + val.slice(pos)
		el.selectionStart = el.selectionEnd = atStartPos.value
		el.dispatchEvent(new Event('input', { bubbles: true }))
		onSelectMention(item)
		close()
		nextTick(() => {
			el.focus()
			el.selectionStart = el.selectionEnd = atStartPos.value
		})
	}

	const handleInput = () => {
		const el = textareaRef.value
		if (!el) {
			return
		}
		const val = el.value
		const pos = el.selectionStart
		let foundAt = -1
		for (let i = pos - 1; i >= 0; i--) {
			const char = val[i]
			if (char === '@') {
				if (i === 0 || /\s/.test(val[i - 1])) {
					const textAfterAt = val.slice(i + 1, pos)
					if (!/\s/.test(textAfterAt)) {
						foundAt = i
					}
				}
				break
			}
			if (/\s/.test(char)) {
				break
			}
		}
		if (foundAt !== -1) {
			atStartPos.value = foundAt
			filterText.value = val.slice(foundAt + 1, pos)
			isOpen.value = true
			selectedIndex.value = 0
		} else {
			close()
		}
	}

	const handleKeyDown = (e: KeyboardEvent): boolean => {
		if (!isOpen.value) {
			return false
		}
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault()
				selectedIndex.value = Math.min(selectedIndex.value + 1, filteredItems.value.length - 1)
				return true
			case 'ArrowUp':
				e.preventDefault()
				selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
				return true
			case 'Enter':
			case 'Tab':
				if (filteredItems.value.length > 0) {
					e.preventDefault()
					selectItem(selectedIndex.value)
					return true
				}
				break
			case 'Escape':
				e.preventDefault()
				close()
				return true
		}
		return false
	}

	const openAtCursor = () => {
		const el = textareaRef.value
		if (!el) {
			return
		}
		const pos = el.selectionStart
		const val = el.value
		el.value = val.slice(0, pos) + '@' + val.slice(pos)
		el.selectionStart = el.selectionEnd = pos + 1
		el.dispatchEvent(new Event('input', { bubbles: true }))
		atStartPos.value = pos
		filterText.value = ''
		isOpen.value = true
		selectedIndex.value = 0
	}

	return {
		isOpen,
		filterText,
		selectedIndex,
		filteredItems,
		handleInput,
		handleKeyDown,
		selectItem,
		close,
		openAtCursor
	}
}
