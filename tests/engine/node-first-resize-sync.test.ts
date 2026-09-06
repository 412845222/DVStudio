import { describe, it, expect } from 'vitest'
import { BlueprintNode } from '@/engine/blueprint/BlueprintNode'
import { getDefaultNodeData } from '@/engine/blueprint/types'
import type { BlueprintNodeData } from '@/engine/blueprint/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT = join(__dirname, '..', '..')

/**
 * 回归守卫：新建节点"第一次拖拽四角锚点 resize 时节点宽高不实时变化"问题。
 *
 * 根因链（详见 AIPlan/节点首拖缩放尺寸实时同步修复/设计方案.md）：
 * 1. WorkflowNodeWrapper.resolvedProps 从非响应式 node.data 解析 width/height/sizeCustomized，
 *    resize 期间业务组件持有挂载时刻的尺寸快照；
 * 2. WorkflowNodeBase.requestAutoResize 用内联 height !important 强写 .dom-node-wrapper，
 *    覆盖 overlay 的 Vue 绑定；
 * 3. 首拖第一帧写入的 node.data.sizeCustomized=true 无法传导给业务组件，
 *    ResizeObserver 不拆除、内联覆盖不清理，高度被持续钉回"内容自然高度"。
 * 修复：overlay 每帧下发 sizeCustomized（响应式）→ WorkflowNodeWrapper 用响应式 props
 * 覆盖尺寸字段 → WorkflowNodeBase 禁止写 wrapper 内联样式并在定制模式清理遗留内联高度。
 */

const OVERLAY_PATH = join(PROJECT_ROOT, 'src/engine/blueprint/dom/BlueprintDomOverlay.vue')
const WRAPPER_PATH = join(PROJECT_ROOT, 'src/engine/blueprint/dom/WorkflowNodeWrapper.vue')
const NODE_BASE_PATH = join(PROJECT_ROOT, 'src/ui/WorkFlow/WorkflowNodeBase.vue')

describe('🔵 Node first-drag resize sync (新节点首拖缩放尺寸实时同步)', () => {
	describe('data layer: 新建节点默认状态与 updateSize 即时生效', () => {
		it('getDefaultNodeData must NOT set sizeCustomized (新建节点进入 auto-height 模式)', () => {
			const data = getDefaultNodeData('text', 'n-1', 0, 0)
			expect(data.sizeCustomized).toBeFalsy()
		})

		it('updateSize must be reflected by getWorldBounds immediately (overlay 每帧读取的数据源)', () => {
			const data: BlueprintNodeData = {
				...getDefaultNodeData('text', 'n-1', 50, 80),
				inputs: [{ id: 'in', mediaType: 'text', name: 'in' }],
				outputs: [{ id: 'out', mediaType: 'text', name: 'out' }]
			} as BlueprintNodeData
			const node = new BlueprintNode(data)
			const before = node.getWorldBounds()

			node.updateSize(600, 450)

			const after = node.getWorldBounds()
			expect(after.width).toBe(600)
			expect(after.height).toBe(450)
			expect(after.width).not.toBe(before.width)
			expect(node.data.sizeCustomized).toBeFalsy()
		})
	})

	describe('overlay layer: syncDomNodes 必须每帧下发 sizeCustomized', () => {
		it('DomNodeRenderData interface declares sizeCustomized: boolean', () => {
			const content = readFileSync(OVERLAY_PATH, 'utf-8')
			expect(/interface\s+DomNodeRenderData\s*\{[\s\S]*?sizeCustomized:\s*boolean/.test(content)).toBe(
				true
			)
		})

		it('newRenders.push fills sizeCustomized from node.data every frame', () => {
			const content = readFileSync(OVERLAY_PATH, 'utf-8')
			expect(/sizeCustomized:\s*!!node\.data\.sizeCustomized/.test(content)).toBe(true)
		})

		it('template passes :size-customized to WorkflowNodeWrapper', () => {
			const content = readFileSync(OVERLAY_PATH, 'utf-8')
			expect(/<WorkflowNodeWrapper[\s\S]*?:size-customized="node\.sizeCustomized"/.test(content)).toBe(
				true
			)
		})
	})

	describe('wrapper layer: resolvedProps 必须以响应式 props 覆盖尺寸字段', () => {
		it('WorkflowNodeWrapper declares sizeCustomized prop', () => {
			const content = readFileSync(WRAPPER_PATH, 'utf-8')
			expect(/sizeCustomized:\s*boolean/.test(content)).toBe(true)
		})

		it('resolvedProps return overrides width/height/sizeCustomized/autoHeight with reactive props', () => {
			const content = readFileSync(WRAPPER_PATH, 'utf-8')
			const returnMatch = content.match(
				/return\s*\{\s*\.\.\.baseProps,\s*\.\.\.extraResolved,([\s\S]*?)\}\s*\}\)/
			)
			expect(returnMatch, 'resolvedProps final return block must exist').toBeTruthy()
			const block = returnMatch?.[0] ?? ''
			expect(block).toContain('width: props.width')
			expect(block).toContain('height: props.height')
			expect(block).toContain('sizeCustomized: props.sizeCustomized === true')
			expect(block).toContain('autoHeight: props.sizeCustomized !== true')
		})
	})

	describe('base layer: auto-height 不得侵入 wrapper 内联样式，且定制模式需清理遗留覆盖', () => {
		it('requestAutoResize must NOT write inline height to .dom-node-wrapper anymore', () => {
			const content = readFileSync(NODE_BASE_PATH, 'utf-8')
			// 以下一个函数头为界切片，避免闭包花括号匹配不稳定
			const start = content.indexOf('const requestAutoResize')
			const end = content.indexOf('const setupResizeObserver')
			expect(start, 'requestAutoResize function must exist').toBeGreaterThan(0)
			expect(end, 'setupResizeObserver function must exist').toBeGreaterThan(start)
			const body = content.slice(start, end)
			expect(body).not.toContain("contains('dom-node-wrapper')")
			expect(body).not.toContain('parent.style.setProperty')
		})

		it('sizeCustomized watcher must remove lingering inline height override (customized=true branch)', () => {
			const content = readFileSync(NODE_BASE_PATH, 'utf-8')
			const watchMatch = content.match(
				/watch\s*\(\s*\(\s*\)\s*=>\s*props\.sizeCustomized[\s\S]*?\(customized\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)/
			)
			expect(watchMatch, 'sizeCustomized watcher must exist').toBeTruthy()
			const body = watchMatch?.[1] ?? ''
			expect(body).toContain('teardownResizeObserver()')
			expect(body).toContain("el.style.removeProperty('height')")
		})
	})
})
