/**
 * 导演多场景工作台 —— 结果归一化与多房间占位体拍平
 *
 * 职责：
 * 1. 识别模型输出的多房间 JSON（workbenchType === 'director-multi-scene' 或存在 rooms 数组）；
 * 2. 把每个房间的局部坐标物体换算到全局坐标（origin 平移 + rotationYaw 旋转）；
 * 3. 依据 roomShell/openings/openWallRole 合成房间壳体占位体（地面/天花/带门洞的墙），
 *    使下游场景布局预览无需改造即可渲染多个连贯房间；
 * 4. 输出与 sceneLayoutRun 兼容的 layoutItems（额外携带 roomId/roomLabel/sourceSceneIndex）。
 */

import { DIRECTOR_WORKBENCH_TYPE } from './prompts.mjs'

export const DIRECTOR_MAX_SCENES = 6
export const DIRECTOR_MAX_IMAGES_PER_SCENE = 4

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

const toNum = (v, d = 0) => {
	const n = Number(v)
	return Number.isFinite(n) ? n : d
}

const asDict = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})

const normWallRole = (value) => {
	const raw = String(value || '')
		.trim()
		.toLowerCase()
	if (raw.startsWith('front') || raw.includes('前墙')) return 'front'
	if (raw.startsWith('back') || raw.includes('后墙')) return 'back'
	if (raw.startsWith('left') || raw.includes('左墙')) return 'left'
	if (raw.startsWith('right') || raw.includes('右墙')) return 'right'
	return raw
}

/**
 * 判定是否为导演多场景工作台 JSON
 */
export function isDirectorWorkbenchJson(parsed) {
	const obj = asDict(parsed)
	if (String(obj.workbenchType || '').trim() === DIRECTOR_WORKBENCH_TYPE) return true
	return Array.isArray(obj.rooms) && obj.rooms.length > 0
}

/**
 * 房间局部坐标 → 全局坐标（绕 Y 轴旋转后平移）
 * 与 three.js Y 轴旋转约定一致：
 *   gx = ox + lx*cosθ + lz*sinθ
 *   gz = oz - lx*sinθ + lz*cosθ
 */
export function applyRoomTransform(localX, localZ, origin, yawDeg) {
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

/**
 * 全局 yaw = 局部 yaw + 房间 yaw（归一化到 -180..180）
 */
export function applyRoomYaw(localYaw, roomYaw) {
	let yaw = toNum(localYaw, 0) + toNum(roomYaw, 0)
	while (yaw > 180) yaw -= 360
	while (yaw < -180) yaw += 360
	return yaw
}

function roomColor(index) {
	return ROOM_COLORS[index % ROOM_COLORS.length]
}

/**
 * 归一化单个房间（不做坐标换算，仅补全/清洗字段）
 */
function normalizeRoom(rawRoom, index) {
	const room = asDict(rawRoom)
	const roomId = String(room.roomId || `room-${index + 1}`).trim() || `room-${index + 1}`
	const shell = asDict(room.roomShell)
	const origin = asDict(room.origin)
	const openings = (Array.isArray(room.openings) ? room.openings : [])
		.map((o) => {
			const d = asDict(o)
			return {
				id: String(d.id || `${roomId}-opening`).trim(),
				wallRole: normWallRole(d.wallRole),
				connectsToRoomId: String(d.connectsToRoomId || '').trim(),
				width: Math.max(0.6, toNum(d.width, 1.0)),
				height: Math.max(1.8, toNum(d.height, 2.1)),
				positionAlongWall: Math.min(0.95, Math.max(0.05, toNum(d.positionAlongWall, 0.5))),
				openingType: String(d.openingType || 'door').trim() || 'door'
			}
		})
		.filter((o) => o.wallRole)
	return {
		roomId,
		label: String(room.label || `房间${index + 1}`).trim() || `房间${index + 1}`,
		sourceSceneIndex: Math.max(1, Math.floor(toNum(room.sourceSceneIndex, index + 1))),
		roomShell: {
			width: Math.max(1, toNum(shell.width, 5)),
			depth: Math.max(1, toNum(shell.depth, 5)),
			height: Math.max(2, toNum(shell.height, 2.8)),
			wallThickness: Math.max(0.05, toNum(shell.wallThickness, 0.2)),
			centerX: toNum(shell.centerX, 0),
			centerZ: toNum(shell.centerZ, 0),
			openWallRole: normWallRole(shell.openWallRole),
			confidence: toNum(shell.confidence, 0.7)
		},
		origin: { x: toNum(origin.x, 0), y: toNum(origin.y, 0), z: toNum(origin.z, 0) },
		rotationYaw: toNum(room.rotationYaw, 0),
		camera: asDict(room.camera),
		openings,
		objects: Array.isArray(room.objects) ? room.objects : []
	}
}

/**
 * 把一个本地坐标的盒体描述转换为全局坐标的 layoutItem
 */
function makeShellItem({
	roomId,
	roomLabel,
	color,
	id,
	name,
	category,
	keyElementType,
	wallRole,
	localPos,
	size,
	mountType,
	shouldTouchGround
}) {
	return {
		id: `${roomId}-${id}`,
		name,
		category,
		subCategory: '',
		color,
		material: 'placeholder-shell',
		description: `${roomLabel}${name}`,
		sameTypeGroupId: `room:${roomId}`,
		sameTypeGroupLabel: roomLabel,
		parentId: '',
		placement: 'on-floor',
		supportSurface: '',
		anchor: '',
		wallRole: wallRole || '',
		proximityGroupId: '',
		relationReason: '导演多场景工作台自动生成的房间壳体占位体',
		inferred: true,
		position: { x: localPos.x, y: localPos.y, z: localPos.z },
		size: { width: size.width, height: size.height, depth: size.depth },
		rotation: { yaw: 0, pitch: 0, roll: 0 },
		scale: { x: 1, y: 1, z: 1 },
		sourceImageIndex: 1,
		observedImageIndices: [],
		isKeyElement: true,
		keyElementType,
		fixedInRoom: true,
		semanticRole: 'structure-shell',
		mountType,
		relationTags: ['key-element', 'structural-shell', 'director-room-shell'],
		shouldTouchGround: shouldTouchGround !== false,
		groundReason: '房间壳体结构',
		imageRect: {},
		roomId,
		roomLabel,
		sourceSceneIndex: 0,
		isRoomShell: true
	}
}

/**
 * 依据房间壳体与门洞，合成该房间的全部占位体（本地坐标），再换算到全局坐标
 */
function buildRoomShellItems(room, color) {
	const { roomId, label, roomShell: shell, origin, rotationYaw, openings } = room
	const w = shell.width
	const d = shell.depth
	const h = shell.height
	const t = shell.wallThickness
	const items = []

	// 某面墙的门洞间隙集合：{center: 沿墙方向的本地坐标, width: 门洞宽}
	const gapsByWall = { front: [], back: [], left: [], right: [] }
	for (const op of openings) {
		if (!gapsByWall[op.wallRole]) continue
		// positionAlongWall: 0..1 沿墙长度方向
		const along =
			(op.positionAlongWall - 0.5) * (op.wallRole === 'front' || op.wallRole === 'back' ? w : d)
		gapsByWall[op.wallRole].push({ center: along, width: op.width })
	}
	// 导演模式不再生成镜头观察开口（openWallRole）：缺口只由真实门洞 openings 决定

	const toGlobal = (lx, ly, lz, yaw = 0) => {
		const g = applyRoomTransform(lx, lz, origin, rotationYaw)
		return { x: g.x, y: ly, z: g.z, yaw: applyRoomYaw(yaw, rotationYaw) }
	}

	const pushItem = (local, id, name, category, keyType, wallRole, size, mountType, touchGround) => {
		const g = toGlobal(local.x, local.y, local.z, local.yaw || 0)
		const item = makeShellItem({
			roomId,
			roomLabel: label,
			color,
			id,
			name,
			category,
			keyElementType: keyType,
			wallRole,
			localPos: { x: g.x, y: g.y, z: g.z },
			size,
			mountType,
			shouldTouchGround: touchGround
		})
		item.rotation = { yaw: g.yaw, pitch: 0, roll: 0 }
		items.push(item)
	}

	// 地面（薄板，顶面 y=0）；导演模式不生成天花板
	pushItem(
		{ x: 0, y: -0.05, z: 0 },
		'shell-floor',
		'地面',
		'地面',
		'floor',
		'',
		{ width: w, height: 0.1, depth: d },
		'floor',
		true
	)

	// 沿 X 方向的墙（front/back）：厚度沿 Z，长度沿 X；按门洞切分为若干段
	const buildWallAlongX = (wallRole, zLocal) => {
		const gaps = gapsByWall[wallRole]
			.flatMap((g) => [g.center - g.width / 2, g.center + g.width / 2])
			.sort((a, b) => a - b)
		const bounds = [-w / 2, ...gaps, w / 2]
		let segIndex = 0
		for (let i = 0; i + 1 < bounds.length; i += 2) {
			const start = bounds[i]
			const end = bounds[i + 1]
			const segLen = end - start
			if (segLen < 0.15) continue
			const centerX = (start + end) / 2
			segIndex += 1
			pushItem(
				{ x: centerX, y: 0, z: zLocal },
				`shell-wall-${wallRole}-${segIndex}`,
				`${label}墙`,
				'墙体',
				'wall',
				wallRole,
				{ width: segLen, height: h, depth: t },
				'wall',
				true
			)
		}
	}
	// 沿 Z 方向的墙（left/right）：厚度沿 X，长度沿 Z
	const buildWallAlongZ = (wallRole, xLocal) => {
		const gaps = gapsByWall[wallRole]
			.flatMap((g) => [g.center - g.width / 2, g.center + g.width / 2])
			.sort((a, b) => a - b)
		const bounds = [-d / 2, ...gaps, d / 2]
		let segIndex = 0
		for (let i = 0; i + 1 < bounds.length; i += 2) {
			const start = bounds[i]
			const end = bounds[i + 1]
			const segLen = end - start
			if (segLen < 0.15) continue
			const centerZ = (start + end) / 2
			segIndex += 1
			pushItem(
				{ x: xLocal, y: 0, z: centerZ },
				`shell-wall-${wallRole}-${segIndex}`,
				`${label}墙`,
				'墙体',
				'wall',
				wallRole,
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

	return items
}

/**
 * 把房间物体（局部坐标）换算为全局 layoutItem
 */
function transformRoomObject(rawObj, room, color, roomIndex) {
	const obj = asDict(rawObj)
	const pos = asDict(obj.position)
	const size = asDict(obj.size)
	const rot = asDict(obj.rotation)
	const scale = asDict(obj.scale)
	const global = applyRoomTransform(pos.x, pos.z, room.origin, room.rotationYaw)
	const globalYaw = applyRoomYaw(rot.yaw, room.rotationYaw)
	const id = String(obj.id || '').trim() || `${room.roomId}-obj-${roomIndex + 1}`
	return {
		id,
		name: String(obj.name || ''),
		category: String(obj.category || ''),
		subCategory: String(obj.subCategory || ''),
		color: String(obj.color || '') || color,
		material: String(obj.material || ''),
		description: String(obj.description || ''),
		sameTypeGroupId: `room:${room.roomId}`,
		sameTypeGroupLabel: room.label,
		parentId: String(obj.parentId || ''),
		placement: String(obj.placement || ''),
		supportSurface: String(obj.supportSurface || ''),
		anchor: String(obj.anchor || ''),
		wallRole: normWallRole(obj.wallRole),
		proximityGroupId: String(obj.proximityGroupId || ''),
		relationReason: String(obj.relationReason || ''),
		inferred: Boolean(obj.inferred),
		position: { x: global.x, y: toNum(pos.y, 0), z: global.z },
		size: {
			width: Math.max(0.05, toNum(size.width, 1)),
			height: Math.max(0.05, toNum(size.height, 1)),
			depth: Math.max(0.05, toNum(size.depth, 1))
		},
		rotation: {
			yaw: globalYaw,
			pitch: toNum(rot.pitch, 0),
			roll: toNum(rot.roll, 0)
		},
		scale: { x: toNum(scale.x, 1), y: toNum(scale.y, 1), z: toNum(scale.z, 1) },
		sourceImageIndex: Math.max(1, Math.floor(toNum(obj.sourceImageIndex, 1))),
		observedImageIndices: Array.isArray(obj.observedImageIndices)
			? [...new Set(obj.observedImageIndices.map((v) => Math.max(1, Math.floor(toNum(v, 1)))))]
			: [],
		isKeyElement: Boolean(obj.isKeyElement),
		keyElementType: String(obj.keyElementType || '').toLowerCase(),
		fixedInRoom: Boolean(obj.fixedInRoom),
		semanticRole: String(obj.semanticRole || '').toLowerCase(),
		mountType: String(obj.mountType || '').toLowerCase(),
		relationTags: Array.isArray(obj.relationTags)
			? obj.relationTags
					.map((v) =>
						String(v || '')
							.trim()
							.toLowerCase()
					)
					.filter(Boolean)
			: [],
		shouldTouchGround: obj.shouldTouchGround !== false,
		groundReason: String(obj.groundReason || ''),
		imageRect: asDict(obj.imageRect),
		roomId: room.roomId,
		roomLabel: room.label,
		sourceSceneIndex: room.sourceSceneIndex,
		isRoomShell: false
	}
}

/**
 * 把导演多场景 JSON 拍平为场景布局可消费的结果
 * @returns {{ok:boolean, layoutItems:Array, rooms:Array, connections:Array, workbenchType:string, camera:object|null, sceneSummary:string, message:string}}
 */
export function flattenDirectorWorkbench(parsed) {
	const root = asDict(parsed)
	const rawRooms = Array.isArray(root.rooms) ? root.rooms : []
	const rooms = rawRooms.map((r, i) => normalizeRoom(r, i)).slice(0, DIRECTOR_MAX_SCENES)

	const layoutItems = []
	rooms.forEach((room, index) => {
		const color = roomColor(index)
		// 房间内物体（局部→全局）
		for (const obj of room.objects) {
			layoutItems.push(transformRoomObject(obj, room, color, index))
		}
		// 房间壳体占位体
		layoutItems.push(...buildRoomShellItems(room, color))
	})

	// 若模型未提供 rooms[].objects 但提供了顶层 objects（已全局坐标），兜底纳入
	if (layoutItems.filter((it) => !it.isRoomShell).length === 0 && Array.isArray(root.objects)) {
		root.objects.forEach((obj, i) => {
			const o = asDict(obj)
			const roomId = String(o.roomId || '').trim()
			const roomIndex = Math.max(
				0,
				rooms.findIndex((r) => r.roomId === roomId)
			)
			const color = roomColor(roomIndex >= 0 ? roomIndex : i)
			const roomLabel = roomIndex >= 0 ? rooms[roomIndex].label : ''
			const pos = asDict(o.position)
			const size = asDict(o.size)
			layoutItems.push({
				id: String(o.id || `obj-${i + 1}`),
				name: String(o.name || ''),
				category: String(o.category || ''),
				subCategory: '',
				color: String(o.color || '') || color,
				material: String(o.material || ''),
				description: String(o.description || ''),
				sameTypeGroupId: roomId ? `room:${roomId}` : '',
				sameTypeGroupLabel: roomLabel,
				parentId: String(o.parentId || ''),
				placement: String(o.placement || ''),
				supportSurface: '',
				anchor: '',
				wallRole: normWallRole(o.wallRole),
				proximityGroupId: '',
				relationReason: '',
				inferred: false,
				position: { x: toNum(pos.x, i * 5), y: toNum(pos.y, 0), z: toNum(pos.z, 0) },
				size: {
					width: Math.max(0.05, toNum(size.width, 1)),
					height: Math.max(0.05, toNum(size.height, 1)),
					depth: Math.max(0.05, toNum(size.depth, 1))
				},
				rotation: { yaw: toNum(asDict(o.rotation).yaw, 0), pitch: 0, roll: 0 },
				scale: { x: 1, y: 1, z: 1 },
				sourceImageIndex: Math.max(1, Math.floor(toNum(o.sourceImageIndex, 1))),
				observedImageIndices: [],
				isKeyElement: Boolean(o.isKeyElement),
				keyElementType: String(o.keyElementType || '').toLowerCase(),
				fixedInRoom: false,
				semanticRole: String(o.semanticRole || '').toLowerCase(),
				mountType: String(o.mountType || '').toLowerCase(),
				relationTags: [],
				shouldTouchGround: o.shouldTouchGround !== false,
				groundReason: '',
				imageRect: asDict(o.imageRect),
				roomId: roomId || `room-${roomIndex + 1}`,
				roomLabel,
				sourceSceneIndex: Math.max(1, Math.floor(toNum(o.sourceSceneIndex, roomIndex + 1))),
				isRoomShell: false
			})
		})
	}

	const connections = (Array.isArray(root.connections) ? root.connections : [])
		.map((c) => {
			const d = asDict(c)
			return {
				id: String(d.id || '').trim(),
				fromRoomId: String(d.fromRoomId || '').trim(),
				toRoomId: String(d.toRoomId || '').trim(),
				fromOpeningId: String(d.fromOpeningId || '').trim(),
				toOpeningId: String(d.toOpeningId || '').trim()
			}
		})
		.filter((c) => c.fromRoomId && c.toRoomId)

	const camera = asDict(root.camera) || asDict(rooms[0]?.camera)

	return {
		ok: true,
		workbenchType: DIRECTOR_WORKBENCH_TYPE,
		layoutItems,
		rooms,
		connections,
		camera: Object.keys(camera).length ? camera : null,
		sceneSummary: String(root.sceneSummary || ''),
		message: `导演多场景工作台：已生成 ${rooms.length} 个房间、${layoutItems.filter((it) => !it.isRoomShell).length} 个物体占位体`
	}
}
