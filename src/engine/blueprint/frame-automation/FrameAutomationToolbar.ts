import { Vector2 } from '../../graphbase/core/Vector2'
import { Rect } from '../../graphbase/core/Rect'
import { MEDIA_TYPE_COLORS } from '../types'
import { SELECTION_FRAME_CONSTANTS } from '../SelectionFrame'
import { getThemeManager } from '../theme'
import { t } from '../i18n'
import { AUTOMATION_LOOP_MAX } from './FrameAutomationTypes'
import type {
	AutomationBarHit,
	FrameAutomationData,
	FrameAutomationRunState,
	PortalAnchorGeometry,
	PortalDirection
} from './FrameAutomationTypes'

// —— 屏幕常量 px（绘制时 /zoom 换算，与 SelectionFrame 约定一致） ——
const TOGGLE_W = 78
const BTN_H = 22
const STEP_W = 22
const NUM_W = 42
const GAP = 6
const MARGIN = 8
const RUN_W = 76
const EXIT_W = 48
const MODE_BTN_PAD = 14
const PORT_HIT_RADIUS = 22
const PORT_OUTER = 24
const PORT_INNER = 10
const PORT_REMOVE_HIT = 10

export type BindingMode = 'none' | 'binding-input' | 'binding-output'

interface CameraLike {
	zoom: number
	worldToScreen(p: Vector2): Vector2
	screenToWorld(p: Vector2): Vector2
}

interface BarLayout {
	minus: Rect
	plus: Rect
	loopInput: Rect
	setInputs: Rect
	setOutputs: Rect
	run: Rect
	exit: Rect
}

function withAlpha(color: string, alpha: number): string {
	if (color.startsWith('rgba')) {
		const m = color.match(/rgba?\(([^)]+)\)/)
		if (m) {
			const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
			if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
		}
		return color
	}
	if (color.startsWith('rgb')) {
		const m = color.match(/rgb\(([^)]+)\)/)
		if (m) {
			const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
			if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
		}
		return color
	}
	const h = color.replace('#', '')
	const r = parseInt(h.substring(0, 2), 16)
	const g = parseInt(h.substring(2, 4), 16)
	const b = parseInt(h.substring(4, 6), 16)
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const baseColor = () => getThemeManager().tokens.selectionFrame || 'rgba(31, 157, 132, 0.85)'

function font(zoom: number, weight = 500): string {
	return `${weight} ${11 / zoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
}

function measureText(
	ctx: CanvasRenderingContext2D,
	zoom: number,
	text: string,
	weight = 600
): number {
	ctx.save()
	ctx.font = font(zoom, weight)
	const w = ctx.measureText(text).width
	ctx.restore()
	return w
}

/**
 * 计算自动化按钮条内各控件的 world 矩形。
 * 绘制与命中测试共用，保证 1:1 对齐。
 */
export function computeBarLayout(
	ctx: CanvasRenderingContext2D,
	barRect: Rect,
	zoom: number,
	automation: FrameAutomationData,
	mode: BindingMode,
	runState: FrameAutomationRunState | null
): BarLayout {
	const invZ = 1 / zoom
	const gap = GAP * invZ
	const margin = MARGIN * invZ
	const btnH = BTN_H * invZ
	const stepW = STEP_W * invZ
	const numW = NUM_W * invZ
	const y = barRect.y + (barRect.height - btnH) / 2

	// 左侧：循环 [-] n [+]
	const loopLabel = t('aiworkflow.canvas.automation.loop')
	const loopLabelW = measureText(ctx, zoom, loopLabel, 500) + gap
	let cx = barRect.x + margin
	const loopLabelX = cx
	cx += loopLabelW
	void loopLabelX
	const minus = new Rect(cx, y, stepW, btnH)
	cx += stepW + gap * 0.5
	const loopInput = new Rect(cx, y, numW, btnH)
	cx += numW + gap * 0.5
	const plus = new Rect(cx, y, stepW, btnH)
	cx += stepW + gap * 1.5

	// 设定输入 / 设定输出
	const inputsText = t('aiworkflow.canvas.automation.setInputs')
	const outputsText = t('aiworkflow.canvas.automation.setOutputs')
	const inputsW = measureText(ctx, zoom, inputsText) + MODE_BTN_PAD * invZ
	const outputsW = measureText(ctx, zoom, outputsText) + MODE_BTN_PAD * invZ
	const setInputs = new Rect(cx, y, inputsW, btnH)
	cx += inputsW + gap
	const setOutputs = new Rect(cx, y, outputsW, btnH)
	void mode

	// 右侧：运行 / 退出
	const runText =
		runState?.status === 'running' && runState.totalIterations
			? `${runState.currentIteration ?? 0}/${runState.totalIterations}`
			: t('aiworkflow.canvas.automation.run')
	const runW = Math.max(RUN_W * invZ, measureText(ctx, zoom, runText, 600) + 16 * invZ)
	const exitW = EXIT_W * invZ
	const exit = new Rect(barRect.x + barRect.width - margin - exitW, y, exitW, btnH)
	const run = new Rect(exit.x - gap - runW, y, runW, btnH)

	return { minus, plus, loopInput, setInputs, setOutputs, run, exit }
}

function drawButton(
	ctx: CanvasRenderingContext2D,
	rect: Rect,
	zoom: number,
	text: string,
	opts: { active?: boolean; accent?: boolean; muted?: boolean; disabled?: boolean } = {}
): void {
	const color = baseColor()
	ctx.save()
	if (opts.disabled) {
		ctx.fillStyle = withAlpha(color, 0.06)
	} else if (opts.accent) {
		ctx.fillStyle = withAlpha(color, 0.42)
	} else if (opts.active) {
		ctx.fillStyle = withAlpha(color, 0.28)
	} else {
		ctx.fillStyle = withAlpha(color, 0.1)
	}
	ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
	ctx.lineWidth = 1 / zoom
	ctx.strokeStyle = opts.disabled
		? withAlpha(color, 0.25)
		: withAlpha(color, opts.muted ? 0.45 : 0.8)
	ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
	ctx.fillStyle = opts.disabled ? withAlpha('#ffffff', 0.35) : 'rgba(255,255,255,0.92)'
	ctx.font = font(zoom, 600)
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1 / zoom)
	ctx.restore()
}

/** 绘制 tag bar 上的「⚙ 自动化」开关（删除按钮左侧） */
export function drawAutomationToggle(
	ctx: CanvasRenderingContext2D,
	outerRect: Rect,
	zoom: number,
	enabled: boolean
): void {
	const invZ = 1 / zoom
	const tagBarH = SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT * invZ
	const btnSize = SELECTION_FRAME_CONSTANTS.DELETE_BTN_SIZE * invZ
	const btnMargin = SELECTION_FRAME_CONSTANTS.DELETE_BTN_MARGIN * invZ
	const toggleW = TOGGLE_W * invZ
	const x = outerRect.x + outerRect.width - btnMargin - btnSize - btnMargin - toggleW
	const y = outerRect.y + (tagBarH - btnSize) / 2
	const color = baseColor()
	const text = enabled
		? t('aiworkflow.canvas.automation.toggleOn')
		: t('aiworkflow.canvas.automation.toggleOff')

	ctx.save()
	ctx.fillStyle = enabled ? withAlpha(color, 0.4) : withAlpha(color, 0.12)
	ctx.fillRect(x, y, toggleW, btnSize)
	ctx.lineWidth = 1 / zoom
	ctx.strokeStyle = withAlpha(color, enabled ? 1 : 0.7)
	ctx.strokeRect(x, y, toggleW, btnSize)
	ctx.fillStyle = 'rgba(255,255,255,0.92)'
	ctx.font = font(zoom, 600)
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(text, x + toggleW / 2, y + btnSize / 2 + 1 / zoom)
	ctx.restore()
}

/** 命中 tag bar 自动化开关（与 drawAutomationToggle 同构） */
export function hitTestAutomationToggle(
	screenPoint: Vector2,
	outerRect: Rect,
	camera: CameraLike
): boolean {
	const invZ = 1 / camera.zoom
	const tagBarH = SELECTION_FRAME_CONSTANTS.TAG_BAR_HEIGHT * invZ
	const btnSize = SELECTION_FRAME_CONSTANTS.DELETE_BTN_SIZE * invZ
	const btnMargin = SELECTION_FRAME_CONSTANTS.DELETE_BTN_MARGIN * invZ
	const toggleW = TOGGLE_W * invZ
	const wx = outerRect.x + outerRect.width - btnMargin - btnSize - btnMargin - toggleW
	const wy = outerRect.y + (tagBarH - btnSize) / 2
	const tl = camera.worldToScreen(new Vector2(wx, wy))
	const screenRect = new Rect(tl.x, tl.y, toggleW * camera.zoom, btnSize * camera.zoom)
	return screenRect.containsPoint(screenPoint)
}

/** 绘制第二行自动化按钮条 */
export function drawAutomationBar(
	ctx: CanvasRenderingContext2D,
	barRect: Rect,
	zoom: number,
	automation: FrameAutomationData,
	mode: BindingMode,
	runState: FrameAutomationRunState | null
): BarLayout {
	const color = baseColor()
	const layout = computeBarLayout(ctx, barRect, zoom, automation, mode, runState)

	ctx.save()
	// 整条玻璃底
	ctx.fillStyle = withAlpha(color, 0.07)
	ctx.fillRect(barRect.x, barRect.y, barRect.width, barRect.height)
	ctx.lineWidth = 1 / zoom
	ctx.strokeStyle = withAlpha(color, 0.55)
	ctx.beginPath()
	ctx.moveTo(barRect.x, barRect.y)
	ctx.lineTo(barRect.x + barRect.width, barRect.y)
	ctx.moveTo(barRect.x, barRect.y + barRect.height)
	ctx.lineTo(barRect.x + barRect.width, barRect.y + barRect.height)
	ctx.stroke()

	// 「循环」标题
	ctx.fillStyle = 'rgba(255,255,255,0.75)'
	ctx.font = font(zoom, 500)
	ctx.textAlign = 'left'
	ctx.textBaseline = 'middle'
	const invZ = 1 / zoom
	const loopLabel = t('aiworkflow.canvas.automation.loop')
	ctx.fillText(loopLabel, barRect.x + MARGIN * invZ, barRect.y + barRect.height / 2)

	const running = runState?.status === 'running'
	drawButton(ctx, layout.minus, zoom, '−')
	// 次数框
	ctx.fillStyle = withAlpha('#ffffff', 0.14)
	ctx.fillRect(
		layout.loopInput.x,
		layout.loopInput.y,
		layout.loopInput.width,
		layout.loopInput.height
	)
	ctx.strokeStyle = withAlpha(color, 0.7)
	ctx.strokeRect(
		layout.loopInput.x,
		layout.loopInput.y,
		layout.loopInput.width,
		layout.loopInput.height
	)
	ctx.fillStyle = 'rgba(255,255,255,0.95)'
	ctx.font = font(zoom, 600)
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(
		String(automation.loopCount),
		layout.loopInput.x + layout.loopInput.width / 2,
		layout.loopInput.y + layout.loopInput.height / 2
	)
	drawButton(ctx, layout.plus, zoom, '+', { disabled: automation.loopCount >= AUTOMATION_LOOP_MAX })

	drawButton(ctx, layout.setInputs, zoom, t('aiworkflow.canvas.automation.setInputs'), {
		active: mode === 'binding-input'
	})
	drawButton(ctx, layout.setOutputs, zoom, t('aiworkflow.canvas.automation.setOutputs'), {
		active: mode === 'binding-output'
	})
	drawButton(
		ctx,
		layout.run,
		zoom,
		running && runState?.totalIterations
			? `${runState.currentIteration ?? 0}/${runState.totalIterations}`
			: t('aiworkflow.canvas.automation.run'),
		{
			accent: !running,
			active: running,
			disabled: runState?.status === 'running'
		}
	)
	drawButton(ctx, layout.exit, zoom, t('aiworkflow.canvas.automation.exit'), { muted: true })
	ctx.restore()
	return layout
}

/** 命中按钮条控件（screen 坐标） */
export function hitTestAutomationBar(
	screenPoint: Vector2,
	ctx: CanvasRenderingContext2D,
	barRect: Rect,
	camera: CameraLike,
	automation: FrameAutomationData,
	mode: BindingMode,
	runState: FrameAutomationRunState | null
): AutomationBarHit | null {
	const layout = computeBarLayout(ctx, barRect, camera.zoom, automation, mode, runState)
	const z = camera.zoom
	const toScreen = (r: Rect) => {
		const tl = camera.worldToScreen(new Vector2(r.x, r.y))
		return new Rect(tl.x, tl.y, r.width * z, r.height * z)
	}
	const checks: [AutomationBarHit, Rect][] = [
		['loop-minus', layout.minus],
		['loop-plus', layout.plus],
		['loop-input', layout.loopInput],
		['set-inputs', layout.setInputs],
		['set-outputs', layout.setOutputs],
		['run', layout.run],
		['exit', layout.exit]
	]
	for (const [hit, rect] of checks) {
		if (toScreen(rect).containsPoint(screenPoint)) return hit
	}
	return null
}

/** 绘制门户锚点（frame body 左右边线） */
export function drawPortalAnchors(
	ctx: CanvasRenderingContext2D,
	portals: PortalAnchorGeometry[],
	zoom: number,
	state: {
		hoveredBindingId?: string | null
		connectedBindingIds?: Set<string>
		bindingMode: BindingMode
	}
): void {
	const invZ = 1 / zoom
	const outer = (PORT_OUTER / 2) * invZ
	const inner = (PORT_INNER / 2) * invZ
	for (const p of portals) {
		const color = MEDIA_TYPE_COLORS[p.mediaType] || MEDIA_TYPE_COLORS.generic
		const hovered = state.hoveredBindingId === p.bindingId
		const connected = state.connectedBindingIds?.has(p.bindingId)
		ctx.save()
		if (connected) {
			ctx.shadowColor = color
			ctx.shadowBlur = 8
			ctx.fillStyle = withAlpha(color, 0.2)
			ctx.fillRect(
				p.x - outer - 4 * invZ,
				p.y - outer - 4 * invZ,
				(outer + 4 * invZ) * 2,
				(outer + 4 * invZ) * 2
			)
		}
		if (hovered) {
			ctx.shadowColor = withAlpha(color, 0.6)
			ctx.shadowBlur = 12
			ctx.fillStyle = withAlpha(color, 0.25)
			const g = outer + 4 * invZ
			ctx.fillRect(p.x - g, p.y - g, g * 2, g * 2)
		}
		ctx.fillStyle = getThemeManager().tokens.portBackground
		ctx.strokeStyle = color
		ctx.lineWidth = 1.5
		ctx.fillRect(p.x - outer, p.y - outer, outer * 2, outer * 2)
		ctx.strokeRect(p.x - outer, p.y - outer, outer * 2, outer * 2)
		ctx.fillStyle = color
		ctx.fillRect(p.x - inner, p.y - inner, inner * 2, inner * 2)
		ctx.restore()

		// 标签：输入门户向右（框内），输出门户向左（框内）
		if (p.label && zoom >= 0.3) {
			ctx.save()
			ctx.font = font(zoom, 500)
			ctx.fillStyle = getThemeManager().tokens.nodeTextMuted
			ctx.textBaseline = 'middle'
			const offset = outer + 6 * invZ
			if (p.direction === 'in') {
				ctx.textAlign = 'left'
				ctx.fillText(p.label, p.x + offset, p.y)
			} else {
				ctx.textAlign = 'right'
				ctx.fillText(p.label, p.x - offset, p.y)
			}
			ctx.restore()
		}
	}

	// 绑定模式提示：在空侧给出引导点
	if (
		(state.bindingMode === 'binding-input' && portals.every((p) => p.direction !== 'in')) ||
		(state.bindingMode === 'binding-output' && portals.every((p) => p.direction !== 'out'))
	) {
		// no-op：提示文案由按钮条 active 态表达，避免画布噪音
	}
}

/** 命上门户锚点（screen 坐标），返回门户几何 */
export function hitTestPortalAnchor(
	screenPoint: Vector2,
	portals: PortalAnchorGeometry[],
	camera: CameraLike
): PortalAnchorGeometry | null {
	const z = camera.zoom
	const r = PORT_HIT_RADIUS
	for (const p of portals) {
		const sp = camera.worldToScreen(new Vector2(p.x, p.y))
		const rect = new Rect(sp.x - r, sp.y - r, r * 2, r * 2)
		if (rect.containsPoint(screenPoint)) return p
	}
	void z
	return null
}

/** 命上门户锚点右上小 ×（绑定模式下用于快速解绑） */
export function hitTestPortalRemove(
	screenPoint: Vector2,
	portals: PortalAnchorGeometry[],
	camera: CameraLike
): PortalAnchorGeometry | null {
	const invZ = 1 / camera.zoom
	const half = (PORT_OUTER / 2) * invZ
	const size = PORT_REMOVE_HIT * invZ
	for (const p of portals) {
		const center = new Vector2(p.x + half, p.y - half)
		const sp = camera.worldToScreen(center)
		const rect = new Rect(sp.x - size / 2, sp.y - size / 2, size * camera.zoom, size * camera.zoom)
		if (rect.containsPoint(screenPoint)) return p
	}
	return null
}

/** 绑定模式下，候选内部锚点的脉冲高亮环（画在 Port 自身之外，不改 Port 状态机） */
export function drawBindingCandidates(
	ctx: CanvasRenderingContext2D,
	candidates: { x: number; y: number; mediaType: keyof typeof MEDIA_TYPE_COLORS | string }[],
	zoom: number,
	direction: PortalDirection
): void {
	const invZ = 1 / zoom
	const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 240)
	const outer = (PORT_OUTER / 2) * invZ
	ctx.save()
	ctx.lineWidth = 1.5 * invZ
	ctx.setLineDash([5 * invZ, 4 * invZ])
	for (const c of candidates) {
		const color = MEDIA_TYPE_COLORS[c.mediaType as keyof typeof MEDIA_TYPE_COLORS] || baseColor()
		ctx.strokeStyle = withAlpha(color, 0.55 + 0.35 * pulse)
		ctx.strokeRect(
			c.x - outer - 5 * invZ,
			c.y - outer - 5 * invZ,
			(outer + 5 * invZ) * 2,
			(outer + 5 * invZ) * 2
		)
	}
	ctx.setLineDash([])
	ctx.restore()
	void direction
}
