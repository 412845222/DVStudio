import { computed, type Ref } from 'vue'
import type { Store } from 'vuex'
import type { WorkflowState, SavedSelectionFrame } from '../../../../aiworkflow/types'
import { makeSelectionTagKey } from '../../../../aiworkflow/domain/selection/selectionTagUtils'

/**
 * 计算多选节点的包围盒（世界坐标）
 */
type BoundsNode = { worldX?: number; worldY?: number; width?: number; height?: number }

const computeWorldBounds = (
	nodesById: Record<string, BoundsNode>,
	selectedNodeIds: string[]
): { x0: number; y0: number; x1: number; y1: number } | null => {
	if (selectedNodeIds.length < 2) return null

	let x0 = Infinity,
		y0 = Infinity
	let x1 = -Infinity,
		y1 = -Infinity

	for (const id of selectedNodeIds) {
		const node = nodesById[id]
		if (!node) continue
		const nx = Number(node.worldX ?? 0)
		const ny = Number(node.worldY ?? 0)
		const nw = Number(node.width ?? 200)
		const nh = Number(node.height ?? 160)
		// 节点中心在 (nx, ny)，计算左上角和右下角
		const left = nx - nw / 2
		const top = ny - nh / 2
		const right = nx + nw / 2
		const bottom = ny + nh / 2

		x0 = Math.min(x0, left)
		y0 = Math.min(y0, top)
		x1 = Math.max(x1, right)
		y1 = Math.max(y1, bottom)
	}

	if (!isFinite(x0)) return null

	// 添加 padding
	const pad = 12
	return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
}

export const useAIWorkflowSelectionFrame = (payload: {
	store: Store<WorkflowState>
	selectedNodeIds: Ref<string[]>
}) => {
	const { store } = payload

	// 是否显示选框（>=2个节点时）
	const visible = computed(() => payload.selectedNodeIds.value.length >= 2)

	// 当前多选标签key（用于保存时使用）
	const currentTagKey = computed(() => {
		const ids = payload.selectedNodeIds.value.slice().sort()
		return ids.length >= 2 ? makeSelectionTagKey(ids) : ''
	})

	// 世界坐标包围盒（直接返回 worldRect 格式）
	// 使用 JSON.stringify 确保依赖 nodesById 的变化触发重新计算
	const worldRect = computed<{ x0: number; y0: number; x1: number; y1: number } | null>(() => {
		if (!visible.value) return null
		const nodesById = store.state.nodesById
		// 强制触发依赖追踪
		void JSON.stringify(
			Object.keys(nodesById).map((id) => ({
				id,
				x: nodesById[id]?.worldX,
				y: nodesById[id]?.worldY
			}))
		)
		return computeWorldBounds(nodesById, payload.selectedNodeIds.value)
	})

	// 显示的标签文本 - 新建多选始终为 undefined（显示"编辑"），不从旧数据读取
	const label = computed<string | undefined>(() => undefined)

	// 节点数量
	const nodeCount = computed(() => payload.selectedNodeIds.value.length)

	// 已保存的选区框列表（从 store 读取）
	const savedFrames = computed<SavedSelectionFrame[]>(() => store.state.savedSelectionFrames ?? [])

	// 选中的节点ID列表（用于拖拽）
	const nodeIds = computed(() => payload.selectedNodeIds.value)

	return {
		visible,
		worldRect,
		label,
		nodeCount,
		nodeIds,
		currentTagKey,
		savedFrames
	}
}
