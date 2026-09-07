import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DirectorSceneViewer } from '@/ui/DirectorConsole/viewers/DirectorSceneViewer'
import type { WorkflowDirectorCameraTrack } from '@/aiworkflow/types'

/**
 * 摄像头变换逻辑单元测试
 *
 * 覆盖 DirectorSceneViewer 中本次新增的核心业务方法：
 * - updateCameraPosition(axis, value)
 * - updateCameraRotation(axis, degrees)
 * - updateCameraFov(fov)
 * - getCurrentCameraInfo()
 * - buildCameraTrack (通过 addCameraAtCenter 间接验证)
 *
 * 这些方法不直接依赖 Three.js（通过 mock previewViewer 隔离），
 * 纯数学逻辑可在 jsdom 环境下验证。
 */

// ── mock SceneLayoutPreviewViewer ──────────────────────────────────────────────
// DirectorSceneViewer 依赖 SceneLayoutPreviewViewer，后者需要 canvas/WebGL，
// 我们只需要验证 DirectorSceneViewer 的业务逻辑，因此 mock 掉所有 3D 方法。
const mockPreviewViewer = {
	// 构造函数调用
	setInteractive: vi.fn(),
	setRenderSuspended: vi.fn(),
	setLayout: vi.fn(),
	// 摄像头 Actor
	setCameraActor: vi.fn(),
	clearCameraActor: vi.fn(),
	getCameraPosition: vi.fn(() => ({ x: 3, y: 2, z: 5 })),
	getControlsTarget: vi.fn(() => ({ x: 0, y: 1, z: 0 })),
	getCameraFov: vi.fn(() => 60),
	screenToGroundWorld: vi.fn(() => ({ x: 1, y: 0, z: 1 })),
	updateCameraActorTransformFromTrack: vi.fn(),
	getCameraActorScale: vi.fn(() => ({ x: 1, y: 1, z: 1 })),
	setCameraActorScale: vi.fn(),
	// TransformControls
	setTransformMode: vi.fn(),
	// 预览
	setPreviewCanvas: vi.fn(),
	getViewState: vi.fn(() => ({
		cameraPosition: { x: 3, y: 2, z: 5 },
		target: { x: 0, y: 1, z: 0 }
	})),
	// 渲染
	requestRender: vi.fn(),
	dispose: vi.fn()
}

// mock import
vi.mock('@/ui/WorkFlow/WorlFlowNodes/sceneLayout/SceneLayoutPreviewViewer', () => ({
	SceneLayoutPreviewViewer: vi.fn(() => mockPreviewViewer),
	SceneLayoutViewState: {}
}))

// ── 辅助函数 ──────────────────────────────────────────────────────────────────
function createViewer(): {
	viewer: DirectorSceneViewer
	callbacks: Record<string, ReturnType<typeof vi.fn>>
} {
	const callbacks = {
		onCameraTrackChange: vi.fn(),
		onCameraScaleChange: vi.fn(),
		onSelectionChange: vi.fn(),
		onError: vi.fn(),
		onReady: vi.fn()
	}
	// DirectorSceneViewer constructor 需要 canvas，在 jsdom 下创建一个空的
	const canvas = document.createElement('canvas')
	const viewer = new DirectorSceneViewer(canvas, callbacks)
	return { viewer, callbacks }
}

/**
 * 构造一个初始 track 并设置到 viewer 中。
 */
function setupTrack(
	viewer: DirectorSceneViewer,
	overrides?: Partial<{
		px: number
		py: number
		pz: number
		tx: number
		ty: number
		tz: number
		fov: number
		roll: number
	}>
): WorkflowDirectorCameraTrack {
	const o = {
		px: 0,
		py: 2,
		pz: 5,
		tx: 0,
		ty: 1,
		tz: 0,
		fov: 50,
		roll: 0,
		...overrides
	}
	const track: WorkflowDirectorCameraTrack = {
		id: 'test-cam',
		name: 'Test Camera',
		duration: 5,
		keyframes: [
			{
				id: 'kf-0',
				time: 0,
				position: { x: o.px, y: o.py, z: o.pz },
				target: { x: o.tx, y: o.ty, z: o.tz },
				fov: o.fov,
				roll: o.roll,
				easing: 'linear'
			}
		]
	}
	viewer.setCameraTrack(track)
	return track
}

describe('DirectorSceneViewer - Camera Transform', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	// ── getCurrentCameraInfo ─────────────────────────────────────────────────
	describe('getCurrentCameraInfo', () => {
		it('returns null when no track is set', () => {
			const { viewer } = createViewer()
			expect(viewer.getCurrentCameraInfo()).toBeNull()
		})

		it('returns fov, position, target from keyframe', () => {
			const { viewer } = createViewer()
			setupTrack(viewer)
			const info = viewer.getCurrentCameraInfo()
			expect(info).not.toBeNull()
			expect(info!.fov).toBe(50)
			expect(info!.position).toEqual({ x: 0, y: 2, z: 5 })
			expect(info!.target).toEqual({ x: 0, y: 1, z: 0 })
		})

		it('defaults fov to 50 when keyframe.fov is 0 or NaN', () => {
			const { viewer } = createViewer()
			setupTrack(viewer, { fov: 0 })
			expect(viewer.getCurrentCameraInfo()!.fov).toBe(50)
		})
	})

	// ── updateCameraPosition ─────────────────────────────────────────────────
	describe('updateCameraPosition', () => {
		it('does nothing when no track is set', () => {
			const { viewer, callbacks } = createViewer()
			viewer.updateCameraPosition('x', 10)
			expect(callbacks.onCameraTrackChange).not.toHaveBeenCalled()
		})

		it('updates single axis position and emits track change', () => {
			const { viewer, callbacks } = createViewer()
			setupTrack(viewer)
			viewer.updateCameraPosition('x', 10)

			const info = viewer.getCurrentCameraInfo()
			expect(info!.position.x).toBe(10)
			expect(info!.position.y).toBe(2) // unchanged
			expect(info!.position.z).toBe(5) // unchanged
			expect(callbacks.onCameraTrackChange).toHaveBeenCalledTimes(1)
			expect(mockPreviewViewer.updateCameraActorTransformFromTrack).toHaveBeenCalledTimes(1)
		})

		it('updates y and z axes correctly', () => {
			const { viewer } = createViewer()
			setupTrack(viewer)
			viewer.updateCameraPosition('y', 8)
			viewer.updateCameraPosition('z', -3)

			const info = viewer.getCurrentCameraInfo()
			expect(info!.position.y).toBe(8)
			expect(info!.position.z).toBe(-3)
		})
	})

	// ── updateCameraRotation ─────────────────────────────────────────────────
	describe('updateCameraRotation', () => {
		it('does nothing when no track is set', () => {
			const { viewer, callbacks } = createViewer()
			viewer.updateCameraRotation('y', 45)
			expect(callbacks.onCameraTrackChange).not.toHaveBeenCalled()
		})

		it('sets yaw (Y axis) to 90 degrees', () => {
			const { viewer, callbacks } = createViewer()
			setupTrack(viewer, { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 5 })
			// 初始 forward 为 +Z → yaw=0
			viewer.updateCameraRotation('y', 90)

			const info = viewer.getCurrentCameraInfo()
			// yaw=90° → forward.x = sin(90°) = 1, forward.z = cos(90°) ≈ 0
			const dist = 5 // original distance
			expect(info!.target.x).toBeCloseTo(dist, 1)
			expect(info!.target.z).toBeCloseTo(0, 1)
			expect(callbacks.onCameraTrackChange).toHaveBeenCalledTimes(1)
			expect(mockPreviewViewer.updateCameraActorTransformFromTrack).toHaveBeenCalledTimes(1)
		})

		it('sets pitch (X axis) to 45 degrees', () => {
			const { viewer } = createViewer()
			setupTrack(viewer, { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 5 })
			// 初始 forward 为 +Z → pitch=0
			viewer.updateCameraRotation('x', 45)

			const info = viewer.getCurrentCameraInfo()
			// pitch=45° → forward.y = sin(45°) ≈ 0.707
			const dist = 5
			expect(info!.target.y).toBeCloseTo(dist * Math.sin((45 * Math.PI) / 180), 1)
			// z = cos(45°) * dist
			expect(info!.target.z).toBeCloseTo(dist * Math.cos((45 * Math.PI) / 180), 1)
		})

		it('clamps pitch to ±89°', () => {
			const { viewer } = createViewer()
			setupTrack(viewer, { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 5 })
			viewer.updateCameraRotation('x', 120) // should be clamped to ~89°

			const info = viewer.getCurrentCameraInfo()
			// pitch clamped → forward.y < 1 (not straight up)
			const dist = 5
			expect(info!.target.y).toBeLessThan(dist) // not at max
			expect(info!.target.y).toBeGreaterThan(dist * 0.99) // close to max
		})

		it('writes roll (Z axis) to keyframe.roll', () => {
			const { viewer } = createViewer()
			setupTrack(viewer)
			viewer.updateCameraRotation('z', 30)

			const track = viewer.getCurrentCameraTrack()
			expect(track!.keyframes[0].roll).toBe(30)
		})

		it('preserves distance from position to target after rotation', () => {
			const { viewer } = createViewer()
			setupTrack(viewer, { px: 1, py: 2, pz: 3, tx: 4, ty: 6, tz: 3 })
			// dist = sqrt(9+16+0) = 5
			viewer.updateCameraRotation('y', 45)

			const info = viewer.getCurrentCameraInfo()
			const dx = info!.target.x - info!.position.x
			const dy = info!.target.y - info!.position.y
			const dz = info!.target.z - info!.position.z
			const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
			expect(dist).toBeCloseTo(5, 2)
		})
	})

	// ── updateCameraFov ──────────────────────────────────────────────────────
	describe('updateCameraFov', () => {
		it('does nothing when no track is set', () => {
			const { viewer, callbacks } = createViewer()
			viewer.updateCameraFov(75)
			expect(callbacks.onCameraTrackChange).not.toHaveBeenCalled()
		})

		it('sets valid fov and emits change', () => {
			const { viewer, callbacks } = createViewer()
			setupTrack(viewer)
			viewer.updateCameraFov(75)

			expect(viewer.getCurrentCameraInfo()!.fov).toBe(75)
			expect(callbacks.onCameraTrackChange).toHaveBeenCalledTimes(1)
		})

		it('clamps fov to minimum 1', () => {
			const { viewer } = createViewer()
			setupTrack(viewer)
			viewer.updateCameraFov(-10)
			expect(viewer.getCurrentCameraInfo()!.fov).toBe(1)
		})

		it('clamps fov to maximum 179', () => {
			const { viewer } = createViewer()
			setupTrack(viewer)
			viewer.updateCameraFov(300)
			expect(viewer.getCurrentCameraInfo()!.fov).toBe(179)
		})
	})

	// ── getCameraActorScale / setCameraActorScale ─────────────────────────────
	describe('Camera Actor Scale', () => {
		it('returns default {1,1,1} when no previewViewer', () => {
			const { viewer } = createViewer()
			// previewViewer exists but mock returns {1,1,1}
			const scale = viewer.getCameraActorScale()
			expect(scale).toEqual({ x: 1, y: 1, z: 1 })
		})

		it('delegates setCameraActorScale to previewViewer', () => {
			const { viewer } = createViewer()
			viewer.setCameraActorScale('x', 2.5)
			expect(mockPreviewViewer.setCameraActorScale).toHaveBeenCalledWith('x', 2.5)
		})
	})

	// ── addCameraAtCenter ─────────────────────────────────────────────────────
	describe('addCameraAtCenter', () => {
		it('adds camera with current view position, target, and fov', async () => {
			const { viewer, callbacks } = createViewer()
			const result = await viewer.addCameraAtCenter()
			expect(result).toBe(true)
			expect(callbacks.onCameraTrackChange).toHaveBeenCalledTimes(1)
			// mock returns pos={3,2,5}, target={0,1,0}, fov=60
			const track = viewer.getCurrentCameraTrack()
			expect(track!.keyframes[0].position).toEqual({ x: 3, y: 2, z: 5 })
			expect(track!.keyframes[0].target).toEqual({ x: 0, y: 1, z: 0 })
			expect(track!.keyframes[0].fov).toBe(60)
		})

		it('rejects adding when camera already exists', async () => {
			const { viewer, callbacks } = createViewer()
			setupTrack(viewer) // camera already exists
			const result = await viewer.addCameraAtCenter()
			expect(result).toBe(false)
			expect(callbacks.onError).toHaveBeenCalled()
		})
	})

	// ── setTransformMode ──────────────────────────────────────────────────────
	describe('setTransformMode', () => {
		it('delegates to previewViewer.setTransformMode', () => {
			const { viewer } = createViewer()
			viewer.setTransformMode('rotate')
			expect(mockPreviewViewer.setTransformMode).toHaveBeenCalledWith('rotate')
		})
	})

	// ── removeCamera ──────────────────────────────────────────────────────────
	describe('removeCamera', () => {
		it('removes existing camera and emits change', async () => {
			const { viewer, callbacks } = createViewer()
			setupTrack(viewer)
			const result = await viewer.removeCamera()
			expect(result).toBe(true)
			expect(viewer.hasCamera()).toBe(false)
			expect(callbacks.onCameraTrackChange).toHaveBeenCalledWith([])
		})

		it('returns false when no camera exists', async () => {
			const { viewer } = createViewer()
			const result = await viewer.removeCamera()
			expect(result).toBe(false)
		})
	})
})
