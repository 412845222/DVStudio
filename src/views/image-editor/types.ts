export type ToolType = 'view' | 'brush' | 'eraser' | 'crop' | 'screenshot' | 'subject-select'

export type EraserMode = 'brush' | 'rect-bg-remove' | 'click-bg-remove'

export interface Point {
	x: number
	y: number
}

export interface Rect {
	x: number
	y: number
	w: number
	h: number
}

export interface TransformState {
	flipH: boolean
	flipV: boolean
	rotation: 0 | 90 | 180 | 270
}

export interface AdjustmentState {
	brightness: number
	contrast: number
	saturation: number
}

export interface BrushSettings {
	size: number
	color: string
	hardness: number
}

export interface EraserSettings {
	mode: EraserMode
	size: number
	feather: number
	tolerance: number
	contiguous: boolean
	sampleCorners: boolean
}

export interface SubjectSelectSettings {
	tightFit: boolean
	margin: number
}

export interface EditorState {
	tool: ToolType
	zoom: number
	offsetX: number
	offsetY: number
	transform: TransformState
	adjustments: AdjustmentState
	brush: BrushSettings
	eraser: EraserSettings
	subjectSelect: SubjectSelectSettings
}

export interface IEditorEngine {
	loadImage(url: string): Promise<void>
	getNaturalSize(): { width: number; height: number }
	setTool(tool: ToolType): void
	getTool(): ToolType
	setZoom(factor: number): void
	getZoom(): number
	resetView(): void
	fitToView(viewportWidth: number, viewportHeight: number): void
	rotateBy(deg: -90 | 90): void
	flipHorizontal(): void
	flipVertical(): void
	pointerDown(x: number, y: number, viewport: HTMLElement): void
	pointerMove(x: number, y: number, viewport: HTMLElement): void
	pointerUp(x: number, y: number, viewport: HTMLElement): void
	pointerLeave(): void
	clearAnnotations(): void
	undo(): boolean
	redo(): boolean
	canUndo(): boolean
	canRedo(): boolean
	getBrushSettings(): BrushSettings
	setBrushSize(size: number): void
	getEraserSettings(): EraserSettings
	setEraserMode(mode: EraserMode): void
	setEraserSize(size: number): void
	setEraserFeather(feather: number): void
	setEraserTolerance(tolerance: number): void
	setEraserContiguous(contiguous: boolean): void
	setEraserSampleCorners(sampleCorners: boolean): void
	setScreenshotRect(rect: Rect | null): void
	getScreenshotRect(): Rect | null
	getEraseRect(): Rect | null
	getSubjectSelectRect(): Rect | null
	setSubjectTightFit(tight: boolean): void
	getSubjectTightFit(): boolean
	setSubjectMargin(margin: number): void
	getSubjectMargin(): number
	composeExportDataUrl(): { dataUrl: string; width: number; height: number } | null
	composeScreenshotDataUrl(): { dataUrl: string; width: number; height: number } | null
	composeSubjectCropDataUrl(): { dataUrl: string; width: number; height: number } | null
	getCanvasStyle(): Record<string, string>
	render(): void
	destroy(): void
	on(event: 'stateChange', callback: () => void): void
	off(event: 'stateChange', callback: () => void): void
}
