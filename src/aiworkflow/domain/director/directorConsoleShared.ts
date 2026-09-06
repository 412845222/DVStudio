import type {
	WorkflowDirectorCameraKeyframe,
	WorkflowDirectorCameraTrack,
	WorkflowDirectorConsoleNodeSettings,
	WorkflowDirectorLight,
	WorkflowDirectorLightRig
} from '../../types'

/** 导演控制台节点输入锚点 id（接收场景布局 JSON） */
export const DIRECTOR_CONSOLE_ANCHOR_IN_JSON = 'in-json'

/** 导演控制台节点类型 id */
export const DIRECTOR_CONSOLE_NODE_TYPE = 'director-console'

/** 导演数据版本号初始值 */
export const DIRECTOR_DATA_VERSION_INITIAL = 1

/** 默认摄像机 fov */
export const DIRECTOR_DEFAULT_FOV = 50

/** 创建默认摄像机关键帧 */
export function createDefaultCameraKeyframe(
	time = 0,
	position = { x: 0, y: 2, z: 5 },
	target = { x: 0, y: 0, z: 0 }
): WorkflowDirectorCameraKeyframe {
	return {
		id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		time,
		position,
		target,
		fov: DIRECTOR_DEFAULT_FOV,
		roll: 0,
		easing: 'ease-in-out'
	}
}

/** 创建默认摄像机轨道 */
export function createDefaultCameraTrack(name = '主镜头'): WorkflowDirectorCameraTrack {
	return {
		id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		name,
		duration: 5,
		loop: false,
		keyframes: [createDefaultCameraKeyframe(0)]
	}
}

/** 创建默认灯光组件 */
export function createDefaultLight(
	id: string,
	name: string,
	type: WorkflowDirectorLight['type'],
	intensity = 1,
	color = '#ffffff'
): WorkflowDirectorLight {
	return {
		id,
		name,
		enabled: true,
		type,
		color,
		intensity,
		castShadow: type === 'directional' || type === 'spot'
	}
}

/** 创建默认灯光方案 */
export function createDefaultLightRig(): WorkflowDirectorLightRig {
	return {
		preset: 'three-point',
		exposure: 1,
		lights: [
			createDefaultLight('ambient', '环境光', 'ambient', 0.6, '#ffffff'),
			createDefaultLight('main', '主光', 'directional', 1.2, '#fff5e1'),
			createDefaultLight('fill', '补光', 'directional', 0.5, '#d4e8ff'),
			createDefaultLight('rim', '轮廓光', 'directional', 0.8, '#ffffff')
		]
	}
}

/** 创建默认导演控制台 settings */
export function createDefaultDirectorConsoleSettings(): WorkflowDirectorConsoleNodeSettings {
	return {
		status: 'idle',
		message: '',
		inputJson: '',
		lastOpenedAt: 0,
		directorDataVersion: 0,
		cameraTracks: [],
		activeCameraTrackId: '',
		lightRig: undefined
	}
}
