import { describe, it, expect } from 'vitest'
import {
	calcNodeDialogPosition,
	DIALOG_MIN_WIDTH,
	DIALOG_MAX_WIDTH,
	DIALOG_DEFAULT_NODE_WIDTH
} from '@/ui/BluePrint/node-dialog/nodeChatConfig'

describe('nodeChatConfig / calcNodeDialogPosition', () => {
	it('uses default node width when nodeWidth is undefined', () => {
		const result = calcNodeDialogPosition(undefined)
		expect(result.width).toBe(`${DIALOG_MIN_WIDTH}px`)
		const expectedLeft = (DIALOG_DEFAULT_NODE_WIDTH - DIALOG_MIN_WIDTH) / 2
		expect(result.left).toBe(`${expectedLeft}px`)
	})

	it('clamps dialog width to DIALOG_MIN_WIDTH when node is narrower than min', () => {
		const narrowNode = 200
		const result = calcNodeDialogPosition(narrowNode)
		expect(result.width).toBe(`${DIALOG_MIN_WIDTH}px`)
		const expectedLeft = (narrowNode - DIALOG_MIN_WIDTH) / 2
		expect(result.left).toBe(`${expectedLeft}px`)
		expect(expectedLeft).toBeLessThan(0)
	})

	it('clamps dialog width to DIALOG_MAX_WIDTH when node is wider than max', () => {
		const wideNode = 800
		const result = calcNodeDialogPosition(wideNode)
		expect(result.width).toBe(`${DIALOG_MAX_WIDTH}px`)
		const expectedLeft = (wideNode - DIALOG_MAX_WIDTH) / 2
		expect(result.left).toBe(`${expectedLeft}px`)
		expect(expectedLeft).toBeGreaterThan(0)
	})

	it('uses node width directly when node width is between min and max', () => {
		const nodeWidth = 450
		const result = calcNodeDialogPosition(nodeWidth)
		expect(result.width).toBe(`${nodeWidth}px`)
		expect(result.left).toBe('0px')
	})

	it('centers dialog correctly when node width equals min width', () => {
		const result = calcNodeDialogPosition(DIALOG_MIN_WIDTH)
		expect(result.width).toBe(`${DIALOG_MIN_WIDTH}px`)
		expect(result.left).toBe('0px')
	})

	it('centers dialog correctly when node width equals max width', () => {
		const result = calcNodeDialogPosition(DIALOG_MAX_WIDTH)
		expect(result.width).toBe(`${DIALOG_MAX_WIDTH}px`)
		expect(result.left).toBe('0px')
	})

	it('returns pixel strings formatted with px suffix', () => {
		const result = calcNodeDialogPosition(400)
		expect(result.width).toMatch(/^\d+px$/)
		expect(result.left).toMatch(/^-?\d+(?:\.\d+)?px$/)
	})

	it('dialog left + dialog width should be centered relative to node for typical node width (280)', () => {
		const nodeWidth = 280
		const result = calcNodeDialogPosition(nodeWidth)
		const dialogWidthNum = parseInt(result.width, 10)
		const leftNum = parseFloat(result.left)
		expect(leftNum * 2 + dialogWidthNum).toBeCloseTo(nodeWidth, 5)
	})

	it('dialog left + dialog width should be centered relative to node for wide node (700)', () => {
		const nodeWidth = 700
		const result = calcNodeDialogPosition(nodeWidth)
		const dialogWidthNum = parseInt(result.width, 10)
		const leftNum = parseFloat(result.left)
		expect(leftNum * 2 + dialogWidthNum).toBeCloseTo(nodeWidth, 5)
	})

	it('dialog left + dialog width should be centered relative to node for narrow node (240)', () => {
		const nodeWidth = 240
		const result = calcNodeDialogPosition(nodeWidth)
		const dialogWidthNum = parseInt(result.width, 10)
		const leftNum = parseFloat(result.left)
		expect(leftNum * 2 + dialogWidthNum).toBeCloseTo(nodeWidth, 5)
	})
})
