import { Vector2 } from '../graphbase/core/Vector2'
import { Rect } from '../graphbase/core/Rect'
import { Node } from '../graphbase/scene/Node'
import type { RenderContext } from '../graphbase/renderer/RenderContext'
import { GRID_STEP, GRID_MAJOR_EVERY } from './types'
import { getThemeManager } from './theme'

export class BlueprintGrid extends Node {
	constructor() {
		super('grid')
		this.selectable = false
		this.draggable = false
		this.layer = -9999
	}

	render(ctx: RenderContext): void {
		if (!this.visible) return

		const localMatrix = this.transform.getLocalMatrix()

		ctx.save()
		ctx.ctx.transform(
			localMatrix.elements[0],
			localMatrix.elements[1],
			localMatrix.elements[3],
			localMatrix.elements[4],
			localMatrix.elements[6],
			localMatrix.elements[7]
		)
		this.applyStyle(ctx)
		this.renderSelf(ctx)
		this.clearShadow(ctx)

		for (let i = 0; i < this.children.length; i++) {
			const child = this.children[i]
			if (child.visible) {
				child.render(ctx)
			}
		}

		ctx.restore()
	}

	protected renderSelf(ctx: RenderContext): void {
		const c = ctx.ctx
		const camera = ctx.camera
		const zoom = camera.zoom
		const worldVp = camera.getWorldViewport()
		const theme = getThemeManager()
		const tokens = theme.tokens

		c.fillStyle = tokens.canvasBackground
		c.fillRect(worldVp.left, worldVp.top, worldVp.width, worldVp.height)

		let minorStep = GRID_STEP
		let majorStep = GRID_STEP * GRID_MAJOR_EVERY

		let screenMinorStep = minorStep * zoom

		if (screenMinorStep < 16) {
			minorStep = GRID_STEP * GRID_MAJOR_EVERY
			majorStep = minorStep * GRID_MAJOR_EVERY
			screenMinorStep = minorStep * zoom
		}
		if (screenMinorStep < 8) {
			minorStep = majorStep
			majorStep = minorStep * GRID_MAJOR_EVERY
		}

		const screenMajorStep = majorStep * zoom
		if (screenMajorStep < 20) {
			return
		}

		const dotRadiusMinor = Math.max(1 / zoom, 0.6)
		const dotRadiusMajor = Math.max(1.8 / zoom, 1)

		const startX = Math.floor(worldVp.left / minorStep) * minorStep
		const endX = Math.ceil(worldVp.right / minorStep) * minorStep
		const startY = Math.floor(worldVp.top / minorStep) * minorStep
		const endY = Math.ceil(worldVp.bottom / minorStep) * minorStep

		if (minorStep !== majorStep) {
			c.fillStyle = tokens.gridLine
			for (let x = startX; x <= endX; x += minorStep) {
				const col = Math.round(x / minorStep)
				if (col % GRID_MAJOR_EVERY === 0) continue
				for (let y = startY; y <= endY; y += minorStep) {
					const row = Math.round(y / minorStep)
					if (row % GRID_MAJOR_EVERY === 0) continue
					c.beginPath()
					c.arc(x, y, dotRadiusMinor, 0, Math.PI * 2)
					c.fill()
				}
			}
		}

		const majorStartX = Math.floor(worldVp.left / majorStep) * majorStep
		const majorEndX = Math.ceil(worldVp.right / majorStep) * majorStep
		const majorStartY = Math.floor(worldVp.top / majorStep) * majorStep
		const majorEndY = Math.ceil(worldVp.bottom / majorStep) * majorStep

		c.fillStyle = tokens.gridMajorLine
		for (let x = majorStartX; x <= majorEndX; x += majorStep) {
			for (let y = majorStartY; y <= majorEndY; y += majorStep) {
				c.beginPath()
				c.arc(x, y, dotRadiusMajor, 0, Math.PI * 2)
				c.fill()
			}
		}
	}

	getLocalBounds(): Rect {
		return new Rect(0, 0, 0, 0)
	}

	getWorldBounds(): Rect {
		return new Rect(0, 0, 0, 0)
	}

	protected hitTestSelf(_localPoint: Vector2): null {
		return null
	}
}
