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
const DELETE_BTN_SIZE = 18
const DELETE_BTN_MARGIN = 6
const SAVE_BTN_SIZE = 24
const SAVE_BTN_MARGIN = 4
const INPUT_MIN_WIDTH = 120
const BRACKET_SIZE = 10
const BRACKET_LINE_WIDTH = 1.5
const PARTICLE_DOT = 2

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
	const dashPattern = isSaved ? [8 / cameraZoom, 5 / cameraZoom] : [6 / cameraZoom, 4 / cameraZoom]
	const color = isSaved ? tokens.selectionFrame : '#5b9bd5'
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

	if (isSaved) {
		// Green saved frame - dashed border only
	}

	ctx.save()

	const tagBarHeight = TAG_BAR_HEIGHT / cameraZoom
	const x = worldRect.x
	const y = worldRect.y
	const w = worldRect.width
	const h = worldRect.height

	// Unified outer rect (spans tag bar + frame body)
	const outerX = x
	const outerY = y
	const outerW = w
	const outerH = h
	const frameY = y + tagBarHeight
	const frameH = h - tagBarHeight

	// Dashed outer border (one unified rect covering tag bar + frame body)
	ctx.lineWidth = lineWidth
	ctx.setLineDash(dashPattern)
	ctx.strokeStyle = hexToRgba(color, strokeAlpha)
	ctx.strokeRect(outerX, outerY, outerW, outerH)
	ctx.setLineDash([])

	// Sci-fi L-corner brackets at four outer corners (decorative, solid line)
	const bracketLen = BRACKET_SIZE / cameraZoom
	const bracketW = BRACKET_LINE_WIDTH / cameraZoom
	const bracketColor = hexToRgba(color, 1)
	drawLCorner(ctx, outerX, outerY, 1, 1, bracketLen, bracketColor, bracketW)
	drawLCorner(ctx, outerX + outerW, outerY, -1, 1, bracketLen, bracketColor, bracketW)
	drawLCorner(ctx, outerX, outerY + outerH, 1, -1, bracketLen, bracketColor, bracketW)
	drawLCorner(ctx, outerX + outerW, outerY + outerH, -1, -1, bracketLen, bracketColor, bracketW)

	// Vertical sci-fi side brackets (decorative, at the tag bar/frame body boundary)
	const sideBracketOffset = bracketLen / 2
	if (isSaved) {
		drawLCorner(ctx, outerX, frameY, 1, -1, sideBracketOffset, bracketColor, bracketW)
		drawLCorner(ctx, outerX + outerW, frameY, -1, -1, sideBracketOffset, bracketColor, bracketW)
	}

	// Particle dots decoration for saved frame frame body
	if (isSaved) {
		const dotColor = hexToRgba(color, 0.6)
		const dotSize = PARTICLE_DOT / cameraZoom
		ctx.fillStyle = dotColor
		const innerX = outerX + bracketLen + 4 / cameraZoom
		const innerY = frameY + bracketLen + 4 / cameraZoom
		const innerRight = outerX + outerW - bracketLen - 4 / cameraZoom
		const innerBottom = outerY + outerH - bracketLen - 4 / cameraZoom
		// top row dots (just below tag bar)
		for (let dx = 0; dx < 3; dx++) {
			const px = innerX + dx * ((innerRight - innerX) / 3)
			if (px < innerRight) ctx.fillRect(px, innerY, dotSize, dotSize)
		}
		// bottom row dots
		for (let dx = 0; dx < 3; dx++) {
			const px = innerX + dx * ((innerRight - innerX) / 3)
			if (px < innerRight) ctx.fillRect(px, innerBottom, dotSize, dotSize)
		}
		// left middle
		ctx.fillRect(innerX, innerY + (innerBottom - innerY) / 2, dotSize, dotSize)
		// right middle
		ctx.fillRect(innerRight, innerY + (innerBottom - innerY) / 2, dotSize, dotSize)
	}

	if (isSaved && label) {
		const isEditing = editState?.editingFrameId !== null && editState?.editingFrameId !== undefined
		const frameIdMatch = editState?.editingFrameId
		const actuallyEditing = isEditing && frameIdMatch !== null

		ctx.font = `500 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		const labelText = actuallyEditing ? editState!.editText : label
		const textMetrics = ctx.measureText(labelText)
		const labelWidth = Math.max(
			textMetrics.width + (LABEL_EDIT_PADDING * 2) / cameraZoom,
			36 / cameraZoom
		)

		const btnSize = DELETE_BTN_SIZE / cameraZoom
		const btnMargin = DELETE_BTN_MARGIN / cameraZoom
		const tagW = Math.max(w, labelWidth + btnSize + btnMargin * 2 + 4 / cameraZoom)
		const tagX = x
		const tagY = y
		const tagWClamped = Math.min(tagW, w)

		// Tag bar: dashed border for the label region only; delete btn sits to the right
		const labelBoxX = tagX
		const labelBoxY = tagY
		const labelBoxW = Math.max(tagWClamped - btnSize - btnMargin * 2, 24 / cameraZoom)
		const labelBoxH = tagBarHeight

		// Label region: dashed border on left/right/bottom only (top is the outer top edge)
		ctx.save()
		ctx.lineWidth = lineWidth
		ctx.setLineDash(dashPattern)
		ctx.strokeStyle = hexToRgba(color, strokeAlpha)
		ctx.beginPath()
		const bx = labelBoxX
		const by = labelBoxY
		const bw = labelBoxW
		const bh = labelBoxH
		// Left side (top to bottom)
		ctx.moveTo(bx, by)
		ctx.lineTo(bx, by + bh)
		// Bottom side
		ctx.lineTo(bx + bw, by + bh)
		// Right side (top to bottom)
		ctx.lineTo(bx + bw, by)
		ctx.stroke()
		ctx.setLineDash([])
		ctx.restore()

		if (actuallyEditing) {
			ctx.fillStyle = tagInputBg
			ctx.fillRect(
				labelBoxX + 3 / cameraZoom,
				labelBoxY + 2 / cameraZoom,
				labelBoxW - 6 / cameraZoom,
				labelBoxH - 4 / cameraZoom
			)
		}

		ctx.fillStyle = tagTextColor
		ctx.textBaseline = 'middle'
		ctx.textAlign = 'left'
		const displayLabel = labelBoxW > 10 / cameraZoom ? labelText : ''
		ctx.fillText(
			displayLabel,
			labelBoxX + TAG_BAR_PADDING_X / cameraZoom,
			labelBoxY + labelBoxH / 2
		)

		if (actuallyEditing && editState!.cursorBlink) {
			const cursorX =
				labelBoxX +
				TAG_BAR_PADDING_X / cameraZoom +
				ctx.measureText(labelText).width +
				1 / cameraZoom
			ctx.strokeStyle = tagTextColor
			ctx.lineWidth = 1.5 / cameraZoom
			ctx.beginPath()
			ctx.moveTo(cursorX, labelBoxY + 4 / cameraZoom)
			ctx.lineTo(cursorX, labelBoxY + labelBoxH - 4 / cameraZoom)
			ctx.stroke()
		}

		// Delete button at top-right of tag bar
		const deleteBtnX = tagX + tagWClamped - btnMargin - btnSize
		const deleteBtnY = tagY + (tagBarHeight - btnSize) / 2
		drawDeleteButton(ctx, deleteBtnX, deleteBtnY, btnSize, color, bracketW)
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

		// Temp tag bar: dashed border + L corners, no fill
		ctx.save()
		ctx.lineWidth = lineWidth
		ctx.setLineDash(dashPattern)
		ctx.strokeStyle = hexToRgba(color, 0.9)
		ctx.strokeRect(tagX, tagY, tagW, tagH)
		ctx.setLineDash([])
		const tagBracketLen = Math.min(6 / cameraZoom, tagH / 3)
		drawLCorner(ctx, tagX, tagY, 1, 1, tagBracketLen, hexToRgba(color, 1), bracketW)
		drawLCorner(ctx, tagX + tagW, tagY, -1, 1, tagBracketLen, hexToRgba(color, 1), bracketW)
		drawLCorner(ctx, tagX, tagY + tagH, 1, -1, tagBracketLen, hexToRgba(color, 1), bracketW)
		drawLCorner(ctx, tagX + tagW, tagY + tagH, -1, -1, tagBracketLen, hexToRgba(color, 1), bracketW)
		ctx.restore()

		ctx.fillStyle = tagTextColor
		ctx.textBaseline = 'middle'
		ctx.textAlign = 'left'
		ctx.font = `500 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		ctx.fillText(countText, tagX + TAG_BAR_PADDING_X / cameraZoom, tagY + tagH / 2)

		const inputX = tagX + countTagWidth
		const inputY = tagY + 3 / cameraZoom
		const inputH = tagH - 6 / cameraZoom

		ctx.fillStyle = isEditing ? tagInputBg : tagInputBgIdle
		ctx.fillRect(inputX, inputY, inputWidth, inputH)

		ctx.strokeStyle = isEditing ? tagInputBorder : tagInputBorderIdle
		ctx.lineWidth = 1 / cameraZoom
		ctx.strokeRect(inputX, inputY, inputWidth, inputH)

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
		ctx.fillRect(saveBtnX, saveBtnY, saveBtnWidth, saveBtnH)
		ctx.strokeStyle = hexToRgba(color, 0.8)
		ctx.lineWidth = 1 / cameraZoom
		ctx.strokeRect(saveBtnX, saveBtnY, saveBtnWidth, saveBtnH)
		ctx.fillStyle = tagTextColor
		ctx.font = `600 ${11 / cameraZoom}px -apple-system, "Segoe UI", "PingFang SC", sans-serif`
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText(saveText, saveBtnX + saveBtnWidth / 2, saveBtnY + saveBtnH / 2 + 1 / cameraZoom)
	}

	ctx.restore()
}

function drawLCorner(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	dirX: number,
	dirY: number,
	length: number,
	color: string,
	lineWidth: number
): void {
	ctx.save()
	ctx.strokeStyle = color
	ctx.lineWidth = lineWidth
	ctx.lineCap = 'square'
	ctx.beginPath()
	ctx.moveTo(x, y + dirY * length)
	ctx.lineTo(x, y)
	ctx.lineTo(x + dirX * length, y)
	ctx.stroke()
	ctx.restore()
}

function drawDeleteButton(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	color: string,
	lineWidth: number
): void {
	ctx.save()
	ctx.fillStyle = 'rgba(231, 76, 60, 0.85)'
	ctx.fillRect(x, y, size, size)
	ctx.strokeStyle = color
	ctx.lineWidth = lineWidth
	ctx.strokeRect(x, y, size, size)
	const cLen = Math.min(size / 4, 3 * lineWidth)
	ctx.strokeStyle = '#ffffff'
	ctx.lineWidth = lineWidth
	drawLCorner(ctx, x, y, 1, 1, cLen, '#ffffff', lineWidth)
	drawLCorner(ctx, x + size, y, -1, 1, cLen, '#ffffff', lineWidth)
	drawLCorner(ctx, x, y + size, 1, -1, cLen, '#ffffff', lineWidth)
	drawLCorner(ctx, x + size, y + size, -1, -1, cLen, '#ffffff', lineWidth)
	ctx.fillStyle = '#ffffff'
	ctx.font = `bold ${Math.floor(size * 0.7)}px sans-serif`
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText('×', x + size / 2, y + size / 2 + 0.5)
	ctx.restore()
}

function hexToRgba(hex: string, alpha: number): string {
	if (hex.startsWith('rgba')) {
		const match = hex.match(/rgba?\(([^)]+)\)/)
		if (match) {
			const parts = match[1].split(',').map((s) => parseFloat(s.trim()))
			if (parts.length >= 3) {
				return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
			}
		}
		return hex
	}
	if (hex.startsWith('rgb')) {
		const match = hex.match(/rgb\(([^)]+)\)/)
		if (match) {
			const parts = match[1].split(',').map((s) => parseFloat(s.trim()))
			if (parts.length >= 3) {
				return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
			}
		}
		return hex
	}
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
	worldTextWidth: number,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const z = camera.zoom
	const invZ = 1 / z
	const x = worldRect.x
	const y = worldRect.y
	const w = worldRect.width
	const tagBarH = TAG_BAR_HEIGHT * invZ
	// Match drawSelectionFrame: labelWidth in world space
	const labelWidth = Math.max(worldTextWidth + LABEL_EDIT_PADDING * 2 * invZ, 36 * invZ)
	const btnSize = DELETE_BTN_SIZE * invZ
	const btnMargin = DELETE_BTN_MARGIN * invZ
	const tagW = Math.max(w, labelWidth + btnSize + btnMargin * 2 + 4 * invZ)
	const tagWClamped = Math.min(tagW, w)
	// The entire tag bar area spans tagWClamped width (includes delete button area)
	// Convert to screen space
	const screenPos = camera.worldToScreen(new Vector2(x, y))
	const screenTagW = tagWClamped * z
	const screenTagH = tagBarH * z
	const screenRect = new Rect(screenPos.x, screenPos.y, screenTagW, screenTagH)
	return screenRect.containsPoint(screenPoint)
}

export function pointInSavedFrameDeleteBtn(
	screenPoint: Vector2,
	worldRect: Rect,
	worldTextWidth: number,
	camera: { zoom: number; worldToScreen(p: Vector2): Vector2 }
): boolean {
	const z = camera.zoom
	const invZ = 1 / z
	const x = worldRect.x
	const y = worldRect.y
	const w = worldRect.width
	const tagBarH = TAG_BAR_HEIGHT * invZ
	const labelWidth = Math.max(worldTextWidth + LABEL_EDIT_PADDING * 2 * invZ, 36 * invZ)
	const btnSize = DELETE_BTN_SIZE * invZ
	const btnMargin = DELETE_BTN_MARGIN * invZ
	const tagW = Math.max(w, labelWidth + btnSize + btnMargin * 2 + 4 * invZ)
	const tagWClamped = Math.min(tagW, w)
	// Match drawSelectionFrame delete button position
	const deleteBtnX = x + tagWClamped - btnMargin - btnSize
	const deleteBtnY = y + (tagBarH - btnSize) / 2
	// Convert to screen space with a small hit area padding (2 screen px)
	const screenBtnPos = camera.worldToScreen(new Vector2(deleteBtnX, deleteBtnY))
	const screenBtnSize = btnSize * z
	const pad = 2
	const rect = new Rect(
		screenBtnPos.x - pad,
		screenBtnPos.y - pad,
		screenBtnSize + pad * 2,
		screenBtnSize + pad * 2
	)
	return rect.containsPoint(screenPoint)
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
