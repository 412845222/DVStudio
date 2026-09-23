import type { MediaType } from '../types'

/** 门户方向：输入门户在框左侧，输出门户在框右侧 */
export type PortalDirection = 'in' | 'out'

/**
 * 单元门户锚点与组内真实锚点的绑定。
 * 门户锚点只在交互/渲染层存在，连线实体仍指向 nodeId + anchorId（组内真实锚点）。
 */
export interface FrameIoBinding {
	/** 门户锚点业务稳定 ID：输入 fin_xxx / 输出 fout_xxx，用于序列化与命中 */
	id: string
	/** 被绑定的组内成员节点 ID */
	nodeId: string
	/** 被绑定成员节点的 PortSpec.id（业务锚点 ID，非运行时 Port.id） */
	anchorId: string
	/** 门户显示名（缺省由节点名 + 端口 label 派生） */
	label?: string
	/** 媒体类型，取自被绑定 PortSpec，用于连线兼容校验与门户着色 */
	mediaType?: MediaType
}

/** 绿色多选框的自动化配置（SavedSelectionFrame 的可选增量字段） */
export interface FrameAutomationData {
	/** 是否开启自动化设计（关闭时数据保留，可再次开启恢复） */
	enabled: boolean
	/** 循环次数，正整数 1–99 */
	loopCount: number
	/** 输入绑定（对应框左侧门户锚点） */
	inputBindings: FrameIoBinding[]
	/** 输出绑定（对应框右侧门户锚点） */
	outputBindings: FrameIoBinding[]
}

/** 运行态：临时态，不持久化、不进 Command 栈（与 node.status 同级） */
export interface FrameAutomationRunState {
	status: 'idle' | 'running' | 'success' | 'error'
	currentIteration?: number
	totalIterations?: number
	message?: string
}

/** 自动化按钮条命中区域标识 */
export type AutomationBarHit =
	| 'toggle'
	| 'loop-minus'
	| 'loop-plus'
	| 'loop-input'
	| 'set-inputs'
	| 'set-outputs'
	| 'run'
	| 'exit'

/** 门户锚点几何（派生数据，不持久化） */
export interface PortalAnchorGeometry {
	bindingId: string
	direction: PortalDirection
	x: number
	y: number
	mediaType: MediaType
	label: string
	nodeId: string
	anchorId: string
}

export const AUTOMATION_LOOP_MIN = 1
export const AUTOMATION_LOOP_MAX = 99
export const AUTOMATION_BAR_HEIGHT = 30
/** 多个门户锚点纵向最小间距（world px） */
export const PORTAL_MIN_GAP = 28
/** 门户锚点距离框边线的水平偏移（视觉吸附在线上） */
export const PORTAL_X_OFFSET = 0

export function createDefaultFrameAutomation(): FrameAutomationData {
	return {
		enabled: true,
		loopCount: 1,
		inputBindings: [],
		outputBindings: []
	}
}

export function clampLoopCount(value: unknown): number {
	const n = Math.floor(Number(value))
	if (!Number.isFinite(n)) return AUTOMATION_LOOP_MIN
	return Math.max(AUTOMATION_LOOP_MIN, Math.min(AUTOMATION_LOOP_MAX, n))
}

export function makePortalBindingId(direction: PortalDirection): string {
	const prefix = direction === 'in' ? 'fin' : 'fout'
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
