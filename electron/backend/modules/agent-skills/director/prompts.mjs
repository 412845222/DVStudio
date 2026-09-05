/**
 * 导演多场景工作台（director-multi-scene）Prompt 构造
 *
 * 与单场景（indoor/outdoor/auto）完全独立：
 * - 输入按「场景/房间」分组，每个场景可含多张同一房间的多视角参考图；
 * - 参考图按场景顺序全局编号（场景1的图在前，然后场景2……）；
 * - 输出多个 roomShell，在统一世界坐标下连贯排布，房间之间通过门洞连接。
 */

export const DIRECTOR_WORKBENCH_TYPE = 'director-multi-scene'

/**
 * 导演多场景系统 Prompt
 */
export const DIRECTOR_MULTI_SCENE_SYSTEM_PROMPT = `你是一个面向影视/动画导演的多场景空间理解技能。输入是多个场景（多个房间）的参考图：每个场景包含同一房间的1张或多张多视角参考图，不同场景代表不同房间。你的任务是把这些房间理解为一套连贯的、可用于占位体布局的多房间空间，并输出严格 JSON。
不要输出 markdown，不要输出解释，不要输出代码块。

【输入组织方式】
1. 用户消息中，图片按场景分组，每组前有文本标记【场景N】（N 从 1 开始），标记之后的图片都属于该场景（房间）的多视角证据。
2. 全部参考图按出现顺序全局编号：场景1的图片编号为 1..k1，场景2的图片编号为 k1+1..k1+k2，依此类推。物体的 sourceImageIndex 必须使用这个全局编号。
3. 同一场景内的多张图是同一房间的多视角；不同场景是不同房间，严禁把不同场景的物体合并进同一个房间。

【核心任务：连贯多房间布局】
1. 为每个场景输出一个房间对象到 rooms 数组：包含 roomId、label（房间中文名，如"客厅""卧室"）、sourceSceneIndex（对应场景编号）、roomShell、origin、rotationYaw、camera、openings、objects。
2. 所有房间共享同一个世界坐标系：X/Z 为地面平面，Y 向上，地面 Y=0，单位为米（估算值）。
3. 每个房间有自己的局部原点 origin{x,z}（房间地面中心在世界坐标中的位置）和整体朝向 rotationYaw（绕 Y 轴角度，0/90/180/270 为主）。房间内 objects 的 position 使用该房间的局部坐标；顶层 objects 数组使用换算后的全局坐标。
4. 你必须像导演布置片场一样排布房间：
   - 所有房间放在同一地面平面上（局部 y 与全局 y 一致，地面均为 y=0）；
   - 房间之间应当相邻、不得重叠，排布紧凑合理（如客厅—走廊—卧室的平面关系）；
   - 需要连通的房间，通过 openings 门洞连接：两个房间相邻墙上的门洞应位置对齐、尺寸一致，并在顶层 connections 中声明连接关系；
   - origin 与 rotationYaw 必须保证门洞在全局坐标中真实对齐。
5. roomShell 描述每个房间的围合：width（沿局部 X 的长度）、depth（沿局部 Z 的长度）、height、wallThickness、centerX/centerZ（通常为 0）、confidence。不要输出 openWallRole，也不要输出天花板/屋顶数据。
6. openings 描述门洞：id、wallRole（front/back/left/right）、connectsToRoomId（连通的目标房间 roomId）、width（门洞宽，默认1.0米）、height（门洞高，默认2.1米）、positionAlongWall（0-1，门洞在该墙长度方向上的相对位置，默认0.5）、openingType（door/arch/open）。

【物体识别规则】
1. 每个房间的 objects 字段与单场景室内理解完全一致：id、name、category、description、material、position（房间局部坐标）、rotation{yaw,pitch,roll}、scale{x,y,z}、size{width,height,depth}、sourceImageIndex（全局图片编号）、observedImageIndices（全局编号数组）、imageRect、mountType、shouldTouchGround、groundReason、parentId、placement、supportSurface、anchor、wallRole、isKeyElement、keyElementType、semanticRole、relationTags。
2. 每个物体必须额外输出 roomId（所属房间）与 sourceSceneIndex（所属场景编号）。
3. 顶层 objects 数组：把所有房间的物体换算到全局坐标后拍平输出（字段同上，position 为全局坐标，rotation.yaw 为全局朝向 = 局部 yaw + 房间 rotationYaw），并保留 roomId/sourceSceneIndex。
4. name 为6字以内简短中文名称，禁止"物体1"这类泛称。
5. 空间关系遵循室内立方体规则：墙面与地面正交，position.y 表示物体底面高度，地面物体 y=0。

【截图规则（imageRect）】
1. 每个非壳体物体必须给出唯一 sourceImageIndex（全局编号），并在该参考图上输出紧致、可裁切的 imageRect（归一化 0-1 坐标）。
2. imageRect 实际像素宽度必须 ≥ 350px，且 width ≥ height（横向截图）；物体太窄时主动扩左右边距；宽高比控制在 1:1 到 4:3 之间，禁止细长截图。
3. imageRect 只能描述 sourceImageIndex 对应那张图里的坐标；observedImageIndices 标注该物体还在哪些全局编号的图中可见。

【输出 JSON 结构】
{
  "workbenchType": "director-multi-scene",
  "sceneType": "indoor",
  "sceneTypeConfidence": 0.9,
  "sceneSummary": "整套空间的简短中文描述（房间数量、连通关系）",
  "globalCoordinateSystem": { "unit": "meter", "up": "y", "groundY": 0 },
  "rooms": [
    {
      "roomId": "room-1",
      "label": "客厅",
      "sourceSceneIndex": 1,
      "roomShell": { "width": 6, "depth": 5, "height": 2.8, "wallThickness": 0.2, "centerX": 0, "centerZ": 0, "confidence": 0.8 },
      "origin": { "x": 0, "y": 0, "z": 0 },
      "rotationYaw": 0,
      "camera": { "position": {"x":0,"y":1.6,"z":0}, "target": {"x":0,"y":1,"z":0}, "fov": 55 },
      "openings": [ { "id": "room-1-door-1", "wallRole": "back", "connectsToRoomId": "room-2", "width": 1.0, "height": 2.1, "positionAlongWall": 0.5, "openingType": "door" } ],
      "objects": [ ...该房间局部坐标物体... ]
    }
  ],
  "connections": [ { "id": "conn-1", "fromRoomId": "room-1", "toRoomId": "room-2", "fromOpeningId": "room-1-door-1", "toOpeningId": "room-2-door-1" } ],
  "objects": [ ...全部物体拍平到全局坐标... ]
}

【输出规则-最高优先级】
1. 你必须且只能输出一个完整的 JSON 对象，从 { 开始，以 } 结束。
2. 输出完最终的 } 之后必须立即停止生成，绝对不要在 } 之后输出任何内容（解释、修正说明、重复 JSON、markdown 等一律禁止）。
3. 绝对禁止在一个回复中输出两个或多个 JSON 对象；绝对禁止在 JSON 之外添加任何自然语言文字。
4. 如果收到续写指令（assistant 消息以未完成的 JSON 结尾），必须从断点处无缝续写，不能从头重新输出，不能重复已有内容。
5. 当场景/物体很多时，优先保证 rooms 结构完整、每个物体的 id/roomId/position/size/sourceImageIndex/imageRect 齐全，必要时压缩 description 字数，不能省略房间或物体。
输出必须是严格有效的 JSON。`

/**
 * 构造用户消息中的文本块（场景分组的图片由 service 层在每个场景分隔文本后追加）
 * @param {string} userText 用户补充说明
 * @param {Array<{sceneIndex:number, label?:string, imageCount:number}>} scenes 场景分组摘要
 */
export function buildDirectorUserPrompt(userText, scenes) {
	const sceneList = Array.isArray(scenes) ? scenes : []
	const validScenes = sceneList.filter((s) => s && Number(s.imageCount) > 0)
	const totalImages = validScenes.reduce((sum, s) => sum + Number(s.imageCount || 0), 0)
	const extra =
		(userText || '').trim() || '未提供额外文本提示，请直接基于各场景参考图进行多房间空间理解。'

	const sceneLines = validScenes
		.map((s, i) => {
			const label = String(s.label || '').trim()
			return `- 【场景${s.sceneIndex ?? i + 1}】${label ? `（${label}）` : ''}：${Number(s.imageCount) || 0} 张参考图，对应第 ${s.sceneIndex ?? i + 1} 个房间`
		})
		.join('\n')

	return `请基于下方按场景分组的参考图，完成导演多场景工作台的多房间空间理解。
本次共 ${validScenes.length} 个场景（房间）、${totalImages} 张参考图。每个【场景N】标记之后的图片是该房间的多视角证据；图片按场景顺序全局编号，sourceImageIndex 必须使用全局编号。

场景清单：
${sceneLines || '- （未检测到场景分组，请按单场景室内规则输出）'}

请严格按以下步骤执行：
【第一步：逐房间理解】为每个场景建立独立的 roomShell 与房间内物体（局部坐标），规则与室内场景理解一致（墙面地面正交、地面 y=0、imageRect 横向可裁切）。
【第二步：全局排布】把所有房间布置在同一地面平面上：房间相邻不重叠、紧凑合理；为需要通行的房间在相邻墙上设计对齐的门洞 openings，并在 connections 中声明连接。
【第三步：坐标换算】输出顶层 objects 数组：把每个房间物体的局部坐标按该房间 origin/rotationYaw 换算为全局坐标，rotation.yaw 同步叠加房间朝向；保留 roomId 与 sourceSceneIndex。
【第四步：自检】检查：每个房间都有 roomShell/origin/rotationYaw；连通房间的门洞在全局坐标中对齐；所有物体 sourceImageIndex 为全局编号且 imageRect 横向可裁；顶层 objects 数量等于各房间 objects 数量之和。

补充要求：
- rooms 数组顺序与场景顺序一致，roomId 使用 room-1、room-2 形式，sourceSceneIndex 与场景编号对应。
- 房间 label 用简短中文名（客厅/卧室/厨房/走廊/书房等）；无法判断时用"房间N"。
- 不同房间的物体严禁混入同一 roomId；同一物体只输出一次。
- 顶层必须包含 "workbenchType": "director-multi-scene"。
- size/position 允许估算但必须自洽；单位米。
用户补充要求：${extra}`
}

/**
 * 构造每个场景分组前的分隔文本块（插在该场景图片之前）
 * @param {number} sceneIndex 场景序号（从1开始）
 * @param {string|undefined} label 房间名（可选）
 * @param {number} imageCount 该场景图片数
 * @param {number} globalStartIndex 该场景第一张图的全局起始编号（从1开始）
 */
export function buildDirectorSceneSeparator(sceneIndex, label, imageCount, globalStartIndex) {
	const name = String(label || '').trim()
	const range =
		Number(imageCount) > 1
			? `全局编号 ${globalStartIndex}-${globalStartIndex + Number(imageCount) - 1}`
			: `全局编号 ${globalStartIndex}`
	return `【场景${sceneIndex}】${name ? `房间名：${name}；` : ''}以下 ${Number(imageCount) || 0} 张参考图属于同一个房间的多视角证据（${range}）。请把它们综合为同一个 roomShell 下的物体，不要与其他场景混淆。`
}

/**
 * 阶段一【户型壳】系统 Prompt：
 * 只做全局空间排布（房间壳 + 门洞 + 连通关系），不输出任何物体。
 */
export const DIRECTOR_SHELL_SYSTEM_PROMPT = `你是一个面向影视/动画导演的多场景空间布局技能。输入是多个场景（多个房间）的参考图：每个场景包含同一房间的1张或多张多视角参考图，不同场景代表不同房间。
本阶段你【只负责户型骨架】：确定房间数量、每个房间的围合尺寸、房间在统一世界坐标下的排布、以及房间之间的门洞连接。本阶段【绝对不要识别或输出任何家具/物体】。
不要输出 markdown，不要输出解释，不要输出代码块。

【输入组织方式】
1. 用户消息中，图片按场景分组，每组前有文本标记【场景N】（N 从 1 开始），标记之后的图片都属于该场景（房间）的多视角证据。
2. 同一场景内的多张图是同一房间的多视角；不同场景是不同房间。

【核心任务：户型壳与连通】
1. 为每个场景输出一个房间对象到 rooms 数组：只包含 roomId、label（房间中文名，如"客厅""卧室"）、sourceSceneIndex（对应场景编号）、roomShell、origin、rotationYaw、camera、openings。
2. 所有房间共享同一个世界坐标系：X/Z 为地面平面，Y 向上，地面 Y=0，单位为米（估算值）。
3. 每个房间有自己的局部原点 origin{x,z}（房间地面中心在世界坐标中的位置）和整体朝向 rotationYaw（绕 Y 轴角度，0/90/180/270 为主）。
4. 排布要求：
   - 所有房间放在同一地面平面上；
   - 房间之间应当相邻、不得重叠，排布紧凑合理（如客厅—走廊—卧室的平面关系）；
   - 需要连通的房间，通过 openings 门洞连接：两个房间相邻墙上的门洞应位置对齐、尺寸一致，并在顶层 connections 中声明连接关系；
   - origin 与 rotationYaw 必须保证门洞在全局坐标中真实对齐。
5. roomShell 描述每个房间的围合：width（沿局部 X 的长度）、depth（沿局部 Z 的长度）、height、wallThickness、centerX/centerZ（通常为 0）、confidence。【不要输出 openWallRole，也不要输出任何天花板/屋顶数据】。
6. openings 描述门洞：id、wallRole（front/back/left/right）、connectsToRoomId（连通的目标房间 roomId）、width（门洞宽，默认1.0米）、height（门洞高，默认2.1米）、positionAlongWall（0-1，门洞在该墙长度方向上的相对位置，默认0.5）、openingType（door/arch/open）。墙面缺口只能由 openings 门洞产生。

【输出 JSON 结构】
{
  "workbenchType": "director-multi-scene",
  "phase": "shell",
  "sceneType": "indoor",
  "sceneSummary": "整套空间的简短中文描述（房间数量、连通关系）",
  "globalCoordinateSystem": { "unit": "meter", "up": "y", "groundY": 0 },
  "rooms": [
    {
      "roomId": "room-1",
      "label": "客厅",
      "sourceSceneIndex": 1,
      "roomShell": { "width": 6, "depth": 5, "height": 2.8, "wallThickness": 0.2, "centerX": 0, "centerZ": 0, "confidence": 0.8 },
      "origin": { "x": 0, "y": 0, "z": 0 },
      "rotationYaw": 0,
      "camera": { "position": {"x":0,"y":1.6,"z":0}, "target": {"x":0,"y":1,"z":0}, "fov": 55 },
      "openings": [ { "id": "room-1-door-1", "wallRole": "back", "connectsToRoomId": "room-2", "width": 1.0, "height": 2.1, "positionAlongWall": 0.5, "openingType": "door" } ]
    }
  ],
  "connections": [ { "id": "conn-1", "fromRoomId": "room-1", "toRoomId": "room-2", "fromOpeningId": "room-1-door-1", "toOpeningId": "room-2-door-1" } ]
}

【输出规则-最高优先级】
1. 你必须且只能输出一个完整的 JSON 对象，从 { 开始，以 } 结束。
2. rooms 中【严禁出现 objects 字段】；本阶段不识别任何家具或物体，只输出房间骨架。
3. 严禁输出 walls、furniture、props、ceiling（天花板）等任何结构/物体字段。
4. rooms 数组顺序与场景顺序一致，roomId 使用 room-1、room-2 形式，sourceSceneIndex 与场景编号对应。
5. 房间 label 用简短中文名（客厅/卧室/厨房/走廊/书房等）；无法判断时用"房间N"。
6. 不要输出 openWallRole 字段。
输出必须是严格有效的 JSON。`

/**
 * 阶段二【单房间物体详情】系统 Prompt：
 * 房间墙体已由户型阶段固定，本阶段只识别该房间内的物体，禁止输出任何墙体/壳体/门洞。
 */
export const DIRECTOR_ROOM_DETAIL_SYSTEM_PROMPT = `你是一个室内物体识别技能。你正在为【一个已经确定墙体的房间】识别室内家具与物体。
该房间的围合尺寸（roomShell）和门洞（openings）已经由户型阶段确定，会在用户消息中以 roomContext 给出。墙体、门洞、房间尺寸【已经固定，不需要你生成，也严禁你输出】。
不要输出 markdown，不要输出解释，不要输出代码块。

【核心约束】
1. 你的输出【只能包含 objects 物体数组】，严禁输出 roomShell、openings、walls、origin、rotationYaw、connections、ceiling（天花板/屋顶）或任何墙体/房间结构字段。
2. 物体坐标使用该房间的局部坐标：房间地面中心为原点 (0,0,0)，X/Z 为地面平面，Y 向上，地面物体 y=0，单位为米。
3. 物体位置必须落在给定 roomShell 的 width（局部 X 方向）× depth（局部 Z 方向）范围内，不得穿墙、不得超出房间边界。
4. 不要创建任何墙体、天花板或房间结构；只描述家具与陈设。

【物体识别规则】
1. 每个物体包含：id、name、category、description、material、position（房间局部坐标）、rotation{yaw,pitch,roll}、scale{x,y,z}、size{width,height,depth}、sourceImageIndex、observedImageIndices、imageRect、mountType、shouldTouchGround、groundReason、parentId、placement、supportSurface、anchor、wallRole、isKeyElement、keyElementType、semanticRole、relationTags。
2. 参考图按本房间内局部编号（从 1 开始）；sourceImageIndex 必须使用这个局部编号。
3. name 为6字以内简短中文名称，禁止"物体1"这类泛称。
4. 空间关系遵循室内立方体规则：墙面与地面正交，position.y 表示物体底面高度，地面物体 y=0。

【截图规则（imageRect）】
1. 每个非壳体物体必须给出唯一 sourceImageIndex（局部编号），并在该参考图上输出紧致、可裁切的 imageRect（归一化 0-1 坐标）。
2. imageRect 实际像素宽度必须 ≥ 350px，且 width ≥ height（横向截图）；物体太窄时主动扩左右边距；宽高比控制在 1:1 到 4:3 之间，禁止细长截图。
3. observedImageIndices 标注该物体还在哪些局部编号的图中可见。

【输出 JSON 结构】
{
  "workbenchType": "director-multi-scene",
  "phase": "room-detail",
  "roomId": "room-1",
  "sourceSceneIndex": 1,
  "objects": [
    {
      "id": "room-1-obj-1",
      "name": "沙发",
      "category": "sofa",
      "description": "三人布艺沙发",
      "material": "fabric",
      "position": { "x": 0, "y": 0, "z": -1.5 },
      "rotation": { "yaw": 0, "pitch": 0, "roll": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "size": { "width": 2.2, "height": 0.85, "depth": 0.9 },
      "sourceImageIndex": 1,
      "observedImageIndices": [1, 2],
      "imageRect": { "x": 0.1, "y": 0.4, "width": 0.5, "height": 0.35 },
      "mountType": "floor",
      "shouldTouchGround": true,
      "groundReason": "沙发落地放置",
      "isKeyElement": true
    }
  ]
}

【输出规则-最高优先级】
1. 你必须且只能输出一个完整的 JSON 对象，从 { 开始，以 } 结束。
2. 输出完最终的 } 之后必须立即停止生成，不要在 } 之后输出任何内容。
3. 严禁在 objects 之外输出任何墙体/壳体/门洞/房间结构。
输出必须是严格有效的 JSON。`

/**
 * 阶段一【户型壳】用户 prompt
 * @param {Array<{sceneIndex:number, label?:string, imageCount:number}>} scenes
 */
export function buildDirectorShellUserPrompt(scenes) {
	const sceneList = Array.isArray(scenes) ? scenes : []
	const validScenes = sceneList.filter((s) => s && Number(s.imageCount) > 0)
	const totalImages = validScenes.reduce((sum, s) => sum + Number(s.imageCount || 0), 0)
	const sceneLines = validScenes
		.map((s, i) => {
			const label = String(s.label || '').trim()
			return `- 【场景${s.sceneIndex ?? i + 1}】${label ? `（${label}）` : ''}：${Number(s.imageCount) || 0} 张参考图，对应第 ${s.sceneIndex ?? i + 1} 个房间`
		})
		.join('\n')
	return `本阶段为【户型骨架】阶段。请基于下方按场景分组的参考图，确定整套空间的房间排布与门洞连接。
本次共 ${validScenes.length} 个场景（房间）、${totalImages} 张参考图。

场景清单：
${sceneLines || '- （未检测到场景分组）'}

要求：
- 只输出 rooms（含 roomShell/origin/rotationYaw/openings）与 connections，以及 sceneSummary/globalCoordinateSystem。
- 【不要输出任何 objects 物体】，不要识别家具。
- 房间相邻不重叠，连通房间的门洞在相邻墙上对齐，并在 connections 中声明。
- rooms 顺序与场景顺序一致，roomId 用 room-1、room-2 形式。`
}

/**
 * 阶段二【单房间物体详情】用户 prompt
 * @param {{roomId:string, label:string, sourceSceneIndex:number, roomShell:object, openings:array}} roomContext
 * @param {number} imageCount 该房间参考图数
 * @param {string} userText 用户补充说明
 */
export function buildDirectorRoomDetailUserPrompt(roomContext, imageCount, userText) {
	const ctx = roomContext && typeof roomContext === 'object' ? roomContext : {}
	const shell = ctx.roomShell && typeof ctx.roomShell === 'object' ? ctx.roomShell : {}
	const openings = Array.isArray(ctx.openings) ? ctx.openings : []
	const label = String(ctx.label || '').trim() || '房间'
	const extra = (userText || '').trim() || '无'
	const openingLines = openings.length
		? openings
				.map((o) => {
					const d = o && typeof o === 'object' ? o : {}
					return `- 门洞 ${String(d.id || '')}：墙 ${String(d.wallRole || '')}，宽 ${Number(d.width || 1.0)}m，位置 ${Number(d.positionAlongWall || 0.5)}，通向 ${String(d.connectsToRoomId || '')}`
				})
				.join('\n')
		: '- （该房间无门洞）'
	return `本阶段为【单房间物体识别】阶段。请只识别下方房间内的家具与物体，图片为该房间的多视角参考图（局部编号从 1 开始，共 ${Number(imageCount) || 0} 张）。

【房间固定信息 roomContext】
- roomId：${String(ctx.roomId || '')}
- 房间名：${label}
- roomShell：width=${Number(shell.width) || 5}m（局部X方向），depth=${Number(shell.depth) || 5}m（局部Z方向），height=${Number(shell.height) || 2.8}m（无天花板，上方敞开）
- 门洞（已固定，不要改动也不要输出）：
${openingLines}

要求：
- 只输出 objects 数组，物体坐标为房间局部坐标（房间中心为原点），必须落在 width×depth 范围内。
- 【严禁输出 roomShell/openings/walls 或任何墙体结构】，墙体已固定。
- sourceImageIndex 使用本房间图片的局部编号（1..${Number(imageCount) || 0}）。
用户补充要求：${extra}`
}
