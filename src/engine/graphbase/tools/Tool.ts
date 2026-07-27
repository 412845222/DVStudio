import type { GraphPointerEvent, GraphKeyboardEvent, GraphWheelEvent } from '../input/events'
import type { RenderContext } from '../renderer/RenderContext'
import type { HitTestResult } from '../scene/interfaces'
import type { ToolManager } from './ToolManager'

export abstract class Tool {
	readonly name: string
	readonly cursor: string
	manager: ToolManager | null = null
	active: boolean = false
	enabled: boolean = true

	constructor(name: string, cursor: string = 'default') {
		this.name = name
		this.cursor = cursor
	}

	onActivate(): void {}
	onDeactivate(): void {}

	abstract onPointerDown(event: GraphPointerEvent, hit: HitTestResult | null): void
	abstract onPointerMove(event: GraphPointerEvent, hit: HitTestResult | null): void
	abstract onPointerUp(event: GraphPointerEvent, hit: HitTestResult | null): void

	onContextMenu(_event: GraphPointerEvent, _hit: HitTestResult | null): boolean {
		return false
	}

	onWheel(_event: GraphWheelEvent): void {}
	onKeyDown(_event: GraphKeyboardEvent): void {}
	onKeyUp(_event: GraphKeyboardEvent): void {}

	onPreRender(_ctx: RenderContext): void {}
	onRender(_ctx: RenderContext): void {}

	setCursor(cursor: string): void {
		if (this.manager) {
			this.manager.setCursor(cursor)
		}
	}
}
