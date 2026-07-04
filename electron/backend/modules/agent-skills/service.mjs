import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { internalError, invalidParamsError, upstreamError } from '../../core/errors.mjs'
import { getHttpClient } from '../../core/http-client.mjs'
import logger from '../../core/logger.mjs'

function generateMsgId() {
	return `m-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

function wrapTextMsg(text) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/text',
			payload: { text: String(text || '') }
		}
	})
}

function wrapChatMsg(content) {
	const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/chatMessage',
			payload: { content: contentStr }
		}
	})
}

function wrapTaskStatusMsg(message, phase) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/taskStatus',
			payload: { phase: phase || 'streaming', message: String(message || '') }
		}
	})
}

function wrapReasoningMsg(text) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/reasoning',
			payload: { text: String(text || '') }
		}
	})
}

function wrapErrorMsg(code, message) {
	return JSON.stringify({
		type: 'msg',
		message: {
			schemaVersion: 1,
			id: generateMsgId(),
			createdAt: new Date().toISOString(),
			type: 'agentToUi/error',
			payload: { code: code || 'STREAM_ERROR', message: String(message || 'unknown error') }
		}
	})
}

function wrapStreamError(message) {
	return JSON.stringify({ type: 'error', error: { message: String(message || 'unknown error') } })
}

function wrapDone() {
	return JSON.stringify({ type: 'done' })
}

const ARK_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3'

export const SCENE_UNDERSTAND_MODEL_OPTIONS = [
	{ id: 'doubao-seed-evolving', label: '豆包 Seed 快速迭代版', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-1-pro-260628', label: '豆包 Seed 2.1 Pro', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-1-turbo-260628', label: '豆包 Seed 2.1 Turbo', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-0-pro-260215', label: '豆包 Seed 2.0 Pro', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-0-lite-260215', label: '豆包 Seed 2.0 Lite', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-0-mini-260215', label: '豆包 Seed 2.0 Mini', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-0-code-preview-260215', label: '豆包 Seed 2.0 Code Preview', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-1-6-vision-250815', label: '豆包 Seed 1.6 Vision', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-1-6-flash-250828', label: '豆包 Seed 1.6 Flash', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-1-6-lite-251015', label: '豆包 Seed 1.6 Lite', supportsVision: true, supportsStructuredOutput: false, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-1-8-251228', label: '豆包 Seed 1.8', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
]

export const DEFAULT_SCENE_UNDERSTAND_MODEL = 'doubao-seed-2-1-pro-260628'

export const SCENE_LIGHTING_MODEL_OPTIONS = [
	{ id: 'doubao-seed-evolving', label: '豆包 Seed 快速迭代版', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-1-pro-260628', label: '豆包 Seed 2.1 Pro', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-1-turbo-260628', label: '豆包 Seed 2.1 Turbo', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
	{ id: 'doubao-seed-2-0-pro-260215', label: '豆包 Seed 2.0 Pro', supportsVision: true, supportsStructuredOutput: true, recommended: true, vendor: '字节方舟' },
]

export const DEFAULT_SCENE_LIGHTING_MODEL = 'doubao-seed-2-1-pro-260628'

const SCENE_UNDERSTAND_SYSTEM_PROMPT = `你是一个面向室内设计与 Unreal 场景搭建的场景理解技能。你的任务是读取输入图像和补充文本，输出严格 JSON。
不要输出 markdown，不要输出解释，不要输出代码块。
所有参考图都属于同一室内空间的多视角证据。你必须先综合全部参考图，建立统一的 roomShell、主地面、墙面围合、屋顶高度与整体空间比例，再在这个统一结构里补全全部 objects。
如果后续请求以上一轮 assistant 已输出的 JSON 前缀结尾，这表示进入官方续写模式；你必须从当前 JSON 末尾无缝继续，不能重头再写，不能重复已输出前缀，不能改写前文语义。
输出应避免冗长描述；sceneSummary 保持简短，description 用短句，不要写长段自然语言。
当场景内容很多时，你必须优先完整保留对象数量、关键结构、关系字段与裁切框，必要时只压缩 description、relationReason、sameTypeReason 的字数，不能因为追求紧凑而省略本应输出的对象或结构。
优先把场景识别成室内设计场景来分析，先识别墙面、地面、桌面、台面等大结构，再识别墙面挂件、桌面摆件、地面零件。
空间理解必须遵循室内立方体关系：墙面与地面正交，墙面不得倾斜。
必须建立地面原点概念：以主地面对象作为世界基准面，其他对象坐标和透视关系都基于该原点推导。
必须输出 roomShell，用统一的 width/depth/height/centerX/centerZ/wallThickness 描述房间围合；哪怕部分墙面、地面、屋顶被镜头裁切，也要给出完整可围合的室内壳体。
必须为关键元素输出显式语义：墙面/地面/天花/屋顶/窗户/柱子/门洞等不可随意移动的硬装修元素，应写入 isKeyElement、keyElementType、fixedInRoom、semanticRole。
必须为对象输出挂载语义：例如 mountType 可取 floor、wall、embedded-wall、ceiling、support-top、free；relationTags 可包含 key-element、wall-attached、floor-supported、ceiling-attached、embedded、opening、structural-shell。
必须为每个对象输出 shouldTouchGround，用于判断该对象底部是否应贴地；并输出 groundReason，用极短短语说明原因。
需要区分前墙/后墙/左墙/右墙，墙体对象尽量填写 wallRole。
如果输入了多张参考图，它们按锚点顺序组成同一室内空间的多视角参考；应综合它们推断统一的三维室内结构，而不是把每张图当成独立场景。
对象需要尽量标记 sourceImageIndex，表示该对象主要来自第几张参考图；编号从 1 开始。
对象还应尽量输出 observedImageIndices，表示它在哪几张参考图中可被观察到或被多视角共同验证。
场景分解节点会直接依赖 sourceImageIndex 与 imageRect 做自动截图，因此每个非壳体对象都必须给出唯一 sourceImageIndex，并在该唯一参考图上输出紧致、可裁切的 imageRect。
禁止用 observedImageIndices 代替 sourceImageIndex；禁止给多个候选主图；必须只选一张最适合截图的参考图作为 sourceImageIndex。
禁止把 imageRect 默认写成整张图；只有当目标对象在该参考图中确实几乎占满整张图时，才允许接近全图。通常应输出包住对象可见轮廓的紧致矩形。
即使对象被遮挡、只露出一部分，也必须在 sourceImageIndex 对应的那张参考图上输出当前可见部分的准确 imageRect，便于后续节点直接截图。
【截图尺寸硬性要求】imageRect 对应的实际像素宽度必须 ≥ 350px。如果对象本身宽度不足，必须在对象周围适当扩大 imageRect 范围（优先左右扩边距），保证裁出的图片宽度达标。
【截图比例硬性要求】imageRect 的 width 必须 ≥ height（宽高比 ≥ 1:1），保持横向截图。竖向物体（如台灯、立式机箱、显示器）必须扩左右边距使其成为横向，禁止输出纵向截图。
【禁止细长截图】宽高比应控制在 1:1 到 4:3 之间，最大不超过 16:9，避免极端细长比例。
【边距规则】扩边时优先在左右两侧添加等距边距，上下边距为辅；边距内可包含少量背景，但主体对象必须居中且完整可见。
【输出前自检】输出 JSON 前，必须逐个检查每个非壳体对象的 imageRect：估算其实际像素宽度是否 ≥ 350px、width 是否 ≥ height，不符合要求的必须调整后再输出。
墙体尺寸语义必须固定：size.width 表示沿墙展开的长度，size.depth 表示墙体厚度。对于左墙/右墙，即使 rotation.yaw 为 90/270，也不要把 width/depth 反过来理解。
高度语义必须稳定：size.height 表示物体真实高度，position.y 表示物体底面高度。落地柜、窗下柜、工作台、桌子等底面可为 0，但它们的 height 必须与窗台、桌面、墙面挂件等邻近参照物自洽。
位置使用简化 3D 世界坐标，地面平面采用 x/z，竖直方向采用 y。
position.y 表示物体底面高度；地面对象 position.y 应尽量为 0。
对于墙面对象，rotation.pitch 与 rotation.roll 应为 0，仅允许 yaw。
objects 中每个元素都必须包含以下字段：id、name、category、description、material、position、rotation、scale、size、sourceImageIndex、imageRect。
- name：简短中文名称（6字以内，如"木质书桌"、"落地书柜"、"分格木窗"、"金属台灯"），禁止使用"物体1""对象2"这类泛称。
- category：物体类别标签，如"桌子""椅子""柜体""灯具""窗户""门""沙发""床""装饰""书架""植物""电器"等。
- description：一句话视觉描述（15-30字），概括物体的主要特征、颜色、材质、形态，例如"深色木质方形阅读桌，四条直腿，桌面摆放书籍"。
- material：主要材质描述。
同一对象只输出一次，不要因多视角重复生成多个副本；应通过 sourceImageIndex 与 observedImageIndices 表达视角来源。
【输出规则-最高优先级】
1. 你必须且只能输出一个完整的 JSON 对象，从 { 开始，以 } 结束。
2. 输出完最终的 } 之后必须立即停止生成，绝对不要在 } 之后输出任何内容（包括但不限于：解释文字、修正说明、"修正后版本"、重复的 JSON、总结、markdown 标记、对话回复等）。
3. 绝对禁止在一个回复中输出两个或多个 JSON 对象。
4. 绝对禁止在 JSON 之外添加任何自然语言文字。
5. 如果收到续写指令（assistant 消息以未完成的 JSON 结尾），必须从断点处无缝续写，绝对不能从头重新输出，绝对不能重复已有内容。
输出必须是严格有效的 JSON，不要有任何额外文字。`

function buildSceneUnderstandUserPrompt(userText, imageCount) {
	const extra = (userText || '').trim() || '未提供额外文本提示，请直接基于图像进行场景理解。'
	const multiViewText = imageCount > 1
		? `本次共输入 ${Math.max(1, imageCount)} 张参考图，它们共同描述同一室内空间的不同视角。请先综合全部参考图建立统一房屋结构，再补全全部内容。`
		: '本次仅输入 1 张参考图，请直接基于当前图像建立完整室内结构。'
	return `请基于输入图片完成室内/场景理解，识别主要物体并估算布局关系。优先识别墙面、桌面、柜体、地面这些大结构。
${multiViewText}
请先确定主地面并建立场景原点，再输出墙面与地面的正交关系。
请显式输出 roomShell，描述完整房间围合范围；后续布局节点会优先使用它来生成墙面、地面、屋顶。
请同时输出 keyElements 摘要，用于列出关键元素 id/type/role/fixed/mountType/priority/relationTags，让布局节点优先处理这些结构元素。
请优先根据第一张参考图识别 camera.openWallRole，让布局预览为镜头留出开口；其他参考图可以补充空间理解，但除非第一张图严重缺失证据，否则不要改写第一张图的开口方向，也不能导致屋顶开口。
如果图像只看到左/右/后墙的一部分，也要推断出完整围合空间中的连续地面和屋顶，不要让房间在远端或顶部出现缺口。
如果提供了多张参考图，请把它们视为同一室内空间的多视角输入，综合判断空间围合和物体关系；任意一张图中新增出现的物体也必须纳入统一 objects。
补充说明：
- roomShell 用于表达统一房间壳体；若已能判断房间围合，请尽量输出 width/depth/height/centerX/centerZ/wallThickness/hasFloor/hasCeiling/detectedWalls/confidence。
- keyElements 用于罗列关键元素，推荐至少包含 floor/wall/ceiling/window/column/door/opening 等固定构件。
- camera.openWallRole 表示为主观察镜头预留的开口墙面，应优先根据第一张参考图判断，通常为 front/left/right/back 之一；其余图片只用于校验，不应轻易推翻第一张图。
- 结构面只有真正的地面/墙体/天花本体；天花灯、壁挂屏、嵌入式书架、展示柜、窗户都应作为附着对象输出，不能代替 roomShell 的 floor/wall/ceiling。
- 对 objects 中每个元素，尽量补充 isKeyElement、keyElementType、fixedInRoom、semanticRole、mountType、relationTags、layoutPriority。
- 对每个 objects 元素，必须尽量补充 shouldTouchGround 与 groundReason，用于后续区分"贴墙且贴地"与"贴墙但离地/壁挂"。
- keyElementType 推荐使用：floor、wall、ceiling、roof、window、column、door、opening、builtin-fixture、fixed-installation。
- semanticRole 推荐使用：structure-shell、architectural-opening、architectural-fixed、built-in-fixture、wall-fixture、ceiling-fixture、floor-object、support-object、furniture、prop。
- mountType 推荐使用：floor、wall、embedded-wall、ceiling、support-top、free。
- relationTags 推荐使用：key-element、structural-shell、wall-attached、floor-supported、ceiling-attached、embedded、opening、fixed-installation。
- sourceImageIndex 表示对象主要来自第几张参考图，编号从 1 开始；若只有一张图，则统一填 1。
- observedImageIndices 表示该对象在哪几张图中能被看到或被多视角共同验证；若只在一张图里出现，也请输出单元素数组。
- 对每个非壳体 objects 元素，必须选择唯一一张最适合截图的参考图作为 sourceImageIndex；不要给多个主图，不要留空。
- imageRect 使用 sourceImageIndex 对应那张原图的归一化坐标，范围 0 到 1；必须是紧致包围框，而不是默认整图。
- 后端会根据 imageRect 与原图尺寸生成 imageRectPixels，因此 imageRect 必须尽量准确，便于后续裁切元素截图。
- 如果对象只在局部遮挡中可见，也必须输出当前可见区域的 imageRect；宁可给紧一点的局部框，也不要给整图。
- 【截图尺寸硬性要求】imageRect 裁出的图片宽度必须 ≥ 350px，且必须是横向（width ≥ height），禁止纵向细长截图。对象太窄时请主动扩左右边距保证宽度和比例。
- sourceImageIndex 与 imageRect 必须互相对应：imageRect 只能描述这一张唯一参考图里的坐标与尺寸，不能混用其他参考图的信息。
- size 和 position 允许估算，但必须自洽。
- rotation 使用 yaw/pitch/roll 角度制；scale 使用 x/y/z。
- 墙体必须垂直于地面：墙体对象的 pitch/roll 应为 0，yaw 建议接近 0/90/180/270。
- 墙体尺寸语义固定：width 是沿墙长度，depth 是墙体厚度；侧墙不要因为 yaw=90/270 就把 width/depth 交换理解。
- 请尽量输出关系字段：parentId、placement、supportSurface、anchor、wallRole、proximityGroupId、relationReason、inferred。
- on-top 表示摆在父物体上表面；attached-to-wall 表示贴附在墙体；embedded-inside 表示子物体位于父物体内部并沿某个方向略微外露；on-floor 表示直接落地。
- attached-to-wall 不是"靠近墙"而是"贴住墙内侧面"；对象背面应与墙面平面对齐，不能漂浮在室内。
- embedded-wall 或其他嵌入关系必须是"部分嵌入、部分外露"：子物体要从父物体表面凸出一部分即可，不能完全埋入，也不能整体被挤出父物体。
- 如果子物体位于展示柜/书柜/壁龛内部，请优先使用 embedded-inside，并通过 supportSurface 表达 interior-front / interior-back / interior-left / interior-right / interior-center 这类嵌入方向，而不是误写成 on-top。
- on-top 关系表示子物体放置在父物体顶面上，子物体的水平投影应保持在父物体顶面范围内，不要为了可见性把它强行推到父物体外。
- 典型示例：wall-art / wall-light / mirror 这类墙面挂件应使用 attached-to-wall；ceiling-light / lamp 这类顶部灯具应使用 attached-to-ceiling；monitor / books / small-tools 放在桌面时应使用 on-top；built-in bookshelf / display cabinet / window 这类嵌入墙体构件应使用 mountType=embedded-wall，并保持部分外露。
- 对 attached-to-wall / embedded-wall 物体要额外判断是否 shouldTouchGround=true：落地书柜、衣柜、展示柜、控制台通常应贴地；壁挂屏、挂画、壁灯通常不贴地。
- 远处/被遮挡的小物体若底部不可见，应尽量根据多视角恢复其真实支撑结构和真实高度；只有在确实能判断支撑存在但被遮挡时，才补 inferred=true 的支撑物体。
- 地面是场景原点：主地面对象 position.y 应尽量为 0，其他对象以该基准定位。
- position.y 表示物体底面高度，不是中心点高度。
- size.height 必须与视觉参照自洽，尤其是靠窗柜体、桌面下柜体、靠墙控制台等落地家具，不能严重低于其应达到的承托/遮挡高度。
- 若存在 parentId/placement 关系，子物体要有一部分明显露出父物体边界或表面之外，避免完全埋入、完全重叠或只剩共面关系。
- 墙面挂件优先贴近墙面；桌面摆件优先贴近桌面局部坐标。
- 当墙面已经围合出房间边界时，地面和屋顶的 size/position 应覆盖整个围合区域，而不是只覆盖当前镜头可见部分。
- 若无法判断真实尺寸，请给出合理近似值。
用户补充要求：${extra}`
}

const SCENE_LIGHTING_SYSTEM_PROMPT = `你是一个面向室内设计与 Unreal 场景搭建的场景灯光分析技能。你的任务是基于场景理解的 JSON 结果和参考图像，分析场景光照条件并输出灯光布置建议的严格 JSON。
不要输出 markdown，不要输出解释，不要输出代码块。
输出必须是严格有效的 JSON。
请分析场景中的自然光来源（窗户、门洞）、主光源位置、光照强度、色温、阴影方向。
请为场景推荐合适的灯光布置方案，包括主灯、补光、氛围灯的位置、类型、强度、色温。
请考虑房间大小、墙面颜色、家具材质对照明的影响。
输出必须包含 lights 数组，每个灯光对象包含 id、type、position、color、intensity、temperature、name、description 等字段。
position 使用 3D 坐标 x/y/z，与场景理解输出保持同一坐标系。
color 使用 RGB 十六进制或 [r,g,b] 数组。
intensity 为 0-100 的相对强度。
temperature 为色温（开尔文），如 2700K（暖光）、4000K（中性光）、6500K（冷白光）。
type 推荐使用：main-light（主灯）、fill-light（补光）、accent-light（氛围灯/重点照明）、natural-light（自然光）。
请同时输出 lightingSummary 字段，简要描述整体光照方案。
请输出 ambient 字段描述环境光强度和颜色。
请确保灯光位置合理，不要嵌入墙体或家具内部（除非是嵌入式灯具）。
【输出规则-最高优先级】
1. 你必须且只能输出一个完整的 JSON 对象，从 { 开始，以 } 结束。
2. 输出完最终的 } 之后必须立即停止生成，绝对不要在 } 之后输出任何内容（包括但不限于：解释文字、修正说明、重复的 JSON、总结等）。
3. 绝对禁止在一个回复中输出两个或多个 JSON 对象。
4. 绝对禁止在 JSON 之外添加任何自然语言文字。
5. 如果收到续写指令（assistant 消息以未完成的 JSON 结尾），必须从断点处无缝续写，绝对不能从头重新输出，绝对不能重复已有内容。`

function buildSceneLightingUserPrompt(userText, layoutJson, imageCount) {
	const extra = (userText || '').trim() || '未提供额外文本提示，请直接基于场景进行灯光分析。'
	return `请基于以下场景理解 JSON 和参考图像，分析场景光照条件并推荐灯光布置方案。
${imageCount > 1 ? `本次共输入 ${imageCount} 张参考图辅助光照分析。` : ''}
场景布局 JSON：
${layoutJson}
用户补充要求：${extra}
请输出严格 JSON，包含 lightingSummary、ambient、lights 数组。
每个灯光对象包含：id、type、position（x/y/z）、color、intensity（0-100）、temperature（开尔文）、name、description。
position 必须使用与输入 layoutJson 相同的坐标系。`
}

function getApiKeyRepo(ctx) {
	const repo = ctx.localdb?.apiKeys
	if (!repo) throw internalError('apiKeys repo not available')
	return repo
}

function tryGetKey(ctx, ...names) {
	const repo = getApiKeyRepo(ctx)
	for (const name of names) {
		try {
			const r = repo.getPlaintext(name)
			if (r.ok && r.plaintext && String(r.plaintext).trim()) return String(r.plaintext).trim()
		} catch {}
	}
	return ''
}

function resolveArkApiKey(ctx) {
	return tryGetKey(ctx, 'bytedance_ark', 'bytedance_text', 'bytedance', 'doubao', 'ark', 'volcengine')
}

function toFloatNum(value, defaultValue) {
	const n = Number(value)
	return Number.isFinite(n) && !Number.isNaN(n) ? n : defaultValue
}

function scanBalancedJsonEnd(text, startIdx = 0) {
	const src = String(text || '')
	let depth = 0
	let inString = false
	let escape = false
	let foundStart = false
	for (let i = Math.max(0, startIdx); i < src.length; i++) {
		const ch = src[i]
		if (escape) {
			escape = false
			continue
		}
		if (ch === '\\') {
			escape = true
			continue
		}
		if (ch === '"') {
			inString = !inString
			continue
		}
		if (inString) continue
		if (ch === '{') {
			depth++
			foundStart = true
		} else if (ch === '}') {
			if (!foundStart) return -1
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

function extractJsonContent(text) {
	const str = String(text || '').trim()
	if (!str) return ''

	const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
	const source = fenceMatch ? fenceMatch[1].trim() : str

	const startIdx = source.indexOf('{')
	if (startIdx < 0) return source

	const endIdx = scanBalancedJsonEnd(source, startIdx)
	if (endIdx > startIdx) {
		return source.slice(startIdx, endIdx + 1)
	}
	return source.slice(startIdx)
}

function hasCompleteRootJson(text) {
	const src = String(text || '')
	const startIdx = src.indexOf('{')
	if (startIdx < 0) return false
	return scanBalancedJsonEnd(src, startIdx) > startIdx
}

function getJsonCompletionPrefixLen(text) {
	const src = String(text || '')
	const startIdx = src.indexOf('{')
	if (startIdx < 0) return -1
	const endIdx = scanBalancedJsonEnd(src, startIdx)
	return endIdx > startIdx ? endIdx + 1 : -1
}

function createJsonDeltaScanner() {
	let depth = 0
	let inString = false
	let escape = false
	let rootClosed = false
	return {
		feed(chunk) {
			if (rootClosed) return true
			const src = String(chunk || '')
			for (let i = 0; i < src.length; i++) {
				const ch = src[i]
				if (escape) {
					escape = false
					continue
				}
				if (ch === '\\') {
					escape = true
					continue
				}
				if (ch === '"') {
					inString = !inString
					continue
				}
				if (inString) continue
				if (ch === '{') {
					depth++
				} else if (ch === '}') {
					if (depth > 0) {
						depth--
						if (depth === 0) {
							rootClosed = true
							return true
						}
					}
				}
			}
			return false
		},
		isClosed() { return rootClosed },
		reset() { depth = 0; inString = false; escape = false; rootClosed = false }
	}
}

function validateAndParseJson(jsonStr, context) {
	try {
		const parsed = JSON.parse(jsonStr)
		return { ok: true, data: parsed }
	} catch (err) {
		return { ok: false, error: `${context || 'JSON'} parse error: ${err.message}` }
	}
}

function findOverlap(oldSuffix, newPrefix) {
	const oldStr = String(oldSuffix || '')
	const newStr = String(newPrefix || '')
	const maxLen = Math.min(oldStr.length, newStr.length, 200)
	for (let len = maxLen; len >= 20; len--) {
		if (oldStr.slice(-len) === newStr.slice(0, len)) {
			return len
		}
	}
	return 0
}

function extractSummary(parsed) {
	if (!parsed || typeof parsed !== 'object') return ''
	if (typeof parsed.summary === 'string') return parsed.summary
	if (typeof parsed.description === 'string') return parsed.description
	if (Array.isArray(parsed.objects) && parsed.objects.length > 0) {
		return `识别到 ${parsed.objects.length} 个物体`
	}
	return ''
}

function buildImageContent(imageInputs) {
	const content = []
	const inputs = Array.isArray(imageInputs) ? imageInputs : []
	for (const input of inputs) {
		if (!input) continue
		const url = input.imageUrl
		const dataUrl = input.imageDataUrl
		if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
			content.push({ type: 'image_url', image_url: { url: dataUrl } })
		} else if (url && typeof url === 'string') {
			content.push({ type: 'image_url', image_url: { url } })
		}
	}
	return content
}

async function callArkChatCompletion(client, apiKey, model, messages, stream = false) {
	const endpoint = `${ARK_API_BASE}/chat/completions`
	const body = {
		model,
		messages,
		stream,
		temperature: 0.1,
		max_tokens: 16384,
	}
	if (stream) {
		return client.postStream(endpoint, {
			headers: { 'Authorization': `Bearer ${apiKey}` },
			body,
			timeout: 600000
		})
	}
	const res = await client.post(endpoint, body, {
		headers: { 'Authorization': `Bearer ${apiKey}` },
		timeout: 600000
	})
	if (!res.ok) {
		const errMsg = typeof res.body === 'object' && res.body?.error?.message
			? res.body.error.message
			: `HTTP ${res.status}`
		throw upstreamError(`Ark API call failed: ${errMsg}`)
	}
	return res
}

export function sceneUnderstandModels() {
	return {
		ok: true,
		models: SCENE_UNDERSTAND_MODEL_OPTIONS,
		defaultModel: DEFAULT_SCENE_UNDERSTAND_MODEL
	}
}

export function sceneLightingModels() {
	return {
		ok: true,
		models: SCENE_LIGHTING_MODEL_OPTIONS,
		defaultModel: DEFAULT_SCENE_LIGHTING_MODEL
	}
}

export async function sceneUnderstandRun(ctx, payload) {
	const p = payload || {}
	const model = String(p.model || DEFAULT_SCENE_UNDERSTAND_MODEL).trim()
	const promptText = String(p.promptText || '').trim()
	const imageUrl = String(p.imageUrl || '').trim()
	const imageDataUrl = String(p.imageDataUrl || '').trim()
	const imageInputs = p.imageInputs

	const apiKey = resolveArkApiKey(ctx)
	if (!apiKey) throw invalidParamsError('ByteDance Ark API key is not configured')

	const client = getHttpClient()
	const messages = [
		{ role: 'system', content: SCENE_UNDERSTAND_SYSTEM_PROMPT }
	]

	const imageCount = Array.isArray(imageInputs) ? imageInputs.length : (imageUrl || imageDataUrl ? 1 : 0)
	const userContent = [
		{ type: 'text', text: buildSceneUnderstandUserPrompt(promptText, imageCount) }
	]
	if (Array.isArray(imageInputs) && imageInputs.length > 0) {
		userContent.push(...buildImageContent(imageInputs))
	} else if (imageDataUrl && imageDataUrl.startsWith('data:')) {
		userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
	} else if (imageUrl) {
		userContent.push({ type: 'image_url', image_url: { url: imageUrl } })
	}
	messages.push({ role: 'user', content: userContent })

	try {
		const res = await callArkChatCompletion(client, apiKey, model, messages, false)
		const choice = res.body?.choices?.[0]
		let content = String(choice?.message?.content || '').trim()
		if (!content) throw upstreamError('Empty response from model')

		const prefixLen = getJsonCompletionPrefixLen(content)
		if (prefixLen > 0 && prefixLen < content.length) {
			content = content.slice(0, prefixLen)
		}
		const jsonStr = extractJsonContent(content)
		const parsed = validateAndParseJson(jsonStr, 'Scene understand result')
		if (!parsed.ok) {
			return { ok: false, error: parsed.error, model, provider: 'volcengine-ark' }
		}

		return {
			ok: true,
			model,
			outputJson: jsonStr,
			parsed: parsed.data,
			provider: 'volcengine-ark'
		}
	} catch (err) {
		if (err?.statusCode) throw err
		return { ok: false, error: String(err?.message || err), model, provider: 'volcengine-ark' }
	}
}

export async function* sceneUnderstandRunStream(ctx, payload) {
	const p = payload || {}
	const model = String(p.model || DEFAULT_SCENE_UNDERSTAND_MODEL).trim()
	const promptText = String(p.promptText || '').trim()
	const imageUrl = String(p.imageUrl || '').trim()
	const imageDataUrl = String(p.imageDataUrl || '').trim()
	const imageInputs = p.imageInputs

	const apiKey = resolveArkApiKey(ctx)
	if (!apiKey) {
		yield wrapStreamError('ByteDance Ark API key is not configured')
		return
	}

	yield wrapTaskStatusMsg('任务已启动，正在准备输入图片...', 'start')

	const client = getHttpClient()
	let messages = [
		{ role: 'system', content: SCENE_UNDERSTAND_SYSTEM_PROMPT }
	]

	const imageCount = Array.isArray(imageInputs) ? imageInputs.length : (imageUrl || imageDataUrl ? 1 : 0)
	const userContent = [
		{ type: 'text', text: buildSceneUnderstandUserPrompt(promptText, imageCount) }
	]
	if (Array.isArray(imageInputs) && imageInputs.length > 0) {
		userContent.push(...buildImageContent(imageInputs))
	} else if (imageDataUrl && imageDataUrl.startsWith('data:')) {
		userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
	} else if (imageUrl) {
		userContent.push({ type: 'image_url', image_url: { url: imageUrl } })
	}
	messages.push({ role: 'user', content: userContent })

	let fullAccumulatedContent = ''
	let fullReasoningContent = ''
	let hasStartedContent = false
	let continuationCount = 0
	let repairCount = 0
	let thisRoundContent = ''
	let restartDetected = false
	let restartProbeBuf = ''
	const MAX_CONTINUATIONS = 3
	const MAX_REPAIRS = 2
	const HEARTBEAT_INTERVAL = 2000
	const ANCHOR_SUFFIX_LEN = 300
	const RESTART_PROBE_LEN = 20

	try {
		let parseOk = false
		let finalJsonStr = ''
		let finalParsed = null

		while (!parseOk) {
			const parseRoundBaseMsgLen = messages.length
			while (continuationCount <= MAX_CONTINUATIONS) {
				const isRepairRound = repairCount > 0
				const isContinuationRound = continuationCount > 0 && !isRepairRound

				if (continuationCount > 0) {
					yield wrapTaskStatusMsg(`输出较长，正在续写第 ${continuationCount} 段...`, 'continue')
				} else if (repairCount > 0) {
					yield wrapTaskStatusMsg(`JSON格式有误，正在请求模型修复（第${repairCount}次）...`, 'rewrite')
				} else {
					yield wrapTaskStatusMsg('正在连接模型服务...', 'connect')
				}

				const stream = await callArkChatCompletion(client, apiKey, model, messages, true)
				const submitMsg = isRepairRound
					? '修复请求已提交，等待模型重新输出正确JSON...'
					: (continuationCount > 0 ? '继续请求已提交，等待响应...' : '已提交请求，模型正在深度思考分析图片...')
				yield wrapTaskStatusMsg(submitMsg, isRepairRound ? 'rewrite' : 'thinking')

				let lastStatusTime = Date.now()
				let finishReason = null
				hasStartedContent = false
				thisRoundContent = ''
				restartDetected = false
				restartProbeBuf = ''
				const jsonScanner = createJsonDeltaScanner()
				if (!isContinuationRound) {
					fullAccumulatedContent = ''
				}
				fullReasoningContent = ''

				for await (const rawLine of stream) {
					const now = Date.now()
					if (now - lastStatusTime > HEARTBEAT_INTERVAL) {
						if (!hasStartedContent) {
							yield wrapTaskStatusMsg(isRepairRound ? '模型正在重新生成JSON...' : '模型正在思考中，分析空间结构与物体关系...', isRepairRound ? 'writing' : 'thinking')
						} else if (jsonScanner.isClosed()) {
							yield wrapTaskStatusMsg('JSON输出完成，正在等待响应结束...', 'streaming')
						} else {
							yield wrapTaskStatusMsg('正在接收模型输出...', 'streaming')
						}
						lastStatusTime = now
					}

					const line = String(rawLine || '').trim()
					if (!line || !line.startsWith('data:')) continue
					const data = line.slice(5).trim()
					if (data === '[DONE]') break
					try {
						const parsed = JSON.parse(data)
						const choice = parsed?.choices?.[0]
						if (!choice) continue
						if (choice.finish_reason) finishReason = choice.finish_reason
						const reasoningDelta = choice.delta?.reasoning_content
						if (reasoningDelta) {
							fullReasoningContent += reasoningDelta
							yield wrapReasoningMsg(reasoningDelta)
							lastStatusTime = Date.now()
						}
						const delta = choice.delta?.content
						if (delta) {
							if (!hasStartedContent) {
								hasStartedContent = true
								yield wrapTaskStatusMsg(isRepairRound ? '正在输出修复后的JSON...' : '思考完成，正在输出结构化JSON...', 'writing')
							}

							if (jsonScanner.isClosed()) {
								lastStatusTime = Date.now()
								continue
							}

							if (isContinuationRound && !restartDetected) {
								restartProbeBuf += delta
								const probeClean = restartProbeBuf.replace(/```(?:json)?/gi, '').replace(/\s/g, '')
								if (probeClean.length >= RESTART_PROBE_LEN || probeClean.startsWith('{')) {
									if (probeClean.startsWith('{')) {
										restartDetected = true
										fullAccumulatedContent = ''
										thisRoundContent = ''
										jsonScanner.reset()
										while (messages.length > parseRoundBaseMsgLen) {
											messages.pop()
										}
										continuationCount = 0
										yield wrapTaskStatusMsg('检测到模型重新开始输出，已重置内容...', 'continue')
									} else {
										restartProbeBuf = ''
									}
								}
							}

							if (!restartDetected || !thisRoundContent) {
								const closed = jsonScanner.feed(delta)
								thisRoundContent += delta
								fullAccumulatedContent += delta
								yield wrapTextMsg(delta)
								if (closed) {
									yield wrapTaskStatusMsg('JSON输出完成，正在忽略后续冗余内容...', 'streaming')
								}
							} else {
								jsonScanner.feed(delta)
								thisRoundContent += delta
								fullAccumulatedContent += delta
								yield wrapTextMsg(delta)
								if (jsonScanner.isClosed()) {
									yield wrapTaskStatusMsg('JSON输出完成，正在忽略后续冗余内容...', 'streaming')
								}
							}
							lastStatusTime = Date.now()
						}
					} catch {}
				}

				if (restartDetected && fullAccumulatedContent.length > 0) {
					const prefixLen = getJsonCompletionPrefixLen(fullAccumulatedContent)
					if (prefixLen > 0) {
						fullAccumulatedContent = fullAccumulatedContent.slice(0, prefixLen)
					}
				} else if (isContinuationRound && thisRoundContent.length > 0 && fullAccumulatedContent.length > thisRoundContent.length) {
					const oldPart = fullAccumulatedContent.slice(0, fullAccumulatedContent.length - thisRoundContent.length)
					const overlap = findOverlap(oldPart, thisRoundContent)
					if (overlap > 0) {
						fullAccumulatedContent = oldPart + thisRoundContent.slice(overlap)
						yield wrapTaskStatusMsg(`检测到续写重复${overlap}字符，已自动去重...`, 'continue')
					}
				}

				const alreadyComplete = hasCompleteRootJson(fullAccumulatedContent)
				if (finishReason === 'length' && continuationCount < MAX_CONTINUATIONS && !alreadyComplete) {
					continuationCount++
					const anchor = fullAccumulatedContent.slice(-ANCHOR_SUFFIX_LEN)
					messages.push({ role: 'assistant', content: fullAccumulatedContent })
					messages.push({
						role: 'user',
						content: `继续：从下方JSON的最后一个字符之后直接续写，补齐未完成部分。\n绝对不要重复已输出的内容，绝对不要从{重新开始，绝对不要输出解释或markdown标记。\n已输出JSON末尾的${ANCHOR_SUFFIX_LEN}个字符作为锚点（你必须从这个锚点之后无缝续接，不能改写锚点内容，不能输出另一个JSON对象）：\n---锚点开始---\n${anchor}\n---锚点结束---`
					})
					continue
				}

				if (finishReason === 'length' && alreadyComplete) {
					yield wrapTaskStatusMsg('JSON已完整输出，忽略后续冗余内容。', 'streaming')
				}

				break
			}

			const prefixLen = getJsonCompletionPrefixLen(fullAccumulatedContent)
			if (prefixLen > 0 && prefixLen < fullAccumulatedContent.length) {
				fullAccumulatedContent = fullAccumulatedContent.slice(0, prefixLen)
			}

			yield wrapTaskStatusMsg('正在解析返回结果...', 'parse')
			const jsonStr = extractJsonContent(fullAccumulatedContent)
			const validateResult = validateAndParseJson(jsonStr, 'Scene understand result')
			if (validateResult.ok) {
				parseOk = true
				finalJsonStr = jsonStr
				finalParsed = validateResult.data
				break
			}

			if (repairCount < MAX_REPAIRS) {
				repairCount++
				continuationCount = 0
				messages.push({ role: 'assistant', content: fullAccumulatedContent })
				messages.push({
					role: 'user',
					content: `你刚才输出的JSON存在格式错误，无法解析。错误信息：${validateResult.error}\n\n请重新输出一个完整的、格式正确的JSON对象，不要输出任何解释、说明或markdown代码块标记，直接输出纯JSON，且只输出一个JSON对象。`
				})
				continue
			}

			yield wrapStreamError(`结果解析失败（已尝试${MAX_REPAIRS}次修复）: ${validateResult.error}`)
			return
		}

		const summary = extractSummary(finalParsed)
		yield wrapChatMsg({
			outputJson: finalJsonStr,
			rawOutput: fullAccumulatedContent,
			summary: summary || '场景理解完成。',
			provider: 'volcengine-ark',
			providerStatusText: '远端服务已返回结果。'
		})
	} catch (err) {
		yield wrapStreamError(String(err?.message || err))
		return
	}
	yield wrapDone()
}

export async function sceneLightingRun(ctx, payload) {
	const p = payload || {}
	const model = String(p.model || DEFAULT_SCENE_LIGHTING_MODEL).trim()
	const promptText = String(p.promptText || '').trim()
	const layoutJson = String(p.layoutJson || '').trim()
	const imageUrl = String(p.imageUrl || '').trim()
	const imageDataUrl = String(p.imageDataUrl || '').trim()
	const imageInputs = p.imageInputs

	if (!layoutJson) throw invalidParamsError('layoutJson is required')

	const apiKey = resolveArkApiKey(ctx)
	if (!apiKey) throw invalidParamsError('ByteDance Ark API key is not configured')

	const client = getHttpClient()
	const messages = [
		{ role: 'system', content: SCENE_LIGHTING_SYSTEM_PROMPT }
	]

	const imageCount = Array.isArray(imageInputs) ? imageInputs.length : (imageUrl || imageDataUrl ? 1 : 0)
	const userContent = [
		{ type: 'text', text: buildSceneLightingUserPrompt(promptText, layoutJson, imageCount) }
	]
	if (Array.isArray(imageInputs) && imageInputs.length > 0) {
		userContent.push(...buildImageContent(imageInputs))
	} else if (imageDataUrl && imageDataUrl.startsWith('data:')) {
		userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
	} else if (imageUrl) {
		userContent.push({ type: 'image_url', image_url: { url: imageUrl } })
	}
	messages.push({ role: 'user', content: userContent })

	try {
		const res = await callArkChatCompletion(client, apiKey, model, messages, false)
		const choice = res.body?.choices?.[0]
		let content = String(choice?.message?.content || '').trim()
		if (!content) throw upstreamError('Empty response from model')

		const prefixLen = getJsonCompletionPrefixLen(content)
		if (prefixLen > 0 && prefixLen < content.length) {
			content = content.slice(0, prefixLen)
		}
		const jsonStr = extractJsonContent(content)
		const parsed = validateAndParseJson(jsonStr, 'Scene lighting result')
		if (!parsed.ok) {
			return { ok: false, error: parsed.error, model, provider: 'volcengine-ark' }
		}

		return {
			ok: true,
			model,
			outputJson: jsonStr,
			parsed: parsed.data,
			provider: 'volcengine-ark'
		}
	} catch (err) {
		if (err?.statusCode) throw err
		return { ok: false, error: String(err?.message || err), model, provider: 'volcengine-ark' }
	}
}

export async function* sceneLightingRunStream(ctx, payload) {
	const p = payload || {}
	const model = String(p.model || DEFAULT_SCENE_LIGHTING_MODEL).trim()
	const promptText = String(p.promptText || '').trim()
	const layoutJson = String(p.layoutJson || '').trim()
	const imageUrl = String(p.imageUrl || '').trim()
	const imageDataUrl = String(p.imageDataUrl || '').trim()
	const imageInputs = p.imageInputs

	if (!layoutJson) {
		yield wrapStreamError('layoutJson is required')
		return
	}

	const apiKey = resolveArkApiKey(ctx)
	if (!apiKey) {
		yield wrapStreamError('ByteDance Ark API key is not configured')
		return
	}

	yield wrapTaskStatusMsg('任务已启动，正在准备参考图和布局JSON...', 'start')

	const client = getHttpClient()
	let messages = [
		{ role: 'system', content: SCENE_LIGHTING_SYSTEM_PROMPT }
	]

	const imageCount = Array.isArray(imageInputs) ? imageInputs.length : (imageUrl || imageDataUrl ? 1 : 0)
	const userContent = [
		{ type: 'text', text: buildSceneLightingUserPrompt(promptText, layoutJson, imageCount) }
	]
	if (Array.isArray(imageInputs) && imageInputs.length > 0) {
		userContent.push(...buildImageContent(imageInputs))
	} else if (imageDataUrl && imageDataUrl.startsWith('data:')) {
		userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
	} else if (imageUrl) {
		userContent.push({ type: 'image_url', image_url: { url: imageUrl } })
	}
	messages.push({ role: 'user', content: userContent })

	let fullAccumulatedContent = ''
	let fullReasoningContent = ''
	let hasStartedContent = false
	let continuationCount = 0
	let repairCount = 0
	let thisRoundContent = ''
	let restartDetected = false
	let restartProbeBuf = ''
	const MAX_CONTINUATIONS = 3
	const MAX_REPAIRS = 2
	const HEARTBEAT_INTERVAL = 2000
	const ANCHOR_SUFFIX_LEN = 300
	const RESTART_PROBE_LEN = 20

	try {
		let parseOk = false
		let finalJsonStr = ''
		let finalParsed = null

		while (!parseOk) {
			const parseRoundBaseMsgLen = messages.length
			while (continuationCount <= MAX_CONTINUATIONS) {
				const isRepairRound = repairCount > 0
				const isContinuationRound = continuationCount > 0 && !isRepairRound

				if (continuationCount > 0) {
					yield wrapTaskStatusMsg(`输出较长，正在续写第 ${continuationCount} 段...`, 'continue')
				} else if (repairCount > 0) {
					yield wrapTaskStatusMsg(`JSON格式有误，正在请求模型修复（第${repairCount}次）...`, 'rewrite')
				} else {
					yield wrapTaskStatusMsg('正在连接模型服务...', 'connect')
				}

				const stream = await callArkChatCompletion(client, apiKey, model, messages, true)
				const submitMsg = isRepairRound
					? '修复请求已提交，等待模型重新输出正确JSON...'
					: (continuationCount > 0 ? '继续请求已提交，等待响应...' : '已提交请求，模型正在深度思考分析光照条件...')
				yield wrapTaskStatusMsg(submitMsg, isRepairRound ? 'rewrite' : 'thinking')

				let lastStatusTime = Date.now()
				let finishReason = null
				hasStartedContent = false
				thisRoundContent = ''
				restartDetected = false
				restartProbeBuf = ''
				const jsonScanner = createJsonDeltaScanner()
				if (!isContinuationRound) {
					fullAccumulatedContent = ''
				}
				fullReasoningContent = ''

				for await (const rawLine of stream) {
					const now = Date.now()
					if (now - lastStatusTime > HEARTBEAT_INTERVAL) {
						if (!hasStartedContent) {
							yield wrapTaskStatusMsg(isRepairRound ? '模型正在重新生成JSON...' : '模型正在思考中，分析光照条件...', isRepairRound ? 'writing' : 'thinking')
						} else if (jsonScanner.isClosed()) {
							yield wrapTaskStatusMsg('JSON输出完成，正在等待响应结束...', 'streaming')
						} else {
							yield wrapTaskStatusMsg('正在接收模型输出...', 'streaming')
						}
						lastStatusTime = now
					}

					const line = String(rawLine || '').trim()
					if (!line || !line.startsWith('data:')) continue
					const data = line.slice(5).trim()
					if (data === '[DONE]') break
					try {
						const parsed = JSON.parse(data)
						const choice = parsed?.choices?.[0]
						if (!choice) continue
						if (choice.finish_reason) finishReason = choice.finish_reason
						const reasoningDelta = choice.delta?.reasoning_content
						if (reasoningDelta) {
							fullReasoningContent += reasoningDelta
							yield wrapReasoningMsg(reasoningDelta)
							lastStatusTime = Date.now()
						}
						const delta = choice.delta?.content
						if (delta) {
							if (!hasStartedContent) {
								hasStartedContent = true
								yield wrapTaskStatusMsg(isRepairRound ? '正在输出修复后的JSON...' : '思考完成，正在输出灯光配置JSON...', 'writing')
							}

							if (jsonScanner.isClosed()) {
								lastStatusTime = Date.now()
								continue
							}

							if (isContinuationRound && !restartDetected) {
								restartProbeBuf += delta
								const probeClean = restartProbeBuf.replace(/```(?:json)?/gi, '').replace(/\s/g, '')
								if (probeClean.length >= RESTART_PROBE_LEN || probeClean.startsWith('{')) {
									if (probeClean.startsWith('{')) {
										restartDetected = true
										fullAccumulatedContent = ''
										thisRoundContent = ''
										jsonScanner.reset()
										while (messages.length > parseRoundBaseMsgLen) {
											messages.pop()
										}
										continuationCount = 0
										yield wrapTaskStatusMsg('检测到模型重新开始输出，已重置内容...', 'continue')
									} else {
										restartProbeBuf = ''
									}
								}
							}

							if (!restartDetected || !thisRoundContent) {
								const closed = jsonScanner.feed(delta)
								thisRoundContent += delta
								fullAccumulatedContent += delta
								yield wrapTextMsg(delta)
								if (closed) {
									yield wrapTaskStatusMsg('JSON输出完成，正在忽略后续冗余内容...', 'streaming')
								}
							} else {
								jsonScanner.feed(delta)
								thisRoundContent += delta
								fullAccumulatedContent += delta
								yield wrapTextMsg(delta)
								if (jsonScanner.isClosed()) {
									yield wrapTaskStatusMsg('JSON输出完成，正在忽略后续冗余内容...', 'streaming')
								}
							}
							lastStatusTime = Date.now()
						}
					} catch {}
				}

				if (restartDetected && fullAccumulatedContent.length > 0) {
					const prefixLen = getJsonCompletionPrefixLen(fullAccumulatedContent)
					if (prefixLen > 0) {
						fullAccumulatedContent = fullAccumulatedContent.slice(0, prefixLen)
					}
				} else if (isContinuationRound && thisRoundContent.length > 0 && fullAccumulatedContent.length > thisRoundContent.length) {
					const oldPart = fullAccumulatedContent.slice(0, fullAccumulatedContent.length - thisRoundContent.length)
					const overlap = findOverlap(oldPart, thisRoundContent)
					if (overlap > 0) {
						fullAccumulatedContent = oldPart + thisRoundContent.slice(overlap)
						yield wrapTaskStatusMsg(`检测到续写重复${overlap}字符，已自动去重...`, 'continue')
					}
				}

				const alreadyComplete = hasCompleteRootJson(fullAccumulatedContent)
				if (finishReason === 'length' && continuationCount < MAX_CONTINUATIONS && !alreadyComplete) {
					continuationCount++
					const anchor = fullAccumulatedContent.slice(-ANCHOR_SUFFIX_LEN)
					messages.push({ role: 'assistant', content: fullAccumulatedContent })
					messages.push({
						role: 'user',
						content: `继续：从下方JSON的最后一个字符之后直接续写，补齐未完成部分。\n绝对不要重复已输出的内容，绝对不要从{重新开始，绝对不要输出解释或markdown标记。\n已输出JSON末尾的${ANCHOR_SUFFIX_LEN}个字符作为锚点（你必须从这个锚点之后无缝续接，不能改写锚点内容，不能输出另一个JSON对象）：\n---锚点开始---\n${anchor}\n---锚点结束---`
					})
					continue
				}

				if (finishReason === 'length' && alreadyComplete) {
					yield wrapTaskStatusMsg('JSON已完整输出，忽略后续冗余内容。', 'streaming')
				}

				break
			}

			const prefixLen = getJsonCompletionPrefixLen(fullAccumulatedContent)
			if (prefixLen > 0 && prefixLen < fullAccumulatedContent.length) {
				fullAccumulatedContent = fullAccumulatedContent.slice(0, prefixLen)
			}

			yield wrapTaskStatusMsg('正在解析返回结果...', 'parse')
			const jsonStr = extractJsonContent(fullAccumulatedContent)
			const validateResult = validateAndParseJson(jsonStr, 'Scene lighting result')
			if (validateResult.ok) {
				parseOk = true
				finalJsonStr = jsonStr
				finalParsed = validateResult.data
				break
			}

			if (repairCount < MAX_REPAIRS) {
				repairCount++
				continuationCount = 0
				messages.push({ role: 'assistant', content: fullAccumulatedContent })
				messages.push({
					role: 'user',
					content: `你刚才输出的JSON存在格式错误，无法解析。错误信息：${validateResult.error}\n\n请重新输出一个完整的、格式正确的JSON对象，不要输出任何解释、说明或markdown代码块标记，直接输出纯JSON，且只输出一个JSON对象。`
				})
				continue
			}

			yield wrapStreamError(`结果解析失败（已尝试${MAX_REPAIRS}次修复）: ${validateResult.error}`)
			return
		}

		const summary = extractSummary(finalParsed)
		yield wrapChatMsg({
			outputJson: finalJsonStr,
			rawOutput: fullAccumulatedContent,
			summary: summary || '场景灯光理解完成。',
			provider: 'volcengine-ark',
			providerStatusText: '远端服务已返回结果。'
		})
	} catch (err) {
		yield wrapStreamError(String(err?.message || err))
		return
	}
	yield wrapDone()
}

function asDict(raw) {
	return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

function canonicalWallRole(value) {
	const raw = String(value || '').trim().toLowerCase()
	if (!raw) return ''
	if (['left', '左墙', '左侧墙', '左侧墙面'].some(t => raw.includes(t))) return 'left'
	if (['right', '右墙', '右侧墙', '右侧墙面'].some(t => raw.includes(t))) return 'right'
	if (['back', 'rear', '后墙', '后侧墙', '后侧墙面'].some(t => raw.includes(t))) return 'back'
	if (['front', '前墙', '前侧墙', '前侧墙面'].some(t => raw.includes(t))) return 'front'
	return raw
}

const GROUP_COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#f87171', '#22d3ee', '#facc15']

function normalizeLayoutItem(item) {
	const obj = asDict(item)
	const position = asDict(obj.position)
	const size = asDict(obj.size)
	const rotation = asDict(obj.rotation)
	const scale = asDict(obj.scale)
	return {
		id: String(obj.id || ''),
		name: String(obj.name || ''),
		category: String(obj.category || ''),
		subCategory: String(obj.subCategory || ''),
		color: String(obj.color || ''),
		material: String(obj.material || ''),
		description: String(obj.description || ''),
		sameTypeGroupId: String(obj.sameTypeGroupId || ''),
		sameTypeGroupLabel: String(obj.sameTypeGroupLabel || ''),
		parentId: String(obj.parentId || ''),
		placement: String(obj.placement || ''),
		supportSurface: String(obj.supportSurface || ''),
		anchor: String(obj.anchor || ''),
		wallRole: canonicalWallRole(obj.wallRole),
		proximityGroupId: String(obj.proximityGroupId || ''),
		relationReason: String(obj.relationReason || ''),
		inferred: Boolean(obj.inferred),
		position: {
			x: toFloatNum(position.x, 0),
			y: toFloatNum(position.y, 0),
			z: toFloatNum(position.z, 0)
		},
		size: {
			width: Math.max(0.05, toFloatNum(size.width, 1)),
			height: Math.max(0.05, toFloatNum(size.height, 1)),
			depth: Math.max(0.05, toFloatNum(size.depth, 1))
		},
		rotation: {
			yaw: toFloatNum(rotation.yaw, 0),
			pitch: toFloatNum(rotation.pitch, 0),
			roll: toFloatNum(rotation.roll, 0)
		},
		scale: {
			x: Math.max(0.01, toFloatNum(scale.x, 1)),
			y: Math.max(0.01, toFloatNum(scale.y, 1)),
			z: Math.max(0.01, toFloatNum(scale.z, 1))
		},
		sourceImageIndex: Math.max(1, Math.floor(toFloatNum(obj.sourceImageIndex, 1))),
		observedImageIndices: Array.isArray(obj.observedImageIndices)
			? [...new Set(obj.observedImageIndices.map(v => Math.max(1, Math.floor(toFloatNum(v, 1)))))]
			: [],
		isKeyElement: Boolean(obj.isKeyElement),
		keyElementType: String(obj.keyElementType || '').toLowerCase(),
		fixedInRoom: Boolean(obj.fixedInRoom),
		semanticRole: String(obj.semanticRole || '').toLowerCase(),
		mountType: String(obj.mountType || '').toLowerCase(),
		relationTags: Array.isArray(obj.relationTags)
			? obj.relationTags.map(t => String(t || '').trim().toLowerCase()).filter(Boolean)
			: [],
		shouldTouchGround: obj.shouldTouchGround !== false,
		groundReason: String(obj.groundReason || ''),
		imageRect: asDict(obj.imageRect),
	}
}

function applyGroupColors(items) {
	const groupMap = new Map()
	let colorIdx = 0
	for (const item of items) {
		const gid = item.sameTypeGroupId
		if (gid && !groupMap.has(gid)) {
			groupMap.set(gid, GROUP_COLORS[colorIdx % GROUP_COLORS.length])
			colorIdx++
		}
	}
	for (const item of items) {
		if (!item.color && item.sameTypeGroupId && groupMap.has(item.sameTypeGroupId)) {
			item.color = groupMap.get(item.sameTypeGroupId)
		}
	}
	return items
}

export function sceneLayoutRun(ctx, payload) {
	const p = payload || {}
	const inputJson = String(p.inputJson || '').trim()
	if (!inputJson) throw invalidParamsError('inputJson is required')

	let parsed
	try {
		parsed = JSON.parse(inputJson)
	} catch (err) {
		return { ok: false, error: `inputJson is not valid JSON: ${err.message}` }
	}

	const rawItems = Array.isArray(parsed?.objects) ? parsed.objects : []
	const items = rawItems.map(normalizeLayoutItem)
	const colored = applyGroupColors(items)

	const roomShell = asDict(parsed?.roomShell)
	const camera = asDict(parsed?.camera)
	const keyElements = Array.isArray(parsed?.keyElements) ? parsed.keyElements : []

	const result = {
		ok: true,
		layoutItems: colored,
		roomShell,
		camera,
		keyElements,
		sceneSummary: String(parsed?.sceneSummary || ''),
		message: `已处理 ${colored.length} 个布局对象`
	}

	return result
}

const unrealSessionsMap = new Map()
const unrealJobsMap = new Map()
const UNREAL_SESSION_TTL = 30000
const UNREAL_JOB_TTL = 300000

function cleanupStaleSessions() {
	const now = Date.now()
	for (const [id, session] of unrealSessionsMap) {
		if (now - session.lastHeartbeat > UNREAL_SESSION_TTL * 2) {
			unrealSessionsMap.delete(id)
		}
	}
}

function generateId(prefix) {
	return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

export function unrealSessions() {
	cleanupStaleSessions()
	const now = Date.now()
	const items = []
	for (const [id, session] of unrealSessionsMap) {
		const isStale = now - session.lastHeartbeat > UNREAL_SESSION_TTL
		items.push({
			sessionId: id,
			id,
			projectId: session.projectId,
			projectName: session.clientInfo?.projectName || '',
			projectPath: session.clientInfo?.projectPath || '',
			displayName: session.clientInfo?.projectName || session.projectId || id,
			clientInfo: session.clientInfo,
			lastHeartbeat: session.lastHeartbeat,
			lastSeenAt: session.lastHeartbeat,
			createdAt: session.createdAt,
			jobCount: session.jobs.length,
			status: isStale ? 'stale' : 'connected'
		})
	}
	items.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat)
	return { ok: true, sessions: items }
}

export function unrealRegister(ctx, payload) {
	const p = payload || {}
	const projectId = String(p.projectId || p.clientInfo?.projectName || '').trim()
	const clientInfo = asDict(p.clientInfo)
	const now = Date.now()

	let existingSession = null
	if (projectId) {
		for (const [id, session] of unrealSessionsMap) {
			if (session.projectId === projectId) {
				existingSession = session
				break
			}
		}
	}

	if (existingSession) {
		existingSession.lastHeartbeat = now
		existingSession.clientInfo = { ...existingSession.clientInfo, ...clientInfo }
		return {
			ok: true,
			sessionId: existingSession.id,
			projectId,
			reused: true,
			session: { id: existingSession.id, projectId, createdAt: existingSession.createdAt }
		}
	}

	const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
	const sessionId = safeProjectId ? `ue_${safeProjectId}` : generateId('ue')
	const session = {
		id: sessionId,
		projectId,
		clientInfo,
		createdAt: now,
		lastHeartbeat: now,
		jobs: [],
		nextJobIndex: 0
	}
	unrealSessionsMap.set(sessionId, session)
	return { ok: true, sessionId, projectId, reused: false, session: { id: sessionId, projectId, createdAt: now } }
}

function formatJobForPlugin(job) {
	if (!job) return null
	const payload = asDict(job.payload)
	return {
		jobId: job.id,
		sessionId: job.sessionId,
		type: job.type,
		status: job.status,
		sceneName: String(payload.sceneName || ''),
		assetRootPath: String(payload.assetRootPath || ''),
		sourceNodeId: String(payload.sourceNodeId || ''),
		exportPayload: payload,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt
	}
}

export function unrealSessionDetail(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || p.id || '').trim()
	if (!sessionId) throw invalidParamsError('sessionId is required')
	const session = unrealSessionsMap.get(sessionId)
	if (!session) return { ok: false, error: 'session not found', status: 404 }
	session.lastHeartbeat = Date.now()
	return {
		ok: true,
		session: {
			id: session.id,
			projectId: session.projectId,
			clientInfo: session.clientInfo,
			lastHeartbeat: session.lastHeartbeat,
			createdAt: session.createdAt,
			jobs: session.jobs.map(jid => unrealJobsMap.get(jid)).filter(Boolean)
		}
	}
}

export function unrealCreateJob(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	if (!sessionId) throw invalidParamsError('sessionId is required')
	const session = unrealSessionsMap.get(sessionId)
	if (!session) return { ok: false, error: 'session not found', status: 404 }

	const jobId = generateId('job')
	const now = Date.now()
	const job = {
		id: jobId,
		sessionId,
		type: String(p.type || 'export'),
		payload: asDict(p.payload),
		status: 'pending',
		createdAt: now,
		updatedAt: now,
		result: null,
		error: null
	}
	unrealJobsMap.set(jobId, job)
	session.jobs.push(jobId)
	session.lastHeartbeat = now
	return {
		ok: true,
		job: {
			jobId,
			id: jobId,
			status: job.status,
			createdAt: job.createdAt,
			message: '',
			sessionId
		}
	}
}

export function unrealJobDetail(ctx, payload) {
	const p = payload || {}
	const jobId = String(p.jobId || p.id || '').trim()
	if (!jobId) throw invalidParamsError('jobId is required')
	const job = unrealJobsMap.get(jobId)
	if (!job) return { ok: false, error: 'job not found', status: 404 }
	job.updatedAt = Date.now()
	if (p.status) job.status = String(p.status)
	const message = String(p.message || '').trim()
	if (message) {
		job.message = message
	}
	if (p.error) {
		job.error = String(p.error)
		if (!p.status) job.status = 'failed'
	}
	const resultData = asDict(p.resultData)
	if (resultData && Object.keys(resultData).length > 0) {
		job.result = { ...(job.result || {}), ...resultData }
	}
	if (p.result && typeof p.result === 'object') {
		job.result = { ...(job.result || {}), ...p.result }
	}
	if (p.progress !== undefined) {
		job.result = job.result || {}
		job.result.progress = Number(p.progress) || 0
	}
	if (p.stage) {
		job.result = job.result || {}
		job.result.stage = String(p.stage)
	}
	if (p.importedAssetCount !== undefined) {
		job.result = job.result || {}
		job.result.importedAssetCount = Number(p.importedAssetCount) || 0
	}
	if (p.pendingModelImportCount !== undefined) {
		job.result = job.result || {}
		job.result.pendingModelImportCount = Number(p.pendingModelImportCount) || 0
	}
	if (p.spawnedActorCount !== undefined) {
		job.result = job.result || {}
		job.result.spawnedActorCount = Number(p.spawnedActorCount) || 0
	}
	if (p.assembledComponentCount !== undefined) {
		job.result = job.result || {}
		job.result.assembledComponentCount = Number(p.assembledComponentCount) || 0
	}
	if (p.slotCount !== undefined) {
		job.result = job.result || {}
		job.result.slotCount = Number(p.slotCount) || 0
	}
	if (p.appliedSlotCount !== undefined) {
		job.result = job.result || {}
		job.result.appliedSlotCount = Number(p.appliedSlotCount) || 0
	}
	if (p.materialOverrideCount !== undefined) {
		job.result = job.result || {}
		job.result.materialOverrideCount = Number(p.materialOverrideCount) || 0
	}
	if (p.spawnedLightCount !== undefined) {
		job.result = job.result || {}
		job.result.spawnedLightCount = Number(p.spawnedLightCount) || 0
	}
	if (p.blueprintAssetPath) {
		job.result = job.result || {}
		job.result.blueprintAssetPath = String(p.blueprintAssetPath)
	}
	if (p.modelsAssetPath) {
		job.result = job.result || {}
		job.result.modelsAssetPath = String(p.modelsAssetPath)
	}
	if (p.manifestPath) {
		job.result = job.result || {}
		job.result.manifestPath = String(p.manifestPath)
	}
	if (p.assetRootPath) {
		job.result = job.result || {}
		job.result.assetRootPath = String(p.assetRootPath)
	}
	return { ok: true, job }
}

export function unrealDisconnectSession(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || p.id || '').trim()
	if (!sessionId) return { ok: false, error: 'sessionId is required', status: 400 }
	const session = unrealSessionsMap.get(sessionId)
	if (!session) return { ok: false, error: 'session not found', status: 404 }
	unrealSessionsMap.delete(sessionId)
	return { ok: true, disconnected: true, sessionId }
}

export function unrealHeartbeat(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || p.id || '').trim()
	if (!sessionId) return { ok: false, error: 'sessionId is required', status: 400 }
	const session = unrealSessionsMap.get(sessionId)
	if (!session) return { ok: false, error: 'session not found', status: 404 }
	session.lastHeartbeat = Date.now()
	if (p.clientInfo && typeof p.clientInfo === 'object') {
		session.clientInfo = { ...session.clientInfo, ...p.clientInfo }
	}
	return { ok: true, session: { id: session.id, lastHeartbeat: session.lastHeartbeat } }
}

export function unrealPickJob(ctx, payload) {
	const p = payload || {}
	const sessionId = String(p.sessionId || '').trim()
	if (!sessionId) return { ok: false, error: 'sessionId is required', status: 400 }
	const session = unrealSessionsMap.get(sessionId)
	if (!session) return { ok: false, error: 'session not found', status: 404 }
	session.lastHeartbeat = Date.now()

	for (let i = 0; i < session.jobs.length; i++) {
		const jobId = session.jobs[i]
		const job = unrealJobsMap.get(jobId)
		if (!job) continue
		if (job.status === 'pending') {
			job.status = 'picked'
			job.pickedAt = Date.now()
			job.updatedAt = Date.now()
			return { ok: true, job: formatJobForPlugin(job) }
		}
		if (job.status === 'picked' || job.status === 'importing' || job.status === 'downloading' || job.status === 'assembling-actor' || job.status === 'applying-lighting') {
			job.updatedAt = Date.now()
			return { ok: true, job: formatJobForPlugin(job) }
		}
	}
	return { ok: true, job: null }
}

const UNREAL_BRIDGE_CONFIG_FILENAME = 'dvstudio-unreal-bridge.json'

function getUnrealBridgeConfigPaths() {
	const paths = []
	const homeDir = os.homedir()
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA
		if (appData) paths.push(path.join(appData, 'DVStudio', UNREAL_BRIDGE_CONFIG_FILENAME))
		paths.push(path.join(homeDir, 'AppData', 'Roaming', 'DVStudio', UNREAL_BRIDGE_CONFIG_FILENAME))
	} else if (process.platform === 'darwin') {
		paths.push(path.join(homeDir, 'Library', 'Application Support', 'DVStudio', UNREAL_BRIDGE_CONFIG_FILENAME))
	} else {
		const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config')
		paths.push(path.join(xdgConfig, 'dvstudio', UNREAL_BRIDGE_CONFIG_FILENAME))
	}
	paths.push(path.join(homeDir, '.dvstudio', UNREAL_BRIDGE_CONFIG_FILENAME))
	return paths
}

function writeUnrealBridgeConfig(port) {
	const config = {
		backendUrl: `http://127.0.0.1:${port}`,
		port,
		host: '127.0.0.1',
		protocol: 'http',
		updatedAt: Date.now()
	}
	const configContent = JSON.stringify(config, null, 2)
	const errors = []
	for (const configPath of getUnrealBridgeConfigPaths()) {
		try {
			fs.mkdirSync(path.dirname(configPath), { recursive: true })
			fs.writeFileSync(configPath, configContent, 'utf8')
			logger.info(`Unreal bridge config written to ${configPath}`)
		} catch (err) {
			errors.push(`${configPath}: ${err.message}`)
		}
	}
	return { ok: errors.length === 0, errors, config }
}

function writeUnrealBridgeConfigToProject(projectPath, port) {
	if (!projectPath || !port) return { ok: false, error: 'projectPath and port required' }
	try {
		const pluginDir = path.join(projectPath, 'Plugins', 'DwebWorkflowBridge')
		const configPath = path.join(pluginDir, UNREAL_BRIDGE_CONFIG_FILENAME)
		fs.mkdirSync(pluginDir, { recursive: true })
		const config = {
			backendUrl: `http://127.0.0.1:${port}`,
			port,
			host: '127.0.0.1',
			protocol: 'http',
			projectPath,
			updatedAt: Date.now()
		}
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
		logger.info(`Unreal bridge config written to project: ${configPath}`)
		return { ok: true, configPath, config }
	} catch (err) {
		return { ok: false, error: err.message }
	}
}

let unrealHttpServer = null
let unrealHttpPort = 0

function sendJson(res, statusCode, data) {
	const body = JSON.stringify(data)
	res.writeHead(statusCode, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(body),
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	})
	res.end(body)
}

function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		let body = ''
		req.on('data', chunk => { body += chunk })
		req.on('end', () => {
			if (!body) return resolve({})
			try { resolve(JSON.parse(body)) } catch (err) { reject(err) }
		})
		req.on('error', reject)
	})
}

export function startUnrealHttpServer() {
	if (unrealHttpServer) return { ok: true, port: unrealHttpPort }

	return new Promise((resolve) => {
		unrealHttpServer = http.createServer(async (req, res) => {
			if (req.method === 'OPTIONS') {
				res.writeHead(204, {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type'
				})
				res.end()
				return
			}

			const url = new URL(req.url, `http://${req.headers.host}`)
			const pathname = url.pathname.replace(/\/+$/, '')

			try {
				if (req.method === 'GET' && pathname === '/api/agent-skills/unreal/health') {
					return sendJson(res, 200, { ok: true, timestamp: Date.now() })
				}

				if (req.method === 'POST' && pathname === '/api/agent-skills/unreal/register') {
					const body = await readJsonBody(req)
					const result = unrealRegister(null, body)
					return sendJson(res, result.ok ? 200 : 400, result)
				}

				if (req.method === 'POST' && pathname === '/api/agent-skills/unreal/heartbeat') {
					const body = await readJsonBody(req)
					const result = unrealHeartbeat(null, body)
					return sendJson(res, result.ok ? 200 : 404, result)
				}

				if (req.method === 'POST' && pathname === '/api/agent-skills/unreal/pick-job') {
					const body = await readJsonBody(req)
					const result = unrealPickJob(null, body)
					return sendJson(res, result.ok ? 200 : 400, result)
				}

				if (req.method === 'POST' && pathname.startsWith('/api/agent-skills/unreal/jobs/') && pathname.endsWith('/update')) {
					const jobId = pathname.split('/').slice(-2, -1)[0]
					const body = await readJsonBody(req)
					const result = unrealJobDetail(null, { jobId, ...body })
					return sendJson(res, result.ok ? 200 : 404, result)
				}

				if (req.method === 'GET' && pathname.startsWith('/api/agent-skills/unreal/jobs/')) {
					const jobId = pathname.split('/').pop()
					const result = unrealJobDetail(null, { jobId })
					return sendJson(res, result.ok ? 200 : 404, result)
				}

				if (req.method === 'GET' && pathname === '/api/agent-skills/unreal/sessions') {
					const result = unrealSessions()
					return sendJson(res, 200, result)
				}

				if (req.method === 'POST' && pathname === '/api/agent-skills/unreal/jobs/create') {
					const body = await readJsonBody(req)
					const result = unrealCreateJob(null, body)
					return sendJson(res, result.ok ? 200 : 400, result)
				}

				if (req.method === 'GET' && pathname === '/api/agent-skills/unreal-export/sessions') {
					const result = unrealSessions()
					return sendJson(res, 200, result)
				}

				if (req.method === 'POST' && pathname === '/api/agent-skills/unreal-export/jobs/create') {
					const body = await readJsonBody(req)
					const result = unrealCreateJob(null, body)
					return sendJson(res, result.ok ? 200 : 400, result)
				}

				if (req.method === 'GET' && pathname.startsWith('/api/agent-skills/unreal-export/jobs/')) {
					const jobId = pathname.split('/').pop()
					const result = unrealJobDetail(null, { jobId })
					return sendJson(res, result.ok ? 200 : 404, result)
				}

				if (req.method === 'POST' && pathname === '/api/agent-skills/unreal-export/sessions/disconnect') {
					const body = await readJsonBody(req)
					const result = unrealDisconnectSession(null, body)
					return sendJson(res, result.ok ? 200 : 404, result)
				}

				if (req.method === 'POST' && pathname === '/api/agent-skills/unreal/disconnect') {
					const body = await readJsonBody(req)
					const result = unrealDisconnectSession(null, body)
					return sendJson(res, result.ok ? 200 : 404, result)
				}

				return sendJson(res, 404, { ok: false, error: 'not found' })
			} catch (err) {
				logger.error(`Unreal HTTP server error: ${err.message}`)
				return sendJson(res, 500, { ok: false, error: err.message })
			}
		})

		unrealHttpServer.listen(0, '127.0.0.1', () => {
			unrealHttpPort = unrealHttpServer.address().port
			logger.info(`Unreal export HTTP server started on port ${unrealHttpPort}`)
			writeUnrealBridgeConfig(unrealHttpPort)
			resolve({ ok: true, port: unrealHttpPort })
		})

		unrealHttpServer.on('error', (err) => {
			logger.error(`Unreal HTTP server failed to start: ${err.message}`)
			unrealHttpServer = null
			resolve({ ok: false, error: err.message })
		})
	})
}

export function getUnrealHttpPort() {
	return unrealHttpPort
}

export function stopUnrealHttpServer() {
	if (unrealHttpServer) {
		unrealHttpServer.close()
		unrealHttpServer = null
		unrealHttpPort = 0
	}
}

import {
	detectUnrealEditorProcesses,
	checkPluginInstalled,
	installPluginToProject,
	getPluginInfo,
	writePluginConnectionConfig
} from './unreal-editor-detector.mjs'

export async function unrealDetectEditor() {
	try {
		if (unrealHttpPort > 0) {
			writeUnrealBridgeConfig(unrealHttpPort)
		}
		const result = await detectUnrealEditorProcesses()
		if (!result.ok) {
			return { ok: false, running: false, processes: [], error: result.error }
		}
		return {
			ok: true,
			running: result.running,
			processes: result.processes.map((p) => ({
				pid: p.pid,
				projectPath: p.projectPath,
				projectName: p.projectName
			}))
		}
	} catch (err) {
		return {
			ok: false,
			running: false,
			processes: [],
			error: err.message || String(err)
		}
	}
}

export function unrealCheckPlugin(ctx, payload) {
	const p = payload || {}
	const projectPath = String(p.projectPath || '').trim()
	if (!projectPath) {
		return { ok: false, installed: false, error: 'projectPath is required' }
	}
	try {
		const result = checkPluginInstalled(projectPath)
		if (!result.ok) {
			return { ok: false, installed: false, error: result.error }
		}
		if (result.installed && unrealHttpPort > 0 && result.projectRoot) {
			writeUnrealBridgeConfigToProject(result.projectRoot, unrealHttpPort)
		}
		return {
			ok: true,
			installed: result.installed,
			pluginVersion: result.pluginVersion,
			pluginPath: result.pluginPath,
			projectRoot: result.projectRoot,
			projectName: result.projectName
		}
	} catch (err) {
		return {
			ok: false,
			installed: false,
			error: err.message || String(err)
		}
	}
}

export async function unrealInstallPlugin(ctx, payload) {
	const p = payload || {}
	const projectPath = String(p.projectPath || '').trim()
	if (!projectPath) {
		return { ok: false, installed: false, error: 'projectPath is required' }
	}
	try {
		const result = await installPluginToProject(projectPath)
		if (!result.ok) {
			return { ok: false, installed: false, error: result.error }
		}
		if (result.installed && unrealHttpPort > 0 && result.projectRoot) {
			writeUnrealBridgeConfigToProject(result.projectRoot, unrealHttpPort)
		}
		return {
			ok: true,
			installed: result.installed,
			pluginPath: result.pluginPath,
			pluginVersion: result.pluginVersion,
			pluginEnabled: result.pluginEnabled,
			pluginEnableUpdated: result.pluginEnableUpdated,
			projectRoot: result.projectRoot,
			projectName: result.projectName,
			needsRestart: result.needsRestart
		}
	} catch (err) {
		return {
			ok: false,
			installed: false,
			error: err.message || String(err)
		}
	}
}

export function unrealGetPluginInfo() {
	try {
		const result = getPluginInfo()
		if (!result.ok) {
			return { ok: false, pluginName: result.pluginName, pluginVersion: '', error: result.error }
		}
		return {
			ok: true,
			pluginName: result.pluginName,
			pluginVersion: result.pluginVersion,
			packageSize: result.packageSize
		}
	} catch (err) {
		return {
			ok: false,
			pluginName: 'DwebWorkflowBridge',
			pluginVersion: '',
			error: err.message || String(err)
		}
	}
}
