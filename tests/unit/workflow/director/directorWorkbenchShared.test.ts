import { describe, it, expect } from 'vitest'
import {
	DIRECTOR_SCENE_ANCHOR_COUNT,
	directorSceneAnchorId,
	isDirectorSceneAnchorId,
	DIRECTOR_WORKBENCH_TYPE,
	isDirectorWorkbenchSettings,
	isDirectorWorkbenchJson,
	applyRoomTransform,
	applyRoomYaw,
	roomColor,
	buildDirectorRoomShellItems,
	annotateDirectorObjects
} from '@/views/AIWorkflow/node-business/scene/director/directorWorkbenchShared'

describe('导演多场景工作台 - 锚点约定', () => {
	it('场景锚点 id 形如 in-scene-N', () => {
		expect(directorSceneAnchorId(1)).toBe('in-scene-1')
		expect(directorSceneAnchorId(6)).toBe('in-scene-6')
		expect(DIRECTOR_SCENE_ANCHOR_COUNT).toBe(6)
	})

	it('isDirectorSceneAnchorId 仅识别 in-scene-N', () => {
		expect(isDirectorSceneAnchorId('in-scene-1')).toBe(true)
		expect(isDirectorSceneAnchorId('in-scene-12')).toBe(true)
		expect(isDirectorSceneAnchorId('in-image')).toBe(false)
		expect(isDirectorSceneAnchorId('in-image-2')).toBe(false)
	})
})

describe('导演多场景工作台 - 模式/JSON 识别', () => {
	it('isDirectorWorkbenchSettings 识别 sceneType', () => {
		expect(
			isDirectorWorkbenchSettings({ mode: 'scene-layout', sceneType: DIRECTOR_WORKBENCH_TYPE })
		).toBe(true)
		expect(isDirectorWorkbenchSettings({ sceneType: 'indoor' })).toBe(false)
		expect(isDirectorWorkbenchSettings(null)).toBe(false)
	})

	it('isDirectorWorkbenchJson 识别 workbenchType 或 rooms 数组', () => {
		expect(isDirectorWorkbenchJson({ workbenchType: 'director-multi-scene' })).toBe(true)
		expect(isDirectorWorkbenchJson({ rooms: [{}, {}] })).toBe(true)
		expect(isDirectorWorkbenchJson({ objects: [] })).toBe(false)
		expect(isDirectorWorkbenchJson(null)).toBe(false)
	})
})

describe('导演多场景工作台 - 坐标换算', () => {
	it('yaw=0 时仅平移', () => {
		const p = applyRoomTransform(1, 2, { x: 10, z: 20 }, 0)
		expect(p.x).toBeCloseTo(11)
		expect(p.z).toBeCloseTo(22)
	})

	it('yaw=90 时旋转 90 度再平移', () => {
		const p = applyRoomTransform(1, 1, { x: 10, z: 0 }, 90)
		expect(p.x).toBeCloseTo(11, 6)
		expect(p.z).toBeCloseTo(-1, 6)
	})

	it('applyRoomYaw 叠加房间朝向并归一化', () => {
		expect(applyRoomYaw(90, 90)).toBe(180)
		expect(applyRoomYaw(270, 180)).toBe(90)
	})

	it('roomColor 按房间循环取色', () => {
		expect(roomColor(0)).toBe(roomColor(0))
		expect(roomColor(0)).not.toBe(roomColor(1))
	})
})

describe('导演多场景工作台 - 房间壳体占位体合成', () => {
	const twoRoomJson = {
		workbenchType: 'director-multi-scene',
		rooms: [
			{
				roomId: 'room-1',
				label: '客厅',
				sourceSceneIndex: 1,
				roomShell: { width: 6, depth: 5, height: 2.8, wallThickness: 0.2, openWallRole: 'front' },
				origin: { x: 0, z: 0 },
				rotationYaw: 0,
				openings: [
					{ wallRole: 'back', connectsToRoomId: 'room-2', width: 1, positionAlongWall: 0.5 }
				]
			},
			{
				roomId: 'room-2',
				label: '卧室',
				sourceSceneIndex: 2,
				roomShell: { width: 4, depth: 4, height: 2.8, wallThickness: 0.2 },
				origin: { x: 0, z: -6 },
				rotationYaw: 0,
				openings: [
					{ wallRole: 'front', connectsToRoomId: 'room-1', width: 1, positionAlongWall: 0.5 }
				]
			}
		]
	}

	it('为每个房间生成地面/墙段，且墙段按门洞切分（无天花板、无镜头开口）', () => {
		const items = buildDirectorRoomShellItems(twoRoomJson.rooms)
		// 每个房间：1 地面，无天花板；
		// 房间1：back 门洞切 2 段 + front 无开口 1 段 + left 1 + right 1 = 5 段
		// 房间2：front 门洞切 2 段 + back 1 + left 1 + right 1 = 5 段
		expect(items.length).toBe(2 + 5 + 5)
		expect(items.filter((i) => i.keyElementType === 'floor')).toHaveLength(2)
		// 导演模式不生成天花板
		expect(items.filter((i) => i.keyElementType === 'ceiling')).toHaveLength(0)
		expect(items.filter((i) => i.keyElementType === 'wall')).toHaveLength(10)
		// 全部带房间分组字段
		for (const item of items) {
			expect(item.roomId).toBeTruthy()
			expect(item.roomLabel).toBeTruthy()
			expect(item.isRoomShell).toBe(true)
		}
	})

	it('所有墙段底部落地（position.y = 0），与地面齐平', () => {
		const items = buildDirectorRoomShellItems(twoRoomJson.rooms)
		const walls = items.filter((i) => i.keyElementType === 'wall')
		expect(walls.length).toBeGreaterThan(0)
		for (const wall of walls) {
			expect(wall.position.y).toBe(0)
		}
	})

	it('openWallRole 不再产生镜头观察开口（front 墙无缺口时为整段）', () => {
		const items = buildDirectorRoomShellItems(twoRoomJson.rooms)
		// 房间1 的 roomShell 带 openWallRole: 'front'，但 front 墙无门洞，
		// 不再因镜头开口被切分，应为完整 1 段
		const frontSegs = items.filter((i) => i.id.startsWith('room-1-shell-wall-front'))
		expect(frontSegs).toHaveLength(1)
	})

	it('房间2 的壳体使用全局坐标（origin 偏移）', () => {
		const items = buildDirectorRoomShellItems(twoRoomJson.rooms)
		const room2Floor = items.find((i) => i.id === 'room-2-shell-floor')
		expect(room2Floor).toBeTruthy()
		expect(room2Floor?.position.z).toBeCloseTo(-6, 6)
	})

	it('门洞墙被切为两段且中间留空', () => {
		const items = buildDirectorRoomShellItems(twoRoomJson.rooms)
		const backSegs = items.filter((i) => i.id.startsWith('room-1-shell-wall-back'))
		expect(backSegs).toHaveLength(2)
		const xs = backSegs.map((i) => i.position.x).sort((a, b) => a - b)
		// 门洞宽 1m 居中：左段中心 -1.75，右段中心 1.75
		expect(xs[0]).toBeCloseTo(-1.75, 2)
		expect(xs[1]).toBeCloseTo(1.75, 2)
	})
})

describe('导演多场景工作台 - 顶层 objects 房间标注', () => {
	it('为全局物体补 roomId/颜色/分组字段', () => {
		const items = annotateDirectorObjects({
			rooms: [{ roomId: 'room-1', label: '客厅' }],
			objects: [
				{
					id: 'sofa-1',
					name: '沙发',
					position: { x: 0, y: 0, z: 1 },
					size: { width: 2, height: 0.8, depth: 0.9 }
				}
			]
		})
		expect(items).toHaveLength(1)
		expect(items[0].roomId).toBe('room-1')
		expect(items[0].roomLabel).toBe('客厅')
		expect(items[0].color).toBeTruthy()
		expect(items[0].isRoomShell).toBe(false)
	})
})
