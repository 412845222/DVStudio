import { describe, it, expect } from 'vitest'
import {
	DIRECTOR_CONSOLE_ANCHOR_IN_JSON,
	DIRECTOR_CONSOLE_NODE_TYPE,
	DIRECTOR_DATA_VERSION_INITIAL,
	DIRECTOR_DEFAULT_FOV,
	createDefaultCameraKeyframe,
	createDefaultCameraTrack,
	createDefaultLight,
	createDefaultLightRig,
	createDefaultDirectorConsoleSettings
} from '@/aiworkflow/domain/director/directorConsoleShared'

describe('directorConsoleShared', () => {
	describe('constants', () => {
		it('DIRECTOR_CONSOLE_ANCHOR_IN_JSON should be "in-json"', () => {
			expect(DIRECTOR_CONSOLE_ANCHOR_IN_JSON).toBe('in-json')
		})

		it('DIRECTOR_CONSOLE_NODE_TYPE should be "director-console"', () => {
			expect(DIRECTOR_CONSOLE_NODE_TYPE).toBe('director-console')
		})

		it('DIRECTOR_DATA_VERSION_INITIAL should be 1', () => {
			expect(DIRECTOR_DATA_VERSION_INITIAL).toBe(1)
		})

		it('DIRECTOR_DEFAULT_FOV should be 50', () => {
			expect(DIRECTOR_DEFAULT_FOV).toBe(50)
		})
	})

	describe('createDefaultCameraKeyframe', () => {
		it('should create a keyframe with default values', () => {
			const kf = createDefaultCameraKeyframe()
			expect(kf.time).toBe(0)
			expect(kf.position).toEqual({ x: 0, y: 2, z: 5 })
			expect(kf.target).toEqual({ x: 0, y: 0, z: 0 })
			expect(kf.fov).toBe(DIRECTOR_DEFAULT_FOV)
			expect(kf.roll).toBe(0)
			expect(kf.easing).toBe('ease-in-out')
			expect(kf.id).toBeTruthy()
		})

		it('should accept custom time, position and target', () => {
			const kf = createDefaultCameraKeyframe(
				2.5,
				{ x: 1, y: 3, z: 7 },
				{ x: 4, y: 1, z: 0 }
			)
			expect(kf.time).toBe(2.5)
			expect(kf.position).toEqual({ x: 1, y: 3, z: 7 })
			expect(kf.target).toEqual({ x: 4, y: 1, z: 0 })
		})

		it('should generate unique ids', () => {
			const a = createDefaultCameraKeyframe()
			const b = createDefaultCameraKeyframe()
			expect(a.id).not.toBe(b.id)
		})
	})

	describe('createDefaultCameraTrack', () => {
		it('should create a track with a default keyframe', () => {
			const track = createDefaultCameraTrack()
			expect(track.name).toBe('主镜头')
			expect(track.duration).toBe(5)
			expect(track.loop).toBe(false)
			expect(track.keyframes).toHaveLength(1)
			expect(track.keyframes[0].time).toBe(0)
			expect(track.id).toBeTruthy()
		})

		it('should accept a custom name', () => {
			const track = createDefaultCameraTrack('特写镜头')
			expect(track.name).toBe('特写镜头')
		})
	})

	describe('createDefaultLight', () => {
		it('should create an enabled light with given type', () => {
			const light = createDefaultLight('key', '主光', 'directional')
			expect(light.id).toBe('key')
			expect(light.name).toBe('主光')
			expect(light.type).toBe('directional')
			expect(light.enabled).toBe(true)
			expect(light.intensity).toBe(1)
			expect(light.color).toBe('#ffffff')
		})

		it('should default directional/spot lights to castShadow=true', () => {
			const dir = createDefaultLight('a', 'A', 'directional')
			const spot = createDefaultLight('b', 'B', 'spot')
			const amb = createDefaultLight('c', 'C', 'ambient')
			expect(dir.castShadow).toBe(true)
			expect(spot.castShadow).toBe(true)
			expect(amb.castShadow).toBe(false)
		})

		it('should accept custom intensity and color', () => {
			const light = createDefaultLight('x', 'X', 'point', 0.8, '#ff0000')
			expect(light.intensity).toBe(0.8)
			expect(light.color).toBe('#ff0000')
		})
	})

	describe('createDefaultLightRig', () => {
		it('should create a three-point rig with 4 lights', () => {
			const rig = createDefaultLightRig()
			expect(rig.preset).toBe('three-point')
			expect(rig.exposure).toBe(1)
			expect(rig.lights).toHaveLength(4)
			const types = rig.lights.map((l) => l.type)
			expect(types).toContain('ambient')
			expect(types.filter((t) => t === 'directional')).toHaveLength(3)
		})

		it('should name lights consistently', () => {
			const rig = createDefaultLightRig()
			const names = rig.lights.map((l) => l.name)
			expect(names).toContain('环境光')
			expect(names).toContain('主光')
			expect(names).toContain('补光')
			expect(names).toContain('轮廓光')
		})
	})

	describe('createDefaultDirectorConsoleSettings', () => {
		it('should create settings with idle status and empty data', () => {
			const settings = createDefaultDirectorConsoleSettings()
			expect(settings.status).toBe('idle')
			expect(settings.message).toBe('')
			expect(settings.inputJson).toBe('')
			expect(settings.lastOpenedAt).toBe(0)
			expect(settings.directorDataVersion).toBe(0)
			expect(settings.cameraTracks).toEqual([])
			expect(settings.activeCameraTrackId).toBe('')
			expect(settings.lightRig).toBeUndefined()
		})
	})
})