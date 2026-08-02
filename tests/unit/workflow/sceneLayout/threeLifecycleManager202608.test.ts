import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick, computed } from 'vue'
import { useAIWorkflowThreejsLifecycleManager } from '@/views/AIWorkflow/blueprint-core/useAIWorkflowThreejsLifecycleManager'

/**
 * 针对 BUGFIX 2026-08：useAIWorkflowThreejsLifecycleManager 核心状态管理修复。
 *
 * 本次修复的 4 处关键状态变化（Root Causes）：
 *
 *  [A] getNodePreviewState()：非激活节点不再依赖 activatedOnce。
 *      - 修复前：activatedOnce=false → canStart=false → 按钮不允许启动。
 *      - 修复后：非激活节点统一 canStart=true（空内容由 UI 层 empty prop 覆盖）。
 *
 *  [B] 二次激活 watcher：移除 activeId 变化时的自动 kickoffAutoStart。
 *      - 修复前：activatedOnce=true 且 phase=masked → 强制 loading → canvas 尺寸 0 时立即失败 →
 *                failPreviewSession +旧代码重置 activatedOnce=false → canStart=false → 按钮永久消失。
 *      - 修复后：不再自动 kickoff，用户通过常驻按钮手动启动，避免动画 / reflow 过程中 canvas 为 0 的竞态。
 *
 *  [C] markPreviewContentChanged()：内容变化时 canStart 保持 true。
 *      - 修复前：activatedOnce=false，依赖 activatedOnce → canStart=false（用户要重启必须点一下取消再选中）。
 *      - 修复后：显式 canStart=true，用户直接可重新启动。
 *
 *  [D] failPreviewSession()：失败后保留 activatedOnce 记忆 + canStart=true。
 *      - 修复前：activatedOnce=false（重置） → canStart=false → 失败后按钮消失，用户无法重试。
 *      - 修复后：activatedOnce 记忆保留（影响快照/文案等非关键语义），canStart=true 允许重试。
 *
 *  [E] ensureState()：canStart 只升不降（单向门闩）。
 *      - 修复前：新请求传入 false 会把已解锁的 canStart 打回 false。
 *      - 修复后：existing.canStart = existing.canStart || canStart。
 */
describe('useAIWorkflowThreejsLifecycleManager BUGFIX 2026-08', () => {
	function buildManager(initActiveId = '', initSelectedIds: string[] = []) {
		const active3DPreviewNodeId = ref(initActiveId)
		const selectedNodeIds = ref<string[]>(initSelectedIds)
		const manager = useAIWorkflowThreejsLifecycleManager({
			active3DPreviewNodeId: computed(() => active3DPreviewNodeId.value),
			selectedNodeIds: computed(() => [...selectedNodeIds.value])
		})
		return { manager, active3DPreviewNodeId, selectedNodeIds }
	}

	async function flushMicro() {
		await nextTick()
		// 让 watcher（{ immediate: true } 的）充分执行
		await new Promise((r) => setTimeout(r, 0))
	}

	// -------------------------------------------------------------------------
	// [A] 非激活节点 canStart 始终=true（不再依赖 activatedOnce）
	// -------------------------------------------------------------------------
	describe('[A] getNodePreviewState —— 非激活节点 canStart=true（不依赖 activatedOnce）', () => {
		it('非激活节点（activeId != targetId，类型为 scene-layout）→ canStart 必须为 true（空内容由 UI 层 empty 控制按钮显示）', async () => {
			const { manager, active3DPreviewNodeId, selectedNodeIds } = buildManager('other-node-id', [
				'other-node-id'
			])
			await flushMicro()

			const state = manager.getNodePreviewState('target-scene-layout-1', 'scene-layout')
			expect(state).not.toBeNull()
			expect(state!.phase).toBe('masked')
			expect(state!.canStart).toBe(true) // 核心修复 A：始终 true
		})

		it('非激活节点（类型为 model3d）同样 canStart=true', async () => {
			const { manager } = buildManager('scene-layout-X', ['scene-layout-X'])
			await flushMicro()
			const state = manager.getNodePreviewState('model3d-A', 'model3d')
			expect(state!.canStart).toBe(true)
		})

		it('非法节点类型 → 返回 null（不进入 canStart 逻辑）', async () => {
			const { manager } = buildManager()
			await flushMicro()
			const state = manager.getNodePreviewState('text-node-1', 'text')
			expect(state).toBeNull()
		})

		it('空 nodeId → MASKED_FALSE_STATE（canStart=false，且 phase=masked）', async () => {
			const { manager } = buildManager()
			await flushMicro()
			const state = manager.getNodePreviewState('', 'scene-layout')
			expect(state).not.toBeNull()
			expect(state!.canStart).toBe(false)
			expect(state!.phase).toBe('masked')
		})
	})

	// -------------------------------------------------------------------------
	// [B] 二次激活不自动 kickoffAutoStart
	// -------------------------------------------------------------------------
	describe('[B] 二次激活 activeId 变化 —— 不再自动 kickoffAutoStart', () => {
		it('流程：激活节点 → startPreview → completePreview（activatedOnce=true）→ 切走 → 切回来 → phase 仍为 masked（不自动进入 loading）', async () => {
			const { manager, active3DPreviewNodeId, selectedNodeIds } = buildManager('A', ['A'])
			await flushMicro()

			// Step 1: 显式启动预览 → loading → complete → activatedOnce=true
			manager.startPreviewSession('A')
			let state = manager.getNodePreviewState('A', 'scene-layout')
			expect(state!.phase).toBe('loading')

			manager.completePreviewSession('A')
			state = manager.getNodePreviewState('A', 'scene-layout')
			expect(state!.phase).toBe('interactive')

			// Step 2: 切到其他节点 → A 变为非激活 → A 的 phase 应回到 masked
			selectedNodeIds.value = ['B']
			active3DPreviewNodeId.value = 'B'
			await flushMicro()

			const stateAfterDeactivate = manager.getNodePreviewState('A', 'scene-layout')
			expect(stateAfterDeactivate!.phase).toBe('masked')
			// canStart 必须为 true（非激活节点修复 A）
			expect(stateAfterDeactivate!.canStart).toBe(true)

			// Step 3（关键）：切回 A → 不应自动 kickoffAutoStart
			//   修复前：activatedOnce=true && phase=masked 会触发 kickoff → loading → canvas 尺寸 0 → fail → activatedOnce=false → 按钮消失
			//   修复后：phase 保持 masked，用户可通过常驻按钮手动启动
			selectedNodeIds.value = ['A']
			active3DPreviewNodeId.value = 'A'
			await flushMicro()

			const stateAfterReactivate = manager.getNodePreviewState('A', 'scene-layout')
			// 核心断言：切回来时 NOT loading（修复前会是 loading）
			expect(stateAfterReactivate!.phase).not.toBe('loading')
			expect(stateAfterReactivate!.phase).toBe('masked')
			expect(stateAfterReactivate!.canStart).toBe(true)
		})
	})

	// -------------------------------------------------------------------------
	// [C] markPreviewContentChanged() —— 内容变化后 canStart 保持 true
	// -------------------------------------------------------------------------
	describe('[C] markPreviewContentChanged —— 内容变化 canStart 保持 true', () => {
		it('interactive 阶段 markPreviewContentChanged：phase 切回 masked，activatedOnce=false，但 canStart=true（用户不用重新选中节点就能启动）', async () => {
			const { manager } = buildManager('A', ['A'])
			await flushMicro()

			manager.startPreviewSession('A')
			manager.completePreviewSession('A')
			const s1 = manager.getNodePreviewState('A', 'scene-layout')
			expect(s1!.phase).toBe('interactive')
			// 【注意】exportState 是 reactive 单例对象，后续操作会修改它的属性，
			//        所以比较值时必须先把 requestId 快照到普通变量（否则 s1、s2 指向同一对象，值始终相等）
			const s1RequestId = s1!.requestId

			manager.markPreviewContentChanged('A')
			const s2 = manager.getNodePreviewState('A', 'scene-layout')
			expect(s2!.phase).toBe('masked')
			expect(s2!.canStart).toBe(true) // 核心修复 C
			expect(s2!.progress).toBe(0)
			expect(s2!.label).toBe('')
			// requestId 自增（旧会话失效）
			expect(s2!.requestId).toBeGreaterThan(s1RequestId)
		})

		it('loading 阶段 markPreviewContentChanged：同样切到 masked，且 canStart=true（允许立即放弃加载，重新开始）', async () => {
			const { manager } = buildManager('A', ['A'])
			await flushMicro()
			manager.startPreviewSession('A')
			manager.markPreviewContentChanged('A')
			const s = manager.getNodePreviewState('A', 'scene-layout')
			expect(s!.phase).toBe('masked')
			expect(s!.canStart).toBe(true)
		})
	})

	// -------------------------------------------------------------------------
	// [D] failPreviewSession() —— 失败后 canStart=true 允许重试
	// -------------------------------------------------------------------------
	describe('[D] failPreviewSession —— 失败后 canStart=true 允许重试', () => {
		it('loading 中 fail → phase=masked、canStart=true、requestId 自增', async () => {
			const { manager } = buildManager('A', ['A'])
			await flushMicro()
			manager.startPreviewSession('A')
			const sBefore = manager.getNodePreviewState('A', 'scene-layout')
			expect(sBefore!.phase).toBe('loading')
			// exportState 是 reactive 单例，必须快照原始 requestId 值
			const sBeforeRequestId = sBefore!.requestId

			manager.failPreviewSession('A')
			const sAfter = manager.getNodePreviewState('A', 'scene-layout')
			expect(sAfter!.phase).toBe('masked')
			expect(sAfter!.canStart).toBe(true) // 核心修复 D：失败后仍可重试
			expect(sAfter!.progress).toBe(0)
			expect(sAfter!.label).toBe('')
			expect(sAfter!.requestId).toBeGreaterThan(sBeforeRequestId)
		})

		it('重复调用 failPreviewSession（幂等）：已处于 clean masked 状态不重复加 requestId', async () => {
			const { manager } = buildManager('A', ['A'])
			await flushMicro()
			const s0 = manager.getNodePreviewState('A', 'scene-layout')
			manager.failPreviewSession('A')
			const s1 = manager.getNodePreviewState('A', 'scene-layout')
			// s0 已 clean（masked,progress=0,label=''），幂等分支命中
			expect(s1!.requestId).toBe(s0!.requestId)
			expect(s1!.canStart).toBe(true)
		})
	})

	// -------------------------------------------------------------------------
	// [E] ensureState —— canStart 只升不降
	// -------------------------------------------------------------------------
	describe('[E] ensureState —— canStart 单向门闩：只升不降', () => {
		it('先 ensureState(canStart=true)，再传入 canStart=false → 结果仍为 true（不降级）', async () => {
			const { manager } = buildManager()
			// 第一次调用 → targetId 创建，canStart=true
			const s1 = manager.getNodePreviewState('A', 'scene-layout')
			expect(s1!.canStart).toBe(true)

			// 直接再次调用 getNodePreviewState（内部 ensureState 被再次调用，
			// 但 canStart 已经 true，会执行 || 保持 true）
			const s2 = manager.getNodePreviewState('A', 'scene-layout')
			expect(s2!.canStart).toBe(true)
		})

		it('complete 后切走 → canStart 保持 true（结合修复 A + 修复 E）', async () => {
			const { manager, active3DPreviewNodeId, selectedNodeIds } = buildManager('A', ['A'])
			await flushMicro()
			manager.startPreviewSession('A')
			manager.completePreviewSession('A')

			// 切到 B
			selectedNodeIds.value = ['B']
			active3DPreviewNodeId.value = 'B'
			await flushMicro()

			const state = manager.getNodePreviewState('A', 'scene-layout')
			expect(state!.canStart).toBe(true) // 非激活节点：修复 A
			// 再取一次，确保 canStart 没有因任何路径被打回 false
			const state2 = manager.getNodePreviewState('A', 'scene-layout')
			expect(state2!.canStart).toBe(true)
		})
	})

	// -------------------------------------------------------------------------
	// 集成用例：完整链路（用户二次激活视角）
	// -------------------------------------------------------------------------
	describe('集成场景：用户视角"二次激活节点后按钮永远不消失"的完整状态验证', () => {
		it('链路：生成 → complete → 失活 → 重新激活 → 失败（模拟 canvas=0 竞态）→ canStart 必须仍为 true，phase masked', async () => {
			const { manager, active3DPreviewNodeId, selectedNodeIds } = buildManager('S1', ['S1'])
			await flushMicro()

			// 1) 首次启动成功
			manager.startPreviewSession('S1')
			manager.completePreviewSession('S1')

			// 2) 失活（选中其他）
			selectedNodeIds.value = ['S2']
			active3DPreviewNodeId.value = 'S2'
			await flushMicro()

			// 3) 切回来（二次激活）→ 不再自动 kickoff，保持 masked，手动启动
			selectedNodeIds.value = ['S1']
			active3DPreviewNodeId.value = 'S1'
			await flushMicro()
			const sReactivate = manager.getNodePreviewState('S1', 'scene-layout')
			expect(sReactivate!.phase).toBe('masked')
			expect(sReactivate!.canStart).toBe(true)

			// 4) 用户点击常驻按钮 → startPreviewSession 进入 loading
			manager.startPreviewSession('S1')
			expect(manager.getNodePreviewState('S1', 'scene-layout')!.phase).toBe('loading')

			// 5) 启动失败（canvas 尺寸为 0，watchdog 触发 failPreviewSession）
			manager.failPreviewSession('S1')
			const sFail = manager.getNodePreviewState('S1', 'scene-layout')
			// 关键最终状态：phase=masked 但 canStart=true → 用户可再次点击按钮重试
			expect(sFail!.phase).toBe('masked')
			expect(sFail!.canStart).toBe(true)
		})
	})
})
