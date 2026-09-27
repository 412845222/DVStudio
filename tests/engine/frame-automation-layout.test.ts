import { describe, it, expect } from 'vitest'
import { Rect } from '../../src/engine/graphbase/core/Rect'
import {
	computeAutomationOuterRect,
	getFrameBodyWorldRect,
	layoutPortalAnchors
} from '../../src/engine/blueprint/frame-automation/frameAutomationGeometry'
describe('independent frame portal rails', () => {
	it.each([0.25, 0.5, 1, 2, 6])(
		'separates port hit regions and fits 50 ports at zoom %s',
		(zoom) => {
			const base = new Rect(-12, -40, 264, 252)
			const outer = computeAutomationOuterRect(base, true, zoom, 50)
			expect((-12 - outer.x) * zoom).toBeGreaterThan(22 * zoom + 22 + 8)
			const body = getFrameBodyWorldRect(outer, true, zoom)
			const anchors = layoutPortalAnchors(
				Array.from({ length: 50 }, (_, i) => ({
					binding: { id: String(i), nodeId: 'n', anchorId: 'in' },
					worldY: 50
				})),
				body,
				'in',
				zoom
			)
			for (let i = 1; i < anchors.length; i++)
				expect((anchors[i].y - anchors[i - 1].y) * zoom).toBeGreaterThanOrEqual(51.99)
			expect(anchors.at(-1)!.y).toBeLessThanOrEqual(body.y + body.height)
		}
	)
})
