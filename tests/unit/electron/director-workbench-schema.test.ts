import { describe, it, expect } from 'vitest'

/**
 * 导演多场景工作台后端归一化逻辑验证：
 * 多房间 JSON → 全局坐标占位体（含房间壳体、门洞切分、房间分组）
 */
describe('agent-skills/director 后端多房间拍平', () => {
	const twoRoomJson = {
		workbenchType: 'director-multi-scene',
		sceneSummary: '客厅与卧室',
		rooms: [
			{
				roomId: 'room-1',
				label: '客厅',
				sourceSceneIndex: 1,
				roomShell: {
					width: 6,
					depth: 5,
					height: 2.8,
					wallThickness: 0.2,
					openWallRole: 'front'
				},
				origin: { x: 0, y: 0, z: 0 },
				rotationYaw: 0,
				openings: [
					{ wallRole: 'back', connectsToRoomId: 'room-2', width: 1, positionAlongWall: 0.5 }
				],
				objects: [
					{
						id: 'sofa-1',
						name: '沙发',
						category: '沙发',
						position: { x: 0, y: 0, z: 1 },
						size: { width: 2, height: 0.8, depth: 0.9 },
						rotation: { yaw: 0 },
						sourceImageIndex: 1,
						imageRect: { x: 0.1, y: 0.1, w: 0.5, h: 0.3 }
					}
				]
			},
			{
				roomId: 'room-2',
				label: '卧室',
				sourceSceneIndex: 2,
				roomShell: { width: 4, depth: 4, height: 2.8, wallThickness: 0.2 },
				origin: { x: 0, y: 0, z: -6 },
				rotationYaw: 0,
				openings: [
					{ wallRole: 'front', connectsToRoomId: 'room-1', width: 1, positionAlongWall: 0.5 }
				],
				objects: [
					{
						id: 'bed-1',
						name: '床',
						category: '床',
						position: { x: 0, y: 0, z: 0 },
						size: { width: 1.8, height: 0.5, depth: 2 },
						rotation: { yaw: 0 },
						sourceImageIndex: 2,
						imageRect: { x: 0.1, y: 0.1, w: 0.5, h: 0.3 }
					}
				]
			}
		],
		connections: [{ fromRoomId: 'room-1', toRoomId: 'room-2' }]
	}

	it('flattenDirectorWorkbench 输出全局占位体与房间元数据', async () => {
		const mod = await import('../../../electron/backend/modules/agent-skills/director/index.mjs')
		const result = mod.flattenDirectorWorkbench(twoRoomJson)
		expect(result.ok).toBe(true)
		expect(result.workbenchType).toBe('director-multi-scene')
		expect(result.rooms).toHaveLength(2)
		expect(result.connections).toHaveLength(1)
		// 2 个物体 + 每房间 6 个壳体项（地面1 + 无门洞墙3 + 门洞墙切分2）= 14
		expect(result.layoutItems).toHaveLength(14)
		// 物体携带房间归属
		const sofa = result.layoutItems.find((i: any) => i.id === 'sofa-1')
		expect(sofa.roomId).toBe('room-1')
		const bed = result.layoutItems.find((i: any) => i.id === 'bed-1')
		expect(bed.roomId).toBe('room-2')
		expect(bed.position.z).toBeCloseTo(-6, 6)
	})

	it('isDirectorWorkbenchJson 识别多房间 JSON', async () => {
		const mod = await import('../../../electron/backend/modules/agent-skills/director/index.mjs')
		expect(mod.isDirectorWorkbenchJson({ workbenchType: 'director-multi-scene' })).toBe(true)
		expect(mod.isDirectorWorkbenchJson({ rooms: [{}] })).toBe(true)
		expect(mod.isDirectorWorkbenchJson({ objects: [] })).toBe(false)
	})

	it('applyRoomTransform 旋转+平移正确', async () => {
		const mod = await import('../../../electron/backend/modules/agent-skills/director/index.mjs')
		const p = mod.applyRoomTransform(1, 1, { x: 10, z: 0 }, 90)
		expect(p.x).toBeCloseTo(11, 6)
		expect(p.z).toBeCloseTo(-1, 6)
	})
})
