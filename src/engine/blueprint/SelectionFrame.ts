import { Vector2 } from '../graphbase/core/Vector2'
import { Rect } from '../graphbase/core/Rect'
import type { BlueprintNode } from './BlueprintNode'
import { getThemeManager } from './theme'
import { t } from './i18n'

export interface SavedSelectionFrame {
	id: string
	nodeIds: string[]
	label: string
	color?: string
}

const SELECTION_FRAME_PADDING = 12
const TAG_BAR_HEIGHT = 28
const TAG_BAR_PADDING_X = 8
const LABEL_EDIT_PADDING = 6
const DELETE_BTN_SIZE = 20
const DELETE_BTN_MARGIN = 4
const SAVE_BTN_SIZE = 24
const SAVE_BTN_MARGIN = 4
const INPUT_MIN_WIDTH = 120

export function computeSelectionBounds(nodes: BlueprintNode[]): Rect | null {
	if (nodes.length < 2) return null

	let bounds: Rect | null = null
	for (const node of nodes) {
		const nodeBounds = node.getWorldBounds()
		if (!bounds) bounds = nodeBounds.clone()
		else bounds = bounds.union(nodeBounds)
	}

	if (!bounds) return null

	return new Rect(
		bounds.x - SELECTION_FRAME_PADDING,
		bounds.y - SELECTION_FRAME_PADDING - TAG_BAR_HEIGHT,
		bounds.width + SELECTION_FRAME_PADDING * 2,
		bounds.height + SELECTION_FRAME_PADDING * 2 + TAG_BAR_HEIGHT
	)
}

export interface FrameEditState {
	editingTempInput: boolean
	editingFrameId: string | null
	editText: string
	cursorBlink: boolean
}

export function drawSelectionFrame(
	ctx: CanvasRenderingContext2D,
	worldRect: Rect,
	cameraZoom: number,
	isSaved: boolean,
	label?: string,
	nodeCount?: number,
	editState?: FrameEditState
): void {
	const theme = getThemeManager()
	const tokens = theme.tokens
	const lineWidth = isSaved ? 2 / cameraZoom : 1.5 / cameraZoom
	const dashPattern = isSaved ? [] : [6 / cameraZoom, 4 / cameraZoom]
	const color = isSaved ? tokens.selectionFrame : '#5b9bd5'
	const bgAlpha = isSaved ? 0.08 : 0.06
	const strokeAlpha = isSaved ? 0.85 : 0.7
	const tagTextColor = theme.mode === 'dark' ? '#ffffff' : tokens.nodeBackground
	const tagInputBg = theme.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.4)'
	const tagInputBgIdle = theme.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.25)'
	const tagInputBorder = theme.mode === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.5)'
	const tagInputBorderIdle =
		theme.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.3)'
	const tagInputText = theme.mode === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.8)'
	const tagSaveBtnBg = theme.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.3)'
	const countText =
		nodeCount !== undefined ? t('aiworkflow.canvas.nodesCount', { count: nodeCount }) : ''
	const saveText = `💾 ${t('aiworkflow.canvas.save')}`
	const placeholder = t('aiworkflow.canvas.enterGroupName')

	ctx.save()

	ctx.lineWidth = lineWidth
	ctx.setLineDash(dashPattern)
	ctx.strokeStyle = hexToRgba(color, strokeAlpha)
	ctx.fillStyle = hexToRgba(color, bgAlpha)

	const tagBarHeight = TAG_BAR_HEIGHT / cameraZoom
	const x = worldRect.x
	const y = worldRect.y
	const w = worldRect.width
	const h = worldRect.height

	roundRect(ctx, x, y + tagBarHeight, w, h - tagBarHeight, 4 / cameraZoom)
	ctx.fill()
	ctx.stroke()

	ctx.setLineDash([])

	if (isSaved && label) {
		const isEditing = editState?.editingFrameId !== null && editState?.editingFrameId !== undefined
		const frameIdMatch = editState?.editingFrameId
		const actuallyEditing = isEditing && frameIdMatch !== null

		ctx.font = `500 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		let displayText = label
		if (actuallyEditing) {
			displayText = editState!.editText
		}
		const textMetrics = ctx.measureText(displayText)
		const labelWidth = textMetrics.width + (LABEL_EDIT_PADDING * 2) / cameraZoom
		const tagX = x
		const tagY = y
		const tagW = labelWidth + 16 / cameraZoom
		const tagH = tagBarHeight

		ctx.fillStyle = hexToRgba(color, 0.9)
		roundRect(ctx, tagX, tagY, tagW, tagH, 4 / cameraZoom)
		ctx.fill()

		if (actuallyEditing) {
			ctx.fillStyle = tagInputBg
			roundRect(
				ctx,
				tagX + 4 / cameraZoom,
				tagY + 3 / cameraZoom,
				tagW - 8 / cameraZoom,
				tagH - 6 / cameraZoom,
				3 / cameraZoom
			)
			ctx.fill()
		}

		ctx.fillStyle = tagTextColor
		ctx.textBaseline = 'middle'
		ctx.textAlign = 'left'
		const displayLabel = displayText || (actuallyEditing ? '' : label)
		ctx.fillText(displayLabel, tagX + TAG_BAR_PADDING_X / cameraZoom, tagY + tagH / 2)

		if (actuallyEditing && editState!.cursorBlink) {
			const cursorX =
				tagX + TAG_BAR_PADDING_X / cameraZoom + ctx.measureText(displayText).width + 1 / cameraZoom
			ctx.strokeStyle = tagTextColor
			ctx.lineWidth = 1.5 / cameraZoom
			ctx.beginPath()
			ctx.moveTo(cursorX, tagY + 5 / cameraZoom)
			ctx.lineTo(cursorX, tagY + tagH - 5 / cameraZoom)
			ctx.stroke()
		}

		const btnSize = DELETE_BTN_SIZE / cameraZoom
		const btnMargin = DELETE_BTN_MARGIN / cameraZoom
		const deleteBtnX = x + w - btnMargin - btnSize / 2
		const deleteBtnY = y + tagBarHeight + btnMargin + btnSize / 2
		ctx.beginPath()
		ctx.arc(deleteBtnX, deleteBtnY, btnSize / 2, 0, Math.PI * 2)
		ctx.fillStyle = 'rgba(231, 76, 60, 0.85)'
		ctx.fill()
		ctx.fillStyle = '#ffffff'
		ctx.font = `bold ${12 / cameraZoom}px sans-serif`
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText('×', deleteBtnX, deleteBtnY + 1 / cameraZoom)
	} else if (!isSaved && nodeCount !== undefined) {
		ctx.font = `500 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		const countMetrics = ctx.measureText(countText)
		const countWidth = countMetrics.width

		const saveBtnSize = SAVE_BTN_SIZE / cameraZoom
		const saveBtnMargin = SAVE_BTN_MARGIN / cameraZoom
		const btnPadding = 12 / cameraZoom
		ctx.font = `600 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		const saveTextMetrics = ctx.measureText(saveText)
		const saveBtnWidth = saveTextMetrics.width + btnPadding

		const isEditing = editState?.editingTempInput === true
		const inputMinWidth = INPUT_MIN_WIDTH / cameraZoom
		const availableForInput =
			w - countWidth - (TAG_BAR_PADDING_X / cameraZoom) * 2 - saveBtnWidth - saveBtnMargin * 2
		const inputWidth = Math.max(
			inputMinWidth,
			Math.min(availableForInput > 0 ? availableForInput : inputMinWidth, w * 0.5)
		)

		const tagX = x
		const tagY = y
		const tagH = tagBarHeight
		const countTagWidth = countWidth + (TAG_BAR_PADDING_X * 2) / cameraZoom
		const tagW = Math.min(countTagWidth + inputWidth + saveBtnWidth + saveBtnMargin * 3, w)

		ctx.fillStyle = hexToRgba(color, 0.85)
		roundRect(ctx, tagX, tagY, tagW, tagH, 4 / cameraZoom)
		ctx.fill()

		ctx.fillStyle = tagTextColor
		ctx.textBaseline = 'middle'
		ctx.textAlign = 'left'
		ctx.font = `500 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		ctx.fillText(countText, tagX + TAG_BAR_PADDING_X / cameraZoom, tagY + tagH / 2)

		const inputX = tagX + countTagWidth
		const inputY = tagY + 3 / cameraZoom
		const inputH = tagH - 6 / cameraZoom

		ctx.fillStyle = isEditing ? tagInputBg : tagInputBgIdle
		roundRect(ctx, inputX, inputY, inputWidth, inputH, 3 / cameraZoom)
		ctx.fill()

		ctx.strokeStyle = isEditing ? tagInputBorder : tagInputBorderIdle
		ctx.lineWidth = 1 / cameraZoom
		roundRect(ctx, inputX, inputY, inputWidth, inputH, 3 / cameraZoom)
		ctx.stroke()

		const editText = isEditing ? editState!.editText : ''
		ctx.font = `400 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		if (isEditing && editText) {
			ctx.fillStyle = tagTextColor
			ctx.fillText(editText, inputX + 6 / cameraZoom, tagY + tagH / 2)
			if (editState!.cursorBlink) {
				const cursorX = inputX + 6 / cameraZoom + ctx.measureText(editText).width + 1 / cameraZoom
				ctx.strokeStyle = tagTextColor
				ctx.lineWidth = 1.5 / cameraZoom
				ctx.beginPath()
				ctx.moveTo(cursorX, inputY + 3 / cameraZoom)
				ctx.lineTo(cursorX, inputY + inputH - 3 / cameraZoom)
				ctx.stroke()
			}
		} else if (isEditing) {
			ctx.fillStyle = tagInputText
			ctx.fillText(placeholder, inputX + 6 / cameraZoom, tagY + tagH / 2)
			if (editState!.cursorBlink) {
				const cursorX = inputX + 6 / cameraZoom
				ctx.strokeStyle = tagTextColor
				ctx.lineWidth = 1.5 / cameraZoom
				ctx.beginPath()
				ctx.moveTo(cursorX, inputY + 3 / cameraZoom)
				ctx.lineTo(cursorX, inputY + inputH - 3 / cameraZoom)
				ctx.stroke()
			}
		} else {
			ctx.fillStyle = tagInputText
			ctx.fillText(placeholder, inputX + 6 / cameraZoom, tagY + tagH / 2)
		}

		const saveBtnX = inputX + inputWidth + saveBtnMargin
		const saveBtnY = tagY + 3 / cameraZoom
		const saveBtnH = tagH - 6 / cameraZoom
		ctx.fillStyle = tagSaveBtnBg
		roundRect(ctx, saveBtnX, saveBtnY, saveBtnWidth, saveBtnH, 3 / cameraZoom)
		ctx.fill()
		ctx.fillStyle = tagTextColor
		ctx.font = `600 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText(saveText, saveBtnX + saveBtnWidth / 2, saveBtnY + saveBtnH / 2 + 1 / cameraZoom)
	}

	ctx.restore()
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	ctx.beginPath()
	ctx.moveTo(x + r, y)
	ctx.lineTo(x + w - r, y)
	ctx.quadraticCurveTo(x + w, y, x + w, y + r)
	ctx.lineTo(x + w, y + h - r)
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
	ctx.lineTo(x + r, y + h)
	ctx.quadraticCurveTo(x, y + h, x, y + h - r)
	ctx.lineTo(x, y + r)
	ctx.quadraticCurveTo(x, y, x + r, y)
	ctx.closePath()
}

function hexToRgba(hex: string, alpha: number): string {
	if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
	const h = hex.replace('#', '')
	const r = parseInt(h.substring(0, 2), 16)
	const g = parseInt(h.substring(2, 4), 16)
	const b = parseInt(h.substring(4, 6), 16)
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function pointInFrameRect(
	screenPoint: Vector2,
	worldRect: Rect,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y))
	const screenBottomRight = camera.worldToScreen(
		new Vector2(worldRect.x + worldRect.width, worldRect.y + worldRect.height)
	)
	const screenRect = new Rect(
		Math.min(screenTopLeft.x, screenBottomRight.x),
		Math.min(screenTopLeft.y, screenBottomRight.y),
		Math.abs(screenBottomRight.x - screenTopLeft.x),
		Math.abs(screenBottomRight.y - screenTopLeft.y)
	)
	return screenRect.containsPoint(screenPoint)
}

export function pointInFrameDragArea(
	screenPoint: Vector2,
	worldRect: Rect,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y))
	const screenBottomRight = camera.worldToScreen(
		new Vector2(worldRect.x + worldRect.width, worldRect.y + worldRect.height)
	)
	const tagBarH = TAG_BAR_HEIGHT * camera.zoom
	const screenRect = new Rect(
		Math.min(screenTopLeft.x, screenBottomRight.x),
		Math.min(screenTopLeft.y, screenBottomRight.y) + tagBarH,
		Math.abs(screenBottomRight.x - screenTopLeft.x),
		Math.abs(screenBottomRight.y - screenTopLeft.y) - tagBarH
	)
	return screenRect.containsPoint(screenPoint)
}

export function pointInSavedFrameTagBar(
	screenPoint: Vector2,
	worldRect: Rect,
	labelWidth: number,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y))
	const tagBarH = TAG_BAR_HEIGHT * camera.zoom
	const tagW = (labelWidth + 16 + LABEL_EDIT_PADDING * 2) * camera.zoom
	const screenRect = new Rect(screenTopLeft.x, screenTopLeft.y, tagW, tagBarH)
	return screenRect.containsPoint(screenPoint)
}

export function pointInSavedFrameDeleteBtn(
	screenPoint: Vector2,
	worldRect: Rect,
	labelWidth: number,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y))
	const tagBarH = TAG_BAR_HEIGHT * camera.zoom
	const fullW = worldRect.width * camera.zoom
	const btnSize = DELETE_BTN_SIZE * camera.zoom
	const btnMargin = DELETE_BTN_MARGIN * camera.zoom
	const btnX = screenTopLeft.x + fullW - btnMargin - btnSize / 2
	const btnY = screenTopLeft.y + tagBarH + btnMargin + btnSize / 2
	const btnRadius = btnSize / 2 + 4 * camera.zoom
	const dx = screenPoint.x - btnX
	const dy = screenPoint.y - btnY
	return dx * dx + dy * dy <= btnRadius * btnRadius
}

export function pointInTempFrameInput(
	screenPoint: Vector2,
	worldRect: Rect,
	nodeCount: number,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y))
	const tagBarH = TAG_BAR_HEIGHT * camera.zoom
	const z = camera.zoom

	const c = document.createElement('canvas').getContext('2d')!
	c.font = `500 11px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
	const countText = t('aiworkflow.canvas.nodesCount', { count: nodeCount })
	const countWidth = c.measureText(countText).width
	const countTagWidth = countWidth + TAG_BAR_PADDING_X * 2

	c.font = `600 11px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
	const saveTextWidth = c.measureText(`💾 ${t('aiworkflow.canvas.save')}`).width + 12

	const fullW = worldRect.width * z
	const inputMinWidth = INPUT_MIN_WIDTH * z
	const availableForInput = fullW - countTagWidth - saveTextWidth - SAVE_BTN_MARGIN * 2 * z
	const inputWidth = Math.max(
		inputMinWidth,
		Math.min(availableForInput > 0 ? availableForInput : inputMinWidth, fullW * 0.5)
	)

	const inputX = screenTopLeft.x + countTagWidth
	const inputY = screenTopLeft.y + 3 * z
	const inputH = tagBarH - 6 * z

	const screenRect = new Rect(inputX, inputY, inputWidth, inputH)
	return screenRect.containsPoint(screenPoint)
}

export function pointInTempFrameSaveBtn(
	screenPoint: Vector2,
	worldRect: Rect,
	nodeCount: number,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const screenTopLeft = camera.worldToScreen(new Vector2(worldRect.x, worldRect.y))
	const tagBarH = TAG_BAR_HEIGHT * camera.zoom
	const z = camera.zoom

	const c = document.createElement('canvas').getContext('2d')!
	c.font = `500 11px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
	const countText = t('aiworkflow.canvas.nodesCount', { count: nodeCount })
	const countWidth = c.measureText(countText).width
	const countTagWidth = countWidth + TAG_BAR_PADDING_X * 2

	c.font = `600 11px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
	const saveTextWidth = c.measureText(`💾 ${t('aiworkflow.canvas.save')}`).width + 12

	const fullW = worldRect.width * z
	const inputMinWidth = INPUT_MIN_WIDTH * z
	const availableForInput = fullW - countTagWidth - saveTextWidth - SAVE_BTN_MARGIN * 2 * z
	const inputWidth = Math.max(
		inputMinWidth,
		Math.min(availableForInput > 0 ? availableForInput : inputMinWidth, fullW * 0.5)
	)

	const saveBtnX = screenTopLeft.x + countTagWidth + inputWidth + SAVE_BTN_MARGIN * z
	const saveBtnY = screenTopLeft.y + 3 * z
	const saveBtnH = tagBarH - 6 * z

	const screenRect = new Rect(saveBtnX, saveBtnY, saveTextWidth, saveBtnH)
	return screenRect.containsPoint(screenPoint)
}

export const SELECTION_FRAME_CONSTANTS = {
	PADDING: SELECTION_FRAME_PADDING,
	TAG_BAR_HEIGHT
}
