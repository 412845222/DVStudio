/**
 * 导演多场景工作台 —— 前端共享纯函数（无运行时依赖，可独立单测）
 *
 * 与后端 electron/backend/modules/agent-skills/director/ 逻辑同构：
 * - 局部↔全局坐标换算；
 * - 房间分组配色；
 * - 全局图片编号映射；
 * - 多房间 JSON 识别；
 * - 依据 roomShell/openings 合成房间壳体占位体（直连路径兜底，与后端 flatten 对齐）。
 */
import type {
	WorkflowDirectorRoom,
	WorkflowSceneLayoutItem,
	WorkflowSceneUnderstandingNodeSettings
} from '../../../../../aiworkflow/types'

/**
 * 导演多场景工作台场景锚点约定（与 store.syncSceneUnderstandAnchors 保持一致）：
 * 每个场景（房间）一个锚点 in-scene-N，序号从 1 开始，锚点为 multiInput。
 */
export const DIRECTOR_SCENE_ANCHOR_COUNT = 6

export const directorSceneAnchorId = (sceneIndex: number): string =>
	`in-scene-${Math.max(1, Math.floor(Number(sceneIndex) || 1))}`

export const isDirectorSceneAnchorId = (anchorId: string): boolean =>
	/^in-scene-\d+$/.test(String(anchorId || '').trim())

export const DIRECTOR_WORKBENCH_TYPE = 'director-multi-scene'

const ROOM_COLORS = [
	'#60a5fa',
	'#f59e0b',
	'#34d399',
	'#f472b6',
	'#a78bfa',
	'#f87171',
	'#22d3ee',
	'#facc15'
]

export const directorSceneAnchorIds = (): string[] =>
	Array.from({ length: DIRECTOR_SCENE_ANCHOR_COUNT }, (_, i) => directorSceneAnchorId(i + 1))

export const isDirectorWorkbenchSettings = (
	settings?: WorkflowSceneUnderstandingNodeSettings | null
): boolean =>
	!!settings &&
	(settings.mode === undefined || settings.mode === 'scene-layout') &&
	settings.sceneType === DIRECTOR_WORKBENCH_TYPE

export const isDirectorWorkbenchJson = (parsed: unknown): boolean => {
	if (!parsed || typeof parsed !== 'object') return false
	const obj = parsed as Record<string, unknown>
	if (String(obj.workbenchType ?? '').trim() === DIRECTOR_WORKBENCH_TYPE) return true
	return Array.isArray(obj.rooms) && obj.rooms.length > 0
}

const toNum = (v: unknown, d = 0): number => {
	const n = Number(v)
	return Number.isFinite(n) ? n : d
}

const asDict = (raw: unknown): Record<string, any> =>
	raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}

export const roomColor = (index: number): string => ROOM_COLORS[index % ROOM_COLORS.length]

/**
 * 房间局部坐标 → 全局坐标（与后端 schema.mjs applyRoomTransform 同构）
 */
export const applyRoomTransform = (
	localX: number,
	localZ: number,
	origin: { x?: number; z?: number } | undefined,
	yawDeg: number
): { x: number; z: number } => {
	const ox = toNum(origin?.x, 0)
	const oz = toNum(origin?.z, 0)
	const theta = (toNum(yawDeg, 0) * Math.PI) / 180
	const cos = Math.cos(theta)
	const sin = Math.sin(theta)
	const lx = toNum(localX, 0)
	const lz = toNum(localZ, 0)
	return {
		x: ox + lx * cos + lz * sin,
		z: oz - lx * sin + lz * cos
	}
}

export const applyRoomYaw = (localYaw: unknown, roomYaw: unknown): number => {
	let yaw = toNum(localYaw, 0) + toNum(roomYaw, 0)
	while (yaw > 180) yaw -= 360
	while (yaw < -180) yaw += 360
	return yaw
}

/**
 * 全局图片编号：场景按序号排列，返回某场景内第 localIndex（从1开始）张图的全局编号
 */
export const globalImageStartIndex = (perSceneCounts: number[], sceneIndex: number): number => {
	let start = 1
	for (let i = 0; i < perSceneCounts.length; i += 1) {
		if (i + 1 === sceneIndex) return start
		start += Math.max(0, perSceneCounts[i] || 0)
	}
	return start
}

const normWallRole = (value: unknown): string => {
	const raw = String(value ?? '')
		.trim()
		.toLowerCase()
	if (raw.startsWith('front') || raw.includes('前墙')) return 'front'
	if (raw.startsWith('back') || raw.includes('后墙')) return 'back'
	if (raw.startsWith('left') || raw.includes('左墙')) return 'left'
	if (raw.startsWith('right') || raw.includes('右墙')) return 'right'
	return raw
}

type NormalizedRoom = {
	roomId: string
	label: string
	sourceSceneIndex: number
	width: number
	depth: number
	height: number
	wallThickness: number
	openWallRole: string
	origin: { x: number; z: number }
	rotationYaw: number
	gapsByWall: Record<string, Array<{ center: number; width: number }>>
}

const normalizeRoomForShell = (rawRoom: unknown, index: number): NormalizedRoom | null => {
	const room = asDict(rawRoom)
	const roomId = String(room.roomId || `room-${index + 1}`).trim() || `room-${index + 1}`
	const shell = asDict(room.roomShell)
	const origin = asDict(room.origin)
	const width = Math.max(1, toNum(shell.width, 5))
	const depth = Math.max(1, toNum(shell.depth, 5))
	const height = Math.max(2, toNum(shell.height, 2.8))
	const gapsByWall: Record<string, Array<{ center: number; width: number }>> = {
		front: [],
		back: [],
		left: [],
		right: []
	}
	const openings = Array.isArray(room.openings) ? room.openings : []
	for (const opRaw of openings) {
		const op = asDict(opRaw)
		const role = normWallRole(op.wallRole)
		if (!gapsByWall[role]) continue
		const wallLen = role === 'front' || role === 'back' ? width : depth
		gapsByWall[role].push({
			center: (Math.min(0.95, Math.max(0.05, toNum(op.positionAlongWall, 0.5))) - 0.5) * wallLen,
			width: Math.max(0.6, toNum(op.width, 1.0))
		})
	}
	const openWallRole = ''
	// 导演模式不再生成镜头观察开口（openWallRole）：缺口只由真实门洞 openings 决定

	return {
		roomId,
		label: String(room.label || `房间${index + 1}`).trim() || `房间${index + 1}`,
		sourceSceneIndex: Math.max(1, Math.floor(toNum(room.sourceSceneIndex, index + 1))),
		width,
		depth,
		height,
		wallThickness: Math.max(0.05, toNum(shell.wallThickness, 0.2)),
		openWallRole,
		origin: { x: toNum(origin.x, 0), z: toNum(origin.z, 0) },
		rotationYaw: toNum(room.rotationYaw, 0),
		gapsByWall
	}
}

/**
 * 依据房间壳体合成占位体（直连路径兜底，与后端 flattenDirectorWorkbench 对齐）
 * 返回全局坐标的 layoutItems（地面/天花/带门洞的墙段）
 */
export const buildDirectorRoomShellItems = (rawRooms: unknown): WorkflowSceneLayoutItem[] => {
	const rooms = (Array.isArray(rawRooms) ? rawRooms : [])
		.map((r, i) => normalizeRoomForShell(r, i))
		.filter((r): r is NormalizedRoom => !!r)
		.slice(0, DIRECTOR_SCENE_ANCHOR_COUNT)

	const items: WorkflowSceneLayoutItem[] = []
	rooms.forEach((room, index) => {
		const color = roomColor(index)
		const { roomId, label, width: w, depth: d, height: h, wallThickness: t } = room

		const toGlobal = (lx: number, ly: number, lz: number, yaw = 0) => {
			const g = applyRoomTransform(lx, lz, room.origin, room.rotationYaw)
			return { x: g.x, y: ly, z: g.z, yaw: applyRoomYaw(yaw, room.rotationYaw) }
		}

		const pushShell = (
			id: string,
			name: string,
			category: string,
			keyElementType: string,
			wallRole: string,
			lx: number,
			ly: number,
			lz: number,
			size: { width: number; height: number; depth: number },
			mountType: string,
			shouldTouchGround: boolean
		) => {
			const g = toGlobal(lx, ly, lz)
			items.push({
				id: `${roomId}-${id}`,
				name,
				category,
				color,
				material: 'placeholder-shell',
				description: `${label}${name}`,
				sameTypeGroupId: `room:${roomId}`,
				sameTypeGroupLabel: label,
				placement: 'on-floor',
				wallRole,
				relationReason: '导演多场景工作台自动生成的房间壳体占位体',
				inferred: true,
				position: { x: g.x, y: g.y, z: g.z },
				size,
				rotation: { yaw: g.yaw, pitch: 0, roll: 0 },
				scale: { x: 1, y: 1, z: 1 },
				sourceImageIndex: 1,
				isKeyElement: true,
				keyElementType,
				fixedInRoom: true,
				semanticRole: 'structure-shell',
				mountType,
				relationTags: ['key-element', 'structural-shell', 'director-room-shell'],
				shouldTouchGround,
				groundReason: '房间壳体结构',
				roomId,
				roomLabel: label,
				sourceSceneIndex: room.sourceSceneIndex,
				isRoomShell: true
			})
		}

		// 地面（导演模式不生成天花板）
		pushShell(
			'shell-floor',
			'地面',
			'地面',
			'floor',
			'',
			0,
			-0.05,
			0,
			{ width: w, height: 0.1, depth: d },
			'floor',
			true
		)

		// 沿 X 方向的墙（front/back）
		const buildWallAlongX = (wallRole: 'front' | 'back', zLocal: number) => {
			const gaps = room.gapsByWall[wallRole]
				.flatMap((g) => [g.center - g.width / 2, g.center + g.width / 2])
				.sort((a, b) => a - b)
			const bounds = [-w / 2, ...gaps, w / 2]
			let seg = 0
			for (let i = 0; i + 1 < bounds.length; i += 2) {
				const start = bounds[i]
				const end = bounds[i + 1]
				const segLen = end - start
				if (segLen < 0.15) continue
				seg += 1
				pushShell(
					`shell-wall-${wallRole}-${seg}`,
					`${label}墙`,
					'墙体',
					'wall',
					wallRole,
					(start + end) / 2,
					0,
					zLocal,
					{ width: segLen, height: h, depth: t },
					'wall',
					true
				)
			}
		}
		// 沿 Z 方向的墙（left/right）
		const buildWallAlongZ = (wallRole: 'left' | 'right', xLocal: number) => {
			const gaps = room.gapsByWall[wallRole]
				.flatMap((g) => [g.center - g.width / 2, g.center + g.width / 2])
				.sort((a, b) => a - b)
			const bounds = [-d / 2, ...gaps, d / 2]
			let seg = 0
			for (let i = 0; i + 1 < bounds.length; i += 2) {
				const start = bounds[i]
				const end = bounds[i + 1]
				const segLen = end - start
				if (segLen < 0.15) continue
				seg += 1
				pushShell(
					`shell-wall-${wallRole}-${seg}`,
					`${label}墙`,
					'墙体',
					'wall',
					wallRole,
					xLocal,
					0,
					(start + end) / 2,
					{ width: t, height: h, depth: segLen },
					'wall',
					true
				)
			}
		}

		buildWallAlongX('back', -d / 2)
		buildWallAlongX('front', d / 2)
		buildWallAlongZ('left', -w / 2)
		buildWallAlongZ('right', w / 2)
	})

	return items
}

/**
 * 把多房间 JSON 顶层 objects（已是全局坐标）补齐房间分组字段
 */
export const annotateDirectorObjects = (parsed: unknown): WorkflowSceneLayoutItem[] => {
	const obj = asDict(parsed)
	const rawObjects = Array.isArray(obj.objects) ? obj.objects : []
	const rooms = (Array.isArray(obj.rooms) ? obj.rooms : []) as WorkflowDirectorRoom[]
	const roomIndexById = new Map<string, number>()
	rooms.forEach((r, i) => roomIndexById.set(String(r.roomId), i))
	return rawObjects.map((raw, i) => {
		const o = asDict(raw)
		const roomId = String(o.roomId || '').trim()
		const roomIndex = roomIndexById.has(roomId) ? (roomIndexById.get(roomId) as number) : i
		const room = rooms[roomIndex]
		const pos = asDict(o.position)
		const size = asDict(o.size)
		const rot = asDict(o.rotation)
		return {
			id: String(o.id || `obj-${i + 1}`),
			name: String(o.name || ''),
			category: String(o.category || ''),
			color: String(o.color || '') || roomColor(roomIndex),
			material: String(o.material || ''),
			description: String(o.description || ''),
			sameTypeGroupId: roomId ? `room:${roomId}` : '',
			sameTypeGroupLabel: room?.label || '',
			parentId: String(o.parentId || ''),
			placement: String(o.placement || ''),
			wallRole: normWallRole(o.wallRole),
			relationReason: String(o.relationReason || ''),
			inferred: Boolean(o.inferred),
			position: { x: toNum(pos.x, i * 5), y: toNum(pos.y, 0), z: toNum(pos.z, 0) },
			size: {
				width: Math.max(0.05, toNum(size.width, 1)),
				height: Math.max(0.05, toNum(size.height, 1)),
				depth: Math.max(0.05, toNum(size.depth, 1))
			},
			rotation: { yaw: toNum(rot.yaw, 0), pitch: toNum(rot.pitch, 0), roll: toNum(rot.roll, 0) },
			scale: { x: 1, y: 1, z: 1 },
			sourceImageIndex: Math.max(1, Math.floor(toNum(o.sourceImageIndex, 1))),
			isKeyElement: Boolean(o.isKeyElement),
			keyElementType: String(o.keyElementType || '').toLowerCase(),
			semanticRole: String(o.semanticRole || '').toLowerCase(),
			mountType: String(o.mountType || '').toLowerCase(),
			shouldTouchGround: o.shouldTouchGround !== false,
			groundReason: String(o.groundReason || ''),
			roomId: roomId || `room-${roomIndex + 1}`,
			roomLabel: room?.label || '',
			sourceSceneIndex: Math.max(1, Math.floor(toNum(o.sourceSceneIndex, roomIndex + 1))),
			isRoomShell: false
		} as WorkflowSceneLayoutItem
	})
}
