import { ref, computed, type Ref } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowState } from '../../../../aiworkflow/types'
import { makeSelectionTagKey } from '../../../../aiworkflow/domain/selection/selectionTagUtils'

// 生成简单 UUID
const generateId = () =>
	'ssf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)

export const useAIWorkflowTagEditor = (payload: {
	store: Store<WorkflowState>
	selectedNodeIds: Ref<string[]>
	worldToScreen?: (p: { x: number; y: number }) => { x: number; y: number }
	saveSelectionFrame?: (label: string, nodeIds: string[]) => string | null
	deleteSavedSelectionFrame?: (frameId: string) => boolean
}) => {
	const visible = ref(false)
	const draft = ref('')
	const screenPosition = ref({ x: 0, y: 0 })

	// 当前标签key
	const currentKey = computed(() => {
		const ids = payload.selectedNodeIds.value.slice().sort()
		return ids.length >= 2 ? makeSelectionTagKey(ids) : ''
	})

	// 当前已有标签（旧格式，兼容）
	const existingTag = computed(() => {
		const key = currentKey.value
		return key ? payload.store.state.selectionTagsByKey[key] : null
	})

	// 当前对应的 savedSelectionFrame（新格式）
	const existingFrame = computed(() => {
		const ids = payload.selectedNodeIds.value.slice().sort()
		if (ids.length < 2) return null
		const frameKey = 'ssf_' + ids.join('|')
		return payload.store.state.savedSelectionFrames?.find((f) => f.id === frameKey) ?? null
	})

	// 打开编辑器（接受屏幕坐标直接定位）
	const openEditor = (opts?: {
		worldX?: number
		worldY?: number
		screenX?: number
		screenY?: number
	}) => {
		if (payload.selectedNodeIds.value.length < 2) return

		visible.value = true
		draft.value = existingTag.value?.label ?? existingFrame.value?.label ?? ''

		if (opts?.screenX !== undefined && opts?.screenY !== undefined) {
			// 直接使用屏幕坐标
			screenPosition.value = { x: opts.screenX, y: opts.screenY }
		} else if (opts?.worldX !== undefined && opts?.worldY !== undefined && payload.worldToScreen) {
			// 世界坐标转屏幕坐标
			const screen = payload.worldToScreen({ x: opts.worldX, y: opts.worldY })
			screenPosition.value = { x: screen.x - 90, y: screen.y - 60 }
		} else {
			// 默认在屏幕中央上方
			screenPosition.value = { x: window.innerWidth / 2 - 90, y: 100 }
		}
	}

	// 关闭编辑器
	const closeEditor = () => {
		visible.value = false
		draft.value = ''
	}

	// 提交标签 - 调用引擎API + 同步Vuex
	const commitTag = (label: string) => {
		if (!label || payload.selectedNodeIds.value.length < 2) return

		const key = currentKey.value
		const nodeIds = payload.selectedNodeIds.value.slice().sort()

		// 优先调用引擎API保存（SSOT：引擎是唯一真相源）
		const savedFrameId = payload.saveSelectionFrame?.(label, nodeIds)

		// 旧格式兼容：写入 selectionTagsByKey（引擎change事件会同步，但先写保证即刻响应）
		payload.store.commit('upsertSelectionTag', {
			key,
			label,
			nodeIds
		})

		// 新格式：创建/更新持久化选区框（引擎change事件会同步，但先写保证即刻响应）
		const frameId = savedFrameId ?? 'ssf_' + nodeIds.join('|')
		payload.store.commit('upsertSavedSelectionFrame', {
			id: frameId,
			label,
			nodeIds
		})

		closeEditor()
	}

	// 删除当前标签
	const removeCurrentTag = () => {
		const key = currentKey.value
		if (!key) return

		// 删除对应的 savedSelectionFrame（新格式
		const ids = payload.selectedNodeIds.value.slice().sort()
		if (ids.length >= 2) {
			const frameKey = 'ssf_' + ids.join('|')
			const frame = payload.store.state.savedSelectionFrames?.find((f) => f.id === frameKey)
			if (frame) {
				// 优先调用引擎API删除
				payload.deleteSavedSelectionFrame?.(frame.id)
			}
		}

		// 旧格式删除（Vuex直接修改）
		payload.store.commit('removeSelectionTag', { key })
	}

	// 删除当前标签并清除多选状态
	const removeTagAndClearSelection = () => {
		removeCurrentTag()
		// 清除多选状态：只保留 selectedNodeId 为空
		payload.store.commit('setSelectedNodes', { nodeIds: [] })
	}

	// 仅清除多选状态，保留标签数据
	const clearSelectionOnly = () => {
		payload.store.commit('setSelectedNodes', { nodeIds: [] })
	}

	return {
		visible,
		draft,
		screenPosition,
		existingTag,
		existingFrame,
		openEditor,
		closeEditor,
		commitTag,
		removeCurrentTag,
		removeTagAndClearSelection,
		clearSelectionOnly,
		screenX: computed(() => screenPosition.value.x),
		screenY: computed(() => screenPosition.value.y),
		initialLabel: computed(() => existingTag.value?.label ?? existingFrame.value?.label ?? '')
	}
}
