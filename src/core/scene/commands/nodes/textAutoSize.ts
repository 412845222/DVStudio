type TextLikeProps = {
	textContent?: unknown
	fontSize?: unknown
	fontStyle?: unknown
}

let _measureCanvas: HTMLCanvasElement | null = null
let _measureCtx: CanvasRenderingContext2D | null = null

const getMeasureCtx = (): CanvasRenderingContext2D | null => {
	if (typeof document === 'undefined') return null
	if (_measureCtx) return _measureCtx
	_measureCanvas = document.createElement('canvas')
	_measureCtx = _measureCanvas.getContext('2d')
	return _measureCtx
}

const fallbackEstimate = (text: string, fontSize: number) => {
	// Rough average glyph width: ~0.6em
	const lines = text.split(/\r?\n/g)
	const maxLen = Math.max(1, ...lines.map((l) => l.length))
	const w = Math.ceil(maxLen * fontSize * 0.6)
	const h = Math.ceil(lines.length * fontSize * 1.4)
	return { w, h }
}

export const computeTextAutoSize = (props: TextLikeProps): { width: number; height: number } | null => {
	const raw = props?.textContent
	const text = typeof raw === 'string' ? raw : String(raw ?? '')
	const fontSize = Math.max(1, Number((props as any)?.fontSize ?? 24))
	const fontStyle = String((props as any)?.fontStyle ?? 'normal')

	// Padding in local/world units (same coordinate system as node.transform)
	const padX = Math.max(2, Math.round(fontSize * 0.6))
	const padY = Math.max(2, Math.round(fontSize * 0.4))

	const lines = text.split(/\r?\n/g)
	const ctx = getMeasureCtx()
	let maxW = 0
	if (ctx) {
		ctx.font = `${fontStyle} ${fontSize}px sans-serif`
		for (const line of lines) {
			const metrics = ctx.measureText(line)
			maxW = Math.max(maxW, metrics.width)
		}
	} else {
		maxW = fallbackEstimate(text, fontSize).w
	}

	const width = Math.max(1, Math.ceil(maxW + padX * 2))
	const height = Math.max(1, Math.ceil(lines.length * fontSize * 1.4 + padY * 2))
	return { width, height }
}
