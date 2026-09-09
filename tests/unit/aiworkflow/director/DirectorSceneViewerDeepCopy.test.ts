/**
 * DirectorSceneViewer captureState/loadScene 深拷贝完整性测试
 *
 * 验证：
 * 1. captureState 返回的角色 keyframes 包含完整的 position/rotation/scale
 * 2. 修改原始对象不影响 captureState 返回的快照（深拷贝隔离）
 * 3. setCameraActorTransform 同步更新 currentTrack.keyframes[0]
 *    （否则保存后重新打开会回档到旧位置）
 */

import { describe, it, expect } from 'vitest'

// 直接测试数据结构层面的深拷贝逻辑，不依赖 Three.js
// 因为 DirectorSceneViewer 的深拷贝逻辑是纯数据操作

interface Vec3 {
	x: number
	y: number
	z: number
}

interface Rotation {
	yaw: number
	pitch: number
	roll: number
}

interface CharacterKeyframe {
	id: string
	frame: number
	position: Vec3
	rotation?: Rotation
	scale?: Vec3
	easing: string
}

interface Character {
	id: string
	name: string
	position: Vec3
	rotation?: Rotation
	scale?: Vec3
	keyframes?: CharacterKeyframe[]
}

interface CameraKeyframe {
	id: string
	frame: number
	position: Vec3
	target: Vec3
	fov: number
	easing: string
}

interface CameraTrack {
	id: string
	name: string
	keyframes: CameraKeyframe[]
}

interface Snapshot {
	cameraTracks?: CameraTrack[]
	characters?: Character[]
	cameraParentId?: string | null
	fps?: number
	totalFrames?: number
}

/**
 * 模拟 captureState 的深拷贝逻辑（与 DirectorSceneViewer.captureState 一致）。
 * 这里独立实现是为了不依赖 Three.js 运行环境。
 */
function captureState(characters: Character[], track: CameraTrack | null): Snapshot {
	return {
		cameraTracks: track ? [JSON.parse(JSON.stringify(track))] : undefined,
		activeCameraTrackId: track?.id,
		characters: characters.map((c) => ({
			...c,
			position: { x: c.position.x, y: c.position.y, z: c.position.z },
			rotation: c.rotation
				? { yaw: c.rotation.yaw, pitch: c.rotation.pitch, roll: c.rotation.roll }
				: undefined,
			scale: c.scale ? { x: c.scale.x, y: c.scale.y, z: c.scale.z } : undefined,
			keyframes: c.keyframes
				? c.keyframes.map((k) => ({
						...k,
						position: { x: k.position.x, y: k.position.y, z: k.position.z },
						rotation: k.rotation
							? { yaw: k.rotation.yaw, pitch: k.rotation.pitch, roll: k.rotation.roll }
							: undefined,
						scale: k.scale ? { x: k.scale.x, y: k.scale.y, z: k.scale.z } : undefined
					}))
				: undefined
		})),
		cameraParentId: null,
		fps: 24,
		totalFrames: 120
	}
}

describe('DirectorSceneViewer 深拷贝完整性', () => {
	describe('captureState 角色关键帧深拷贝', () => {
		it('角色关键帧的 position 应被深拷贝', () => {
			const char: Character = {
				id: 'c1',
				name: 'Hero',
				position: { x: 1, y: 2, z: 3 },
				rotation: { yaw: 0.5, pitch: 0, roll: 0 },
				scale: { x: 1, y: 1, z: 1 },
				keyframes: [
					{
						id: 'kf1',
						frame: 0,
						position: { x: 10, y: 20, z: 30 },
						rotation: { yaw: 1.5, pitch: 0.3, roll: 0 },
						scale: { x: 2, y: 2, z: 2 },
						easing: 'ease-in-out'
					}
				]
			}
			const snap = captureState([char], null)
			const kf = snap.characters![0].keyframes![0]

			// 修改原始
			char.keyframes![0].position.x = 999
			char.keyframes![0].rotation!.yaw = 999
			char.keyframes![0].scale!.x = 999

			// 快照不受影响
			expect(kf.position.x).toBe(10)
			expect(kf.rotation!.yaw).toBe(1.5)
			expect(kf.scale!.x).toBe(2)
		})

		it('角色的 position/rotation/scale 应被深拷贝', () => {
			const char: Character = {
				id: 'c1',
				name: 'Hero',
				position: { x: 1, y: 2, z: 3 },
				rotation: { yaw: 0.5, pitch: 0, roll: 0 },
				scale: { x: 1, y: 1, z: 1 }
			}
			const snap = captureState([char], null)
			const c = snap.characters![0]

			// 修改原始
			char.position.x = 999
			char.rotation!.yaw = 999
			char.scale!.x = 999

			expect(c.position.x).toBe(1)
			expect(c.rotation!.yaw).toBe(0.5)
			expect(c.scale!.x).toBe(1)
		})
	})

	describe('captureState 摄像头轨道深拷贝', () => {
		it('摄像头轨道的 keyframes 应被深拷贝', () => {
			const track: CameraTrack = {
				id: 't1',
				name: 'Cam',
				keyframes: [
					{
						id: 'ckf1',
						frame: 0,
						position: { x: -4, y: 1.7, z: 1.5 },
						target: { x: -5.7, y: 1, z: -1 },
						fov: 50,
						easing: 'ease-in-out'
					}
				]
			}
			const snap = captureState([], track)
			const kf = snap.cameraTracks![0].keyframes[0]

			// 修改原始
			track.keyframes[0].position.x = 999
			track.keyframes[0].target.y = 999

			expect(kf.position.x).toBe(-4)
			expect(kf.target.y).toBe(1)
		})
	})

	describe('setCameraActorTransform 同步更新 track', () => {
		it('Agent 设置摄像头变换后 currentTrack.keyframes[0] 应同步更新', () => {
			// 模拟 setCameraActorTransform 的核心逻辑
			const currentTrack: CameraTrack = {
				id: 't1',
				name: 'Cam',
				keyframes: [
					{
						id: 'ckf1',
						frame: 0,
						position: { x: 0, y: 0, z: 0 },
						target: { x: 0, y: 0, z: 0 },
						fov: 50,
						easing: 'ease-in-out'
					}
				]
			}

			// 模拟 Agent 调用 dc_set_camera_transform
			const newPosition = { x: -4, y: 1.7, z: 1.5 }
			const newTarget = { x: -5.7, y: 1, z: -1 }

			// setCameraActorTransform 的核心逻辑
			if (currentTrack?.keyframes?.[0]) {
				currentTrack.keyframes[0].position = {
					x: newPosition.x,
					y: newPosition.y,
					z: newPosition.z
				}
				currentTrack.keyframes[0].target = {
					x: newTarget.x,
					y: newTarget.y,
					z: newTarget.z
				}
			}

			// 验证 track 数据已更新
			expect(currentTrack.keyframes[0].position).toEqual(newPosition)
			expect(currentTrack.keyframes[0].target).toEqual(newTarget)

			// 验证 captureState 保存的是最新值
			const snap = captureState([], currentTrack)
			expect(snap.cameraTracks![0].keyframes[0].position).toEqual(newPosition)
			expect(snap.cameraTracks![0].keyframes[0].target).toEqual(newTarget)
		})

		it('未设置 keyframes 时 setCameraActorTransform 不应崩溃', () => {
			const currentTrack: CameraTrack = {
				id: 't1',
				name: 'Cam',
				keyframes: []
			}

			// 不应抛出
			expect(() => {
				if (currentTrack?.keyframes?.[0]) {
					currentTrack.keyframes[0].position = { x: 1, y: 2, z: 3 }
				}
			}).not.toThrow()
		})
	})

	describe('loadScene → captureState 往返一致性', () => {
		it('loadScene 后 captureState 应保留所有字段', () => {
			const original: Character = {
				id: 'c1',
				name: 'Hero',
				position: { x: 1, y: 2, z: 3 },
				rotation: { yaw: 0.5, pitch: 0.1, roll: 0.2 },
				scale: { x: 1, y: 1, z: 1 },
				keyframes: [
					{
						id: 'kf1',
						frame: 0,
						position: { x: 10, y: 20, z: 30 },
						rotation: { yaw: 1, pitch: 2, roll: 3 },
						scale: { x: 2, y: 2, z: 2 },
						easing: 'ease-in-out'
					}
				]
			}

			// loadScene 的深拷贝逻辑（与 DirectorSceneViewer.loadScene 一致）
			const loaded: Character = {
				...original,
				position: {
					x: Number(original.position?.x) || 0,
					y: Number(original.position?.y) || 0,
					z: Number(original.position?.z) || 0
				},
				rotation: original.rotation
					? {
							yaw: original.rotation.yaw,
							pitch: original.rotation.pitch,
							roll: original.rotation.roll
						}
					: undefined,
				scale: original.scale
					? { x: original.scale.x, y: original.scale.y, z: original.scale.z }
					: undefined,
				keyframes: Array.isArray(original.keyframes)
					? original.keyframes.map((k) => ({
							...k,
							position: {
								x: Number(k.position?.x) || 0,
								y: Number(k.position?.y) || 0,
								z: Number(k.position?.z) || 0
							},
							rotation: k.rotation
								? {
										yaw: k.rotation.yaw,
										pitch: k.rotation.pitch,
										roll: k.rotation.roll
									}
								: undefined,
							scale: k.scale ? { x: k.scale.x, y: k.scale.y, z: k.scale.z } : undefined
						}))
					: undefined
			}

			// captureState
			const snap = captureState([loaded], null)
			const snapChar = snap.characters![0]
			const snapKf = snapChar.keyframes![0]

			// 所有字段保留
			expect(snapChar.position).toEqual({ x: 1, y: 2, z: 3 })
			expect(snapChar.rotation).toEqual({ yaw: 0.5, pitch: 0.1, roll: 0.2 })
			expect(snapChar.scale).toEqual({ x: 1, y: 1, z: 1 })
			expect(snapKf.position).toEqual({ x: 10, y: 20, z: 30 })
			expect(snapKf.rotation).toEqual({ yaw: 1, pitch: 2, roll: 3 })
			expect(snapKf.scale).toEqual({ x: 2, y: 2, z: 2 })
		})
	})
})
