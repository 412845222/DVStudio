import { Rect } from '../../graphbase/core/Rect'
import { SELECTION_FRAME_CONSTANTS } from '../SelectionFrame'
import {
	AUTOMATION_BAR_HEIGHT,
	PORTAL_MIN_GAP,
	type FrameIoBinding,
	type PortalAnchorGeometry,
	type PortalDirection
} from './FrameAutomationTypes'

/**
 * 开启自动化后，自动化按钮条插入在 tag bar 与 frame body 之间。
 * frame body 与成员节点的相对位置必须保持不变，因此整体外框向上扩展一行。
 * 注意：与既有 computeSelectionBounds 的约定一致，bounds 存原始 world 增量（zoom=1 视觉），
 * 实际绘制与命中时再按 cameraZoom 换算（见下方 *WorldRect(..., zoom) 系列函数）。
 */
export function computeAutomationOuterRect(baseRect: Rect, enabled: boolean): Rect {
	if (!enabled) return baseRect
	return new Rect(
		baseRect.x,
		baseRect.y - AUTOMATION_BAR_HEIGHT,
		baseRect.width,
		baseRect.height + AUTOMATION_BAR_HEIGHT
	)
}

/** 自动化按钮条的视觉 world 矩形（位于 tag bar 正下方，高度随 zoom 换算） */
export function getAutomationBarWorldRect(outerRect: Rect, cameraZoom: number): Rect {
	const invZ = 1 / cameraZoom
	const tagBarH = SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT * invZ
	return new Rect(outerRect.x, outerRect.y + tagBarH, outerRect.width, AUTOMATION_BAR_HEIGHT * invZ)
}

/** frame body（包住成员节点的虚线框区域）视觉 world 矩形 */
export function getFrameBodyWorldRect(outerRect: Rect, enabled: boolean, cameraZoom: number): Rect {
	const invZ = 1 / cameraZoom
	const topInset =
		(SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT + (enabled ? AUTOMATION_BAR_HEIGHT : 0)) * invZ
	return new Rect(outerRect.x, outerRect.y + topInset, outerRect.width, outerRect.height - topInset)
}

export interface PortalLayoutInput {
	binding: FrameIoBinding
	/** 被绑定内部锚点的世界 Y（可能拿不到，此时为 null，按堆叠布局） */
	worldY: number | null
}

/**
 * 计算一侧门户锚点的几何位置。
 * - X 吸附在 frame body 左/右边线；
 * - Y 优先对齐内部锚点世界 Y，重叠时按最小间距顺序摊开；
 * - 堆叠超出 body 时整体上移收进 body，再超出则自上而下均匀排列。
 * 纯派生计算，坐标绝不持久化。
 */
export function layoutPortalAnchors(
	items: PortalLayoutInput[],
	bodyRect: Rect,
	direction: PortalDirection,
	cameraZoom: number
): PortalAnchorGeometry[] {
	// 门户为屏幕常量尺寸，世界坐标下按 1/zoom 换算（与 Port/标签栏一致）
	const invZ = 1 / cameraZoom
	const half = 12 * invZ // 与 PORT_SIZE/2 对齐的热区半尺寸
	const sorted = [...items].sort((a, b) => {
		const ya = a.worldY ?? Number.POSITIVE_INFINITY
		const yb = b.worldY ?? Number.POSITIVE_INFINITY
		return ya - yb
	})

	const minY = bodyRect.y + half
	const maxY = bodyRect.y + bodyRect.height - half
	const x = direction === 'in' ? bodyRect.x : bodyRect.x + bodyRect.width
	const gap = PORTAL_MIN_GAP * invZ

	let placed: { binding: FrameIoBinding; y: number }[] = []
	let fallbackCursor = minY
	for (const item of sorted) {
		let y = item.worldY ?? fallbackCursor
		if (y < minY) y = minY
		const prev = placed[placed.length - 1]
		if (prev && y - prev.y < gap) {
			y = prev.y + gap
		}
		placed.push({ binding: item.binding, y })
		fallbackCursor = y + gap
	}

	if (placed.length > 0) {
		const lastY = placed[placed.length - 1].y
		if (lastY > maxY) {
			const overflow = lastY - maxY
			const shifted = placed.map((p) => ({ ...p, y: p.y - overflow }))
			if (shifted[0].y >= minY) {
				placed = shifted
			} else {
				const usable = Math.max(maxY - minY, gap * (placed.length - 1))
				const step = placed.length > 1 ? Math.min(gap, usable / (placed.length - 1)) : 0
				placed = placed.map((p, i) => ({ ...p, y: minY + step * i }))
			}
		}
	}

	return placed.map(({ binding, y }) => ({
		bindingId: binding.id,
		direction,
		x,
		y,
		mediaType: binding.mediaType ?? 'generic',
		label: binding.label ?? '',
		nodeId: binding.nodeId,
		anchorId: binding.anchorId
	}))
}
