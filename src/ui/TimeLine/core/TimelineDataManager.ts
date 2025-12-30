export type FrameCellPayload = {
	isKeyframe: boolean
	easingEnabled: boolean
}

/**
 * 时间轴数据管理抽象层：封装“关键帧/复制粘贴/缓动占位”等操作。
 * 目标：让 UI 组件（TimeLine.vue / FrameCell）只关心交互与渲染。
 */
export abstract class TimelineDataManager {
	abstract isKeyframe(layerId: string, frameIndex: number): boolean
	abstract addKeyframe(layerId: string, frameIndex: number): void
	abstract removeKeyframe(layerId: string, frameIndex: number): void

	abstract isEasingEnabled(layerId: string, frameIndex: number): boolean
	abstract canEnableEasing(layerId: string, frameIndex: number): boolean
	abstract enableEasing(layerId: string, frameIndex: number): void
	abstract disableEasing(layerId: string, frameIndex: number): void

	abstract copyFrame(layerId: string, frameIndex: number): void
	abstract canPaste(): boolean
	abstract pasteFrame(layerId: string, frameIndex: number): void
	abstract clearClipboard(): void
}
