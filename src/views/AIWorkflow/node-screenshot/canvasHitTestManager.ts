/**
 * Canvas Hit Test Manager - Canvas2D碰撞检测管理器
 *
 * 功能:
 * 1. 矩形相交快速检测
 * 2. 圆角节点精确检测
 * 3. 节流防止事件风暴
 * 4. 视口裁剪优化
 */

export interface NodeBounds {
	nodeId: string
	worldX: number
	worldY: number
	width: number
	height: number
	radius: number
}

export interface HitTestOptions {
	/** 节流毫秒数，默认16 (60fps) */
	throttleMs?: number
	/** 是否启用精确圆角检测，默认false (使用矩形快速检测) */
	preciseRoundedRect?: boolean
}

export interface HitTestResult {
	nodeId: string | null
	distance?: number
}

export class CanvasHitTestManager {
	private bounds = new Map<string, NodeBounds>()
	private lastHitTestTime = 0
	private options: Required<HitTestOptions>
	private lastHoveredNodeId: string | null = null

	// 回调
	private onHoverChange?: (nodeId: string | null) => void
	private onNodeClick?: (nodeId: string) => void

	constructor(options: HitTestOptions = {}) {
		this.options = {
			throttleMs: options.throttleMs ?? 16,
			preciseRoundedRect: options.preciseRoundedRect ?? false
		}
	}

	/**
	 * 设置回调
	 */
	setCallbacks(callbacks: {
		onHoverChange?: (nodeId: string | null) => void
		onNodeClick?: (nodeId: string) => void
	}): void {
		this.onHoverChange = callbacks.onHoverChange
		this.onNodeClick = callbacks.onNodeClick
	}

	/**
	 * 更新节点边界
	 */
	updateBounds(nodeId: string, bounds: Omit<NodeBounds, 'nodeId'>): void {
		this.bounds.set(nodeId, { nodeId, ...bounds })
	}

	/**
	 * 批量更新节点边界
	 */
	updateBoundsBatch(nodeEntries: NodeBounds[]): void {
		for (const entry of nodeEntries) {
			this.bounds.set(entry.nodeId, entry)
		}
	}

	/**
	 * 移除节点边界
	 */
	removeBounds(nodeId: string): void {
		this.bounds.delete(nodeId)
	}

	/**
	 * 批量移除节点边界
	 */
	removeBoundsBatch(nodeIds: string[]): void {
		for (const nodeId of nodeIds) {
			this.bounds.delete(nodeId)
		}
	}

	/**
	 * 清空所有边界
	 */
	clear(): void {
		this.bounds.clear()
		this.lastHoveredNodeId = null
	}

	/**
	 * 碰撞检测
	 */
	hitTest(worldX: number, worldY: number): string | null {
		// 从后往前遍历 (Z-order)
		const nodeIds = Array.from(this.bounds.keys()).reverse()

		for (const nodeId of nodeIds) {
			const bounds = this.bounds.get(nodeId)
			if (!bounds) continue

			if (this.options.preciseRoundedRect) {
				if (this.pointInRoundedRect(worldX, worldY, bounds)) {
					return nodeId
				}
			} else {
				if (this.pointInRect(worldX, worldY, bounds)) {
					return nodeId
				}
			}
		}

		return null
	}

	/**
	 * 获取碰撞的所有节点 (用于框选)
	 */
	hitTestAll(worldRect: { x0: number; y0: number; x1: number; y1: number }): string[] {
		const hits: string[] = []

		for (const [nodeId, bounds] of this.bounds) {
			if (this.rectIntersectsRect(bounds, worldRect)) {
				hits.push(nodeId)
			}
		}

		return hits
	}

	/**
	 * 圆角矩形碰撞检测
	 */
	private pointInRoundedRect(x: number, y: number, bounds: NodeBounds): boolean {
		const left = bounds.worldX - bounds.width / 2
		const right = bounds.worldX + bounds.width / 2
		const top = bounds.worldY - bounds.height / 2
		const bottom = bounds.worldY + bounds.height / 2

		// 快速矩形检测
		if (x < left || x > right || y < top || y > bottom) {
			return false
		}

		// 如果没有圆角，直接返回
		if (bounds.radius <= 0) {
			return true
		}

		// 检测四个角
		const corners = [
			{ x: left + bounds.radius, y: top + bounds.radius }, // 左上
			{ x: right - bounds.radius, y: top + bounds.radius }, // 右上
			{ x: left + bounds.radius, y: bottom - bounds.radius }, // 左下
			{ x: right - bounds.radius, y: bottom - bounds.radius } // 右下
		]

		for (const corner of corners) {
			const dx = Math.abs(x - corner.x)
			const dy = Math.abs(y - corner.y)

			// 在角区域内，检测是否在圆弧内
			if (dx < bounds.radius && dy < bounds.radius) {
				const distSq = dx * dx + dy * dy
				if (distSq > bounds.radius * bounds.radius) {
					return false
				}
			}
		}

		return true
	}

	/**
	 * 矩形碰撞检测 (简化版)
	 */
	private pointInRect(x: number, y: number, bounds: NodeBounds): boolean {
		const left = bounds.worldX - bounds.width / 2
		const right = bounds.worldX + bounds.width / 2
		const top = bounds.worldY - bounds.height / 2
		const bottom = bounds.worldY + bounds.height / 2

		return x >= left && x <= right && y >= top && y <= bottom
	}

	/**
	 * 矩形相交检测
	 */
	private rectIntersectsRect(
		bounds: NodeBounds,
		rect: { x0: number; y0: number; x1: number; y1: number }
	): boolean {
		const left = bounds.worldX - bounds.width / 2
		const right = bounds.worldX + bounds.width / 2
		const top = bounds.worldY - bounds.height / 2
		const bottom = bounds.worldY + bounds.height / 2

		return !(right < rect.x0 || left > rect.x1 || bottom < rect.y0 || top > rect.y1)
	}

	/**
	 * 是否应该进行碰撞检测 (节流)
	 */
	private shouldHitTest(): boolean {
		const now = performance.now()
		if (now - this.lastHitTestTime < this.options.throttleMs) {
			return false
		}
		this.lastHitTestTime = now
		return true
	}

	/**
	 * 处理鼠标移动
	 */
	handleMouseMove(worldX: number, worldY: number): string | null {
		// 节流
		if (!this.shouldHitTest()) {
			return this.lastHoveredNodeId
		}

		const hitNodeId = this.hitTest(worldX, worldY)

		if (hitNodeId !== this.lastHoveredNodeId) {
			this.lastHoveredNodeId = hitNodeId
			this.onHoverChange?.(hitNodeId)
		}

		return hitNodeId
	}

	/**
	 * 处理鼠标点击
	 */
	handleClick(worldX: number, worldY: number): string | null {
		const hitNodeId = this.hitTest(worldX, worldY)
		if (hitNodeId) {
			this.onNodeClick?.(hitNodeId)
		}
		return hitNodeId
	}

	/**
	 * 处理指针按下
	 */
	handlePointerDown(worldX: number, worldY: number): string | null {
		return this.hitTest(worldX, worldY)
	}

	/**
	 * 获取最近的节点
	 */
	findNearestNode(worldX: number, worldY: number, maxDistance?: number): HitTestResult {
		let nearestId: string | null = null
		let nearestDist = Infinity

		for (const [nodeId, bounds] of this.bounds) {
			const dx = worldX - bounds.worldX
			const dy = worldY - bounds.worldY
			const dist = Math.sqrt(dx * dx + dy * dy)

			if (dist < nearestDist) {
				if (maxDistance === undefined || dist <= maxDistance) {
					nearestDist = dist
					nearestId = nodeId
				}
			}
		}

		return {
			nodeId: nearestId,
			distance: nearestId ? nearestDist : undefined
		}
	}

	/**
	 * 获取边界
	 */
	getBounds(nodeId: string): NodeBounds | null {
		return this.bounds.get(nodeId) ?? null
	}

	/**
	 * 获取所有边界
	 */
	getAllBounds(): NodeBounds[] {
		return Array.from(this.bounds.values())
	}

	/**
	 * 获取边界数量
	 */
	getCount(): number {
		return this.bounds.size
	}

	/**
	 * 检查是否为空
	 */
	isEmpty(): boolean {
		return this.bounds.size === 0
	}

	/**
	 * 设置节流毫秒数
	 */
	setThrottleMs(ms: number): void {
		this.options.throttleMs = Math.max(1, ms)
	}

	/**
	 * 设置是否启用精确圆角检测
	 */
	setPreciseRoundedRect(enabled: boolean): void {
		this.options.preciseRoundedRect = enabled
	}

	/**
	 * 获取统计信息
	 */
	getStats(): {
		boundCount: number
		throttleMs: number
		preciseRoundedRect: boolean
	} {
		return {
			boundCount: this.bounds.size,
			throttleMs: this.options.throttleMs,
			preciseRoundedRect: this.options.preciseRoundedRect
		}
	}

	/**
	 * 清理
	 */
	dispose(): void {
		this.bounds.clear()
		this.lastHoveredNodeId = null
		this.onHoverChange = undefined
		this.onNodeClick = undefined
	}
}
