import { describe, it, expect } from 'vitest'
import { BlueprintNode } from '@/engine/blueprint/BlueprintNode'
import type { BlueprintNodeData } from '@/engine/blueprint/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT = join(__dirname, '..', '..')

function createNodeData(partial: Partial<BlueprintNodeData> = {}): BlueprintNodeData {
	return {
		id: 'img-1',
		type: 'image',
		title: 'Image Node',
		worldX: 50,
		worldY: 80,
		width: 240,
		height: 160,
		sizeCustomized: false,
		inputs: [{ id: 'in', mediaType: 'image', name: 'in' }],
		outputs: [{ id: 'out', mediaType: 'image', name: 'out' }],
		...partial
	} as BlueprintNodeData
}

describe('🔵 Blueprint node size persistence (save & reload)', () => {
	describe('BlueprintNode width/height getter/setter', () => {
		it('getter should proxy node.data.width / node.data.height', () => {
			const nodeData = createNodeData({ width: 420, height: 290 })
			const node = new BlueprintNode(nodeData)

			expect(node.width).toBe(420)
			expect(node.height).toBe(290)
			expect(node.data.width).toBe(420)
			expect(node.data.height).toBe(290)
		})

		it('setter should update data and invoke updateSize (node.width/height reflect new values and ports survive)', () => {
			const node = new BlueprintNode(createNodeData({ width: 240, height: 160 }))
			expect(node.inputPorts.length).toBeGreaterThan(0)
			expect(node.outputPorts.length).toBeGreaterThan(0)

			node.width = 600
			node.height = 450

			expect(node.data.width).toBe(600)
			expect(node.data.height).toBe(450)
			expect(node.width).toBe(600)
			expect(node.height).toBe(450)
			expect(node.inputPorts.length).toBeGreaterThan(0)
			expect(node.outputPorts.length).toBeGreaterThan(0)
			// Output port must still be reachable after resize.
			expect(node.getOutputPort('out')).not.toBeNull()
			expect(node.getInputPort('in')).not.toBeNull()
		})
	})

	describe('BlueprintNode.syncDataFromTransform preserves width/height in data', () => {
		it('should not overwrite data.width / data.height with undefined', () => {
			const node = new BlueprintNode(
				createNodeData({ width: 380, height: 260, sizeCustomized: true })
			)

			node.transform.setPosition(999, 888)
			node.syncDataFromTransform()

			expect(node.data.worldX).toBe(999)
			expect(node.data.worldY).toBe(888)
			expect(node.data.width).toBe(380)
			expect(node.data.height).toBe(260)
			expect(node.data.sizeCustomized).toBe(true)
		})
	})

	describe('BlueprintLegacySaver.convertNode writes width/height/sizeCustomized explicitly', () => {
		it('source contains explicit legacyNode.width/.height/.sizeCustomized assignments', () => {
			const path = join(PROJECT_ROOT, 'src/engine/blueprint/BlueprintLegacySaver.ts')
			const content = readFileSync(path, 'utf-8')

			const hasExplicitWidth = /legacyNode\.width\s*=\s*node\.width/.test(content)
			const hasExplicitHeight = /legacyNode\.height\s*=\s*node\.height/.test(content)
			const hasExplicitSizeCustomized =
				/legacyNode\.sizeCustomized\s*=\s*node\.sizeCustomized/.test(content)
			const hasExplicitWorldX = /legacyNode\.worldX\s*=\s*node\.worldX/.test(content)
			const hasExplicitWorldY = /legacyNode\.worldY\s*=\s*node\.worldY/.test(content)

			expect(hasExplicitWidth).toBe(true)
			expect(hasExplicitHeight).toBe(true)
			expect(hasExplicitSizeCustomized).toBe(true)
			expect(hasExplicitWorldX).toBe(true)
			expect(hasExplicitWorldY).toBe(true)
		})
	})

	describe('BlueprintEditor.computeStructureHash includes size signature for every node', () => {
		it('source of BlueprintEditor.vue must include width,height,sizeCustomized inside hash computation', () => {
			const path = join(PROJECT_ROOT, 'src/engine/blueprint/BlueprintEditor.vue')
			const content = readFileSync(path, 'utf-8')

			const hasNodeSignatures = /nodeSignatures\s*=\s*nodeIds\.map/.test(content)
			const hasWidthInHash =
				/node\.width\s*\?/s.test(content) ||
				/node\.width\s*,,/.test(content) ||
				/\$\{node\.width/.test(content)
			const hasHeightInHash =
				/node\.height\s*\?/s.test(content) ||
				/node\.height\s*\}\}/.test(content) ||
				/\$\{node\.height/.test(content)
			const hasSizeCustomizedInHash = /node\.sizeCustomized/.test(content)

			expect(hasNodeSignatures).toBe(true)
			expect(hasSizeCustomizedInHash).toBe(true)

			// More robust: locate the nodeSignatures = nodeIds.map(...) block and check field access in it
			const blockMatch = content.match(
				/nodeSignatures\s*=\s*nodeIds\.map[\s\S]*?return\s+`[^`]*sizeCustomized[^`]*`/
			)
			expect(blockMatch).not.toBeNull()
			const block = blockMatch?.[0] ?? ''
			expect(block).toContain('.width')
			expect(block).toContain('.height')
			expect(block).toContain('sizeCustomized')
		})
	})

	describe('workflowStateAdapter cache key includes node size signature', () => {
		it('source of workflowStateAdapter.ts must include nodeSizeSig in the structureKey cache', () => {
			const path = join(
				PROJECT_ROOT,
				'src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts'
			)
			const content = readFileSync(path, 'utf-8')

			const hasNodeSizeSigVar = /nodeSizeSig\s*=/.test(content)
			const hasWidthInSig = /n\.width/.test(content)
			const hasHeightInSig = /n\.height/.test(content)
			const hasSizeCustomizedInSig = /sizeCustomized/.test(content)
			// Ensure nodeSizeSig is part of the cache key (appended to structureKey array)
			const hasNodeSizeSigInStructureKey =
				/(const|let|var)\s+structureKey\s*=[\s\S]*?nodeSizeSig[\s\S]*?\]/.test(content)

			expect(hasNodeSizeSigVar).toBe(true)
			expect(hasWidthInSig).toBe(true)
			expect(hasHeightInSig).toBe(true)
			expect(hasSizeCustomizedInSig).toBe(true)
			expect(hasNodeSizeSigInStructureKey).toBe(true)
		})
	})

	describe('ResizeNodeCommand.apply correctly sets sizeCustomized and updates sizes', () => {
		it('source of ResizeNodeCommand sets node.data.sizeCustomized and calls node.updateSize with new width/height', () => {
			const path = join(PROJECT_ROOT, 'src/engine/blueprint/commands/ResizeNodeCommand.ts')
			const content = readFileSync(path, 'utf-8')

			const hasUpdateSizeCall = /node\.updateSize\(/.test(content)
			const hasSizeCustomizedTrue = /node\.data\.sizeCustomized\s*=\s*true/.test(content)
			const hasSizeCustomizedFalse = /node\.data\.sizeCustomized\s*=\s*false/.test(content)

			expect(hasUpdateSizeCall).toBe(true)
			// apply() should mark sizeCustomized=true; undo() should restore it to whatever original was (not false blindly)
			expect(hasSizeCustomizedTrue).toBe(true)
			expect(hasSizeCustomizedFalse).not.toBe(true)
		})
	})

	describe('store hydrateDraft width/height clamp range is wide enough', () => {
		it('width/height clamp in store hydrateDraft mutation allows at least 40..2000 (uses n.width/n.height vars)', () => {
			const path = join(PROJECT_ROOT, 'src/store/aiworkflow/store.ts')
			const content = readFileSync(path, 'utf-8')

			// First find the hydrateDraft block, then inspect width/height lines using n.width/n.height
			const hydrateIdx = content.indexOf('hydrateDraft')
			expect(hydrateIdx).toBeGreaterThan(0)

			const widthMatch = content
				.slice(hydrateIdx)
				.match(/n\.width[\s\S]*?Math\.max\(\s*(\d+)\s*,\s*Math\.min\(\s*(\d+)/)
			const heightMatch = content
				.slice(hydrateIdx)
				.match(/n\.height[\s\S]*?Math\.max\(\s*(\d+)\s*,\s*Math\.min\(\s*(\d+)/)

			expect(widthMatch).not.toBeNull()
			expect(heightMatch).not.toBeNull()

			const wMin = Number(widthMatch?.[1])
			const wMax = Number(widthMatch?.[2])
			const hMin = Number(heightMatch?.[1])
			const hMax = Number(heightMatch?.[2])

			expect(wMin).toBeLessThanOrEqual(40)
			expect(wMax).toBeGreaterThanOrEqual(2000)
			expect(hMin).toBeLessThanOrEqual(40)
			expect(hMax).toBeGreaterThanOrEqual(2000)
		})
	})
})
