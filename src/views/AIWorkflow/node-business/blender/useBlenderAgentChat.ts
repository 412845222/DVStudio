import type { Store } from 'vuex'
import type {
	WorkflowState,
	WorkflowBlenderChatMessage
} from '../../../../aiworkflow/types'
import { getAgentChatBridge } from '../../../../network/chat/AgentChatBridge'
import type { AgentBackendType, ChatAttachment, ChatStreamEvent } from '../../../../network/chat/types'
import {
	collectBlenderUpstreamInputs,
	type BlenderUpstreamInputs
} from './useBlenderUpstreamInputs'
import { getCachedAgentSettings, loadAgentSettings } from '../../../../core/agent/agentConfig'

const makeMsgId = () => `blender-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const BLENDER_TOOL_NAMES = [
	'blender_execute_blender_code',
	'blender_get_objects_summary',
	'blender_get_object_detail_summary',
	'blender_get_blendfile_summary_datablocks',
	'blender_get_blendfile_summary_missing_files',
	'blender_get_blendfile_summary_of_linked_libraries',
	'blender_get_blendfile_summary_path_info',
	'blender_get_blendfile_summary_usage_guess',
	'blender_get_screenshot_of_area_as_image',
	'blender_get_screenshot_of_window_as_image',
	'blender_get_screenshot_of_window_as_json',
	'blender_jump_to_tab_by_name',
	'blender_jump_to_tab_by_space_type',
	'blender_jump_to_view3d_object_by_name',
	'blender_jump_to_view3d_object_data_by_name',
	'blender_import_model',
	'blender_read_workspace_image',
	'blender_list_workspace_images',
] as const

const TOOL_DISPLAY_NAMES: Record<string, string> = {
	'blender_execute_blender_code': '执行Blender代码',
	'blender_get_objects_summary': '获取场景对象概览',
	'blender_get_object_detail_summary': '获取对象详情',
	'blender_get_blendfile_summary_datablocks': '数据块统计',
	'blender_get_blendfile_summary_missing_files': '检查缺失文件',
	'blender_get_blendfile_summary_of_linked_libraries': '链接库信息',
	'blender_get_blendfile_summary_path_info': '文件路径信息',
	'blender_get_blendfile_summary_usage_guess': '用途猜测',
	'blender_get_screenshot_of_area_as_image': '区域截图',
	'blender_get_screenshot_of_window_as_image': '窗口截图',
	'blender_get_screenshot_of_window_as_json': '窗口布局JSON',
	'blender_jump_to_tab_by_name': '切换工作区',
	'blender_jump_to_tab_by_space_type': '按类型切换工作区',
	'blender_jump_to_view3d_object_by_name': '聚焦对象',
	'blender_jump_to_view3d_object_data_by_name': '按数据名聚焦对象',
	'blender_import_model': '导入模型',
	'blender_read_workspace_image': '读取工作区图片',
	'blender_list_workspace_images': '列出工作区图片',
}

function getToolDisplayName(toolName: string): string {
	if (TOOL_DISPLAY_NAMES[toolName]) return TOOL_DISPLAY_NAMES[toolName]
	const base = toolName.replace(/^blender_/, '').replace(/_/g, ' ')
	return base.charAt(0).toUpperCase() + base.slice(1)
}

const MAX_IMAGE_WIDTH = 960
const IMAGE_QUALITY = 0.85
const MAX_IMAGE_BASE64_CHARS = 500 * 1024

async function compressImageToDataUrl(blob: Blob, maxWidth: number = MAX_IMAGE_WIDTH, quality: number = IMAGE_QUALITY): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => {
			let { width, height } = img
			if (width > maxWidth) {
				const ratio = maxWidth / width
				width = maxWidth
				height = Math.round(height * ratio)
			}
			const canvas = document.createElement('canvas')
			canvas.width = width
			canvas.height = height
			const ctx = canvas.getContext('2d')
			if (!ctx) return reject(new Error('Canvas context unavailable'))
			ctx.drawImage(img, 0, 0, width, height)
			canvas.toBlob(
				(blob) => {
					if (!blob) return reject(new Error('Image compression failed'))
					const reader = new FileReader()
					reader.onload = () => resolve(reader.result as string)
					reader.onerror = () => reject(new Error('Data URL conversion failed'))
					reader.readAsDataURL(blob)
				},
				'image/jpeg',
				quality
			)
		}
		img.onerror = () => reject(new Error('Image load failed'))
		const reader = new FileReader()
		reader.onload = () => { img.src = reader.result as string }
		reader.onerror = () => reject(new Error('File read failed'))
		reader.readAsDataURL(blob)
	})
}

async function urlToBase64Attachment(url: string, name?: string): Promise<ChatAttachment | null> {
	if (!url) return null
	try {
		let blob: Blob
		if (url.startsWith('data:image/')) {
			const b64Len = url.length - url.indexOf(',') - 1
			if (b64Len <= MAX_IMAGE_BASE64_CHARS) {
				return { type: 'image_url', name, data: url, url }
			}
			const resp = await fetch(url)
			blob = await resp.blob()
		} else if (url.startsWith('file:')) {
			return null
		} else {
			const resp = await fetch(url)
			if (!resp.ok) return null
			blob = await resp.blob()
		}
		const dataUrl = await compressImageToDataUrl(blob)
		return { type: 'image_url', name, data: dataUrl, url: dataUrl }
	} catch {
		return null
	}
}

async function upstreamImagesToAttachments(images: BlenderUpstreamInputs['images']): Promise<ChatAttachment[]> {
	const attachments: ChatAttachment[] = []
	for (const img of images.slice(0, 3)) {
		const name = img.url.split('/').pop()?.split('?')[0] || `image_${attachments.length + 1}.jpg`
		const att = await urlToBase64Attachment(img.url, name)
		if (att) {
			attachments.push(att)
		}
	}
	return attachments
}

export interface BlenderAgentChatDeps {
	store: Store<WorkflowState>
	pushToast?: (message: string, tone?: 'info' | 'warn' | 'error') => void
	backend?: AgentBackendType
	model?: string
	onAbortReady?: (abortFn: () => void) => void
	getProjectId?: () => number | null
}

function buildBlenderContext(
	store: Store<WorkflowState>,
	nodeId: string,
	isActuallyConnected: boolean,
	workspaceInfo?: {
		workspacePath?: string
		screenshotsDir?: string
		referencesDir?: string
		savedReferences?: Array<{ fileName: string; absolutePath: string; relativePath: string; sourceAlias?: string }>
	}
) {
	const state = store.state
	const node = state.nodesById[nodeId]

	const blenderSettings = (node?.blenderSettings ?? {}) as Record<string, unknown>

	const fullUpstream = collectBlenderUpstreamInputs(store, nodeId)
	const upstream: BlenderUpstreamInputs = {
		texts: fullUpstream.texts,
		images: fullUpstream.images,
		models: isActuallyConnected ? fullUpstream.models : []
	}

	return {
		blender: {
			connected: isActuallyConnected,
			host: String(blenderSettings.mcpHost || 'localhost'),
			port: Number(blenderSettings.mcpPort || 9876),
			upstream,
			upstreamModel: upstream.models.length
				? {
						nodeLabel: upstream.models[0].sourceAlias,
						filePath: upstream.models[0].filePath,
						format: upstream.models[0].format
					}
				: null,
			workspace: workspaceInfo || null
		}
	}
}

async function getBlenderStatus(): Promise<{ connected: boolean; toolsReady: boolean; availableToolCount: number; missingToolCount: number; missingTools?: string[]; host?: string; port?: number }> {
	try {
		const statusResult = await window.dweb?.blender?.mcpStatus?.()
		const connected = statusResult?.ok === true && statusResult.status === 'connected'
		return {
			connected,
			toolsReady: connected ? !!statusResult?.toolsReady : false,
			availableToolCount: Number(statusResult?.availableToolCount) || 0,
			missingToolCount: Number(statusResult?.missingToolCount) || (connected ? -1 : 0),
			missingTools: statusResult?.missingTools,
			host: statusResult?.host,
			port: statusResult?.port
		}
	} catch {
		return { connected: false, toolsReady: false, availableToolCount: 0, missingToolCount: -1 }
	}
}

function buildBlenderSystemPrompt(context: ReturnType<typeof buildBlenderContext>, toolNames: string[]): string {
	const parts: string[] = []
	parts.push('你是一个Blender 3D控制助手，通过官方Blender MCP协议控制Blender实例。你拥有完整的blender_*工具集来查看和修改3D场景。')
	parts.push('')

	if (context.blender.workspace?.workspacePath) {
		parts.push('## 📂 当前工作区')
		parts.push(`工作区绝对路径: ${context.blender.workspace.workspacePath}`)
		parts.push(`- 截图保存目录: ${context.blender.workspace.screenshotsDir || context.blender.workspace.workspacePath + '/screenshots'}`)
		parts.push(`- 参考图保存目录: ${context.blender.workspace.referencesDir || context.blender.workspace.workspacePath + '/references'}`)
		parts.push('')
		parts.push('**重要**：所有截图都会自动保存到上述screenshots目录。截图工具返回的文本中会包含截图的绝对路径。')
		parts.push('如需重新查看之前的截图，使用 **blender_read_workspace_image** 工具，传入相对路径（如 "screenshots/文件名.png"）即可。')
		parts.push('使用 **blender_list_workspace_images** 工具可以列出工作区中所有可用的图片（截图和参考图）。')
		parts.push('')
	}

	if (context.blender.workspace?.savedReferences && context.blender.workspace.savedReferences.length > 0) {
		parts.push(`## 🖼️ 已保存参考图（共 ${context.blender.workspace.savedReferences.length} 张）`)
		parts.push('以下参考图已保存到工作区references目录，你可以通过 blender_read_workspace_image 工具读取它们：')
		for (const ref of context.blender.workspace.savedReferences) {
			const srcInfo = ref.sourceAlias ? `（来自节点: ${ref.sourceAlias}）` : ''
			parts.push(`- ${ref.fileName}${srcInfo}`)
			parts.push(`  绝对路径: ${ref.absolutePath}`)
			parts.push(`  相对路径: ${ref.relativePath}`)
		}
		parts.push('建模时请仔细参考这些图片的形态、风格和细节。')
		parts.push('')
	}

	if (context.blender.connected) {
		parts.push(`✅ 当前Blender已连接（${context.blender.host}:${context.blender.port}），可以直接调用工具执行操作。`)
	} else {
		parts.push('⚠️ 当前Blender尚未连接。你仍然拥有所有blender_*工具，但调用工具会返回"未连接"错误。请告诉用户：需要先在节点UI上点击"连接"按钮连接到正在运行的Blender实例（确保Blender已启动且MCP插件已启用），连接成功后你即可立即执行所有操作。不要说"没有可用工具"，工具是存在的，只是Blender未连接。')
	}
	parts.push('')
	parts.push('## 核心工具')
	parts.push('- **blender_execute_blender_code**: 执行任意bpy Python代码。当其他专用工具无法满足需求时使用此工具。代码执行后必须设置result字典。')
	parts.push('')
	parts.push('## 场景信息工具')
	parts.push('- **blender_get_objects_summary**: 获取集合层级树和所有对象列表、材质/相机/灯光名称。开始操作前优先调用。')
	parts.push('- **blender_get_object_detail_summary**: 获取指定对象的完整详细信息（变换、修改器、约束、材质、可见性、集合等）。修改对象后，优先用此工具验证参数，比截图更高效。')
	parts.push('- **blender_get_screenshot_of_window_as_json**: 获取窗口布局、区域分布、活动对象、选中对象的JSON描述。')
	parts.push('- **blender_get_blendfile_summary_datablocks**: 获取数据块统计、渲染引擎、工作区信息。')
	parts.push('- **blender_get_blendfile_summary_path_info**: 获取文件路径、保存状态、备份信息。')
	parts.push('- **blender_get_blendfile_summary_missing_files**: 检查缺失的外部文件引用。')
	parts.push('- **blender_get_blendfile_summary_of_linked_libraries**: 查看链接库依赖。')
	parts.push('- **blender_get_blendfile_summary_usage_guess**: 猜测文件用途（建模/渲染/动画等评分）。')
	parts.push('')
	parts.push('## 截图工具（按需使用，避免频繁截图浪费token）')
	parts.push('- **blender_get_screenshot_of_area_as_image**: 截取指定区域最新截图（默认VIEW_3D），返回base64 PNG并自动保存到工作区。')
	parts.push('- **blender_get_screenshot_of_window_as_image**: 截取整个Blender窗口最新截图并自动保存到工作区。')
	parts.push('')
	parts.push('📸 **截图策略（智能使用，节省token）**：')
	parts.push('1. **不需要截图的场景**（优先使用结构化工具验证）：')
	parts.push('   - 查询类操作（get_objects_summary、get_object_detail_summary等）')
	parts.push('   - 简单参数修改、对象创建/删除等操作：用get_object_detail_summary验证即可')
	parts.push('   - 导航操作（jump_to_*系列工具）')
	parts.push('   - 批量连续操作：完成所有相关步骤后再统一截图验证一次')
	parts.push('   - 导入模型：导入过程不需要截图，可在全部导入完成后截图确认')
	parts.push('2. **需要截图的场景**：')
	parts.push('   - 用户明确要求"看看效果"、"截图看看"、"现在什么样"')
	parts.push('   - 完成整个任务的最终验证')
	parts.push('   - 操作结果不确定、需要视觉确认布局/位置/外观')
	parts.push('   - 遇到错误需要调试时')
	parts.push('   - 涉及材质、灯光、渲染效果等视觉相关调整')
	parts.push('3. **重要规则**：')
	parts.push('   - blender_read_workspace_image 可用于查看工作区中的参考图或之前的截图')
	parts.push('   - 结构化工具（get_object_detail_summary等）能验证的，优先用结构化工具，不要用截图')
	parts.push('')
	parts.push('## ⚠️ Blender 5.1 版本专属注意事项（极其重要，不要用旧API）')
	parts.push('')
	parts.push('你运行在 **Blender 5.1** 环境中，大量API相对于3.x/4.x版本已变更。以下是高频错误清单：')
	parts.push('')
	parts.push('### 渲染引擎枚举（必须使用正确值）')
	parts.push('- ✅ 正确：`bpy.context.scene.render.engine = "BLENDER_EEVEE"`')
	parts.push('- ❌ 错误：`"BLENDER_EEVEE_NEXT"`（已废弃，不存在）')
	parts.push('- ❌ 错误：不要直接设置 `eevee.use_bloom`，EEVEE设置在5.1中已重构路径，设置前应先查询属性是否存在')
	parts.push('')
	parts.push('### 颜色值（必须4通道RGBA）')
	parts.push('- ✅ 正确：所有颜色输入（Base Color/Emission等）必须用4通道：`(r, g, b, 1.0)`')
	parts.push('- ❌ 错误：3通道RGB `(1, 0, 0)` 会报错 "sequences of dimension 0 should contain 4 items"')
	parts.push('')
	parts.push('### 旋转模式枚举')
	parts.push('- ✅ 正确：`obj.rotation_mode = "XYZ"`')
	parts.push('- ❌ 错误：`"EULER_XYZ"`（不存在）')
	parts.push('')
	parts.push('### bmesh API使用')
	parts.push('- ✅ 正确：`bm = bmesh.new(); bm.from_mesh(mesh)` 或编辑模式下 `bm = bmesh.from_edit_mesh(mesh)`')
	parts.push('- ❌ 错误：`bmesh.from_mesh(mesh)`（这是模块级函数，不存在）')
	parts.push('')
	parts.push('### 视图覆盖层属性改名')
	parts.push('- ❌ `overlay.show_bounds` → ✅ `overlay.show_object_bounds`')
	parts.push('- ❌ `overlay.show_camera` 等属性在5.1中已改名，使用前先检查 `hasattr(overlay, "property_name")`')
	parts.push('')
	parts.push('### 对象操作安全检查')
	parts.push('- 设置原点前必须检查类型：`if obj.type != "CAMERA"` 才能调用 `bpy.ops.object.origin_set()`，相机会报错')
	parts.push('- 链接到集合前检查：`if obj.name not in col.objects: col.objects.link(obj)`')
	parts.push('- 访问对象前检查：`obj = bpy.data.objects.get("Name")`，判断 `if obj is None`')
	parts.push('- 创建节点前检查节点类型是否存在，Blender 5.1中部分几何节点ID已变更或移除')
	parts.push('- 访问节点输入输出前检查：`if node.inputs.get("Name") is not None`')
	parts.push('')
	parts.push('### HDRI/枚举值')
	parts.push('- HDRI枚举需要写完整文件名（如 `"city.exr"`），不要只写 `"city"`')
	parts.push('')
	parts.push('### 材质设置（Blender 5.x已变更）')
	parts.push('- ❌ `material.shadow_method` 属性在Blender 5.x中已移除/重构，不要设置')
	parts.push('- ❌ Principled BSDF节点：不要使用 `bsdf.inputs["Emission"]`，Emission在Blender 5.x中需要添加独立的"Emission"节点并连接到Material Output的Surface端口')
	parts.push('')
	parts.push('### 3D视图背景图（API已重构）')
	parts.push('- ❌ `space.background_images` - 已移除，不要遍历')
	parts.push('- ❌ `space.show_background_images` - 已移除/改名')
	parts.push('- 背景图相关操作如果不确定，先查询可用属性')
	parts.push('')
	parts.push('### 错误记忆规则（避免重复犯同样错误）')
	parts.push('- **同一个API错误绝对不要犯第二次！** 如果某个属性/方法报错了，记住这个错误，换一种方式实现，不要重复尝试相同写法')
	parts.push('- 如果不确定API是否存在，先用极小代码段测试 `hasattr(obj, "property")` 再使用')
	parts.push('- 代码报错时，先仔细阅读stderr错误信息，根据错误信息直接修正，不要盲目重试')
	parts.push('')
	parts.push('## 🛡️ 安全操作铁则（违反将导致严重问题）')
	parts.push('')
	parts.push('### 删除操作（极度谨慎）')
	parts.push('1. **永远不要执行 `bpy.ops.object.delete()` 不带选择**（可能删除所有对象）')
	parts.push('2. **永远不要执行 `bpy.data.objects.remove(obj)` 除非用户明确要求删除**')
	parts.push('3. **优先使用隐藏 `obj.hide_set(True)` 代替删除，可恢复**')
	parts.push('4. **高风险操作前先调用：`bpy.ops.ed.undo_push(message="Before AI Operation")`**，用户出错可按Ctrl+Z撤销')
	parts.push('5. **每次只修改一个对象/一个参数**，验证后再继续')
	parts.push('')
	parts.push('### 通用安全编码规范')
	parts.push('1. 任何操作前先检查对象是否存在：`obj = bpy.data.objects.get("Name"); if obj is None: return error`')
	parts.push('2. 任何属性设置前先检查属性是否存在：`if hasattr(obj, "property_name")`')
	parts.push('3. 访问集合前检查索引/键是否存在：`if 0 < len(col) or "key" in col`')
	parts.push('4. 不要批量删除/修改用户未明确要求的内容')
	parts.push('5. 如果不确定API是否存在，先用小代码段测试属性是否存在，再执行完整操作')
	parts.push('6. **同一个错误不要重复犯**：如果代码报错了，分析错误原因后换方法，不要反复尝试相同写法')
	parts.push('')
	parts.push('## 📸 截图节流规则（强制执行，避免token浪费）')
	parts.push('1. **两次截图之间至少间隔30秒**，除非用户明确要求"现在截图看看"')
	parts.push('2. **代码错误时先看stderr错误信息**，不要立即截图 - 根据错误信息直接修正代码')
	parts.push('3. **连续2次修正后仍有问题时才截图**调试')
	parts.push('4. **批量查询/连续操作期间不截图**：先完成所有计划的修改步骤，最后统一截图验证一次')
	parts.push('5. 如果30秒内已经截过图了，不要重复截图')
	parts.push('')
	parts.push('## bpy API快速参考（避免写错API）')
	parts.push('')
	parts.push('### 对象访问与选择')
	parts.push('```python')
	parts.push('import bpy')
	parts.push('')
	parts.push('# 获取对象（安全方式，不存在返回None）')
	parts.push('obj = bpy.data.objects.get("ObjectName")')
	parts.push('if obj is None:')
	parts.push('    result = {"status": "error", "message": "Object not found"}')
	parts.push('else:')
	parts.push('    # 选择对象')
	parts.push('    bpy.ops.object.select_all(action="DESELECT")')
	parts.push('    obj.select_set(True)')
	parts.push('    bpy.context.view_layer.objects.active = obj')
	parts.push('```')
	parts.push('')
	parts.push('### 变换操作')
	parts.push('```python')
	parts.push('# 位置、旋转、缩放')
	parts.push('obj.location = (x, y, z)')
	parts.push('obj.rotation_euler = (rx, ry, rz)')
	parts.push('obj.scale = (sx, sy, sz)')
	parts.push('')
	parts.push('# 可见性判断')
	parts.push('is_visible = obj.visible_get()')
	parts.push('# 显示/隐藏')
	parts.push('obj.hide_set(False)  # 显示')
	parts.push('obj.hide_viewport = False  # 视口中显示')
	parts.push('```')
	parts.push('')
	parts.push('### 视图操作（需要在VIEW_3D上下文执行）')
	parts.push('```python')
	parts.push('# 框选聚焦到选中对象（需要在VIEW_3D区域）')
	parts.push('for area in bpy.context.screen.areas:')
	parts.push('    if area.type == "VIEW_3D":')
	parts.push('        for region in area.regions:')
	parts.push('            if region.type == "WINDOW":')
	parts.push('                with bpy.context.temp_override(area=area, region=region):')
	parts.push('                    bpy.ops.view3d.view_selected()')
	parts.push('                break')
	parts.push('        break')
	parts.push('```')
	parts.push('')
	parts.push('### 上下文覆盖（Blender 3.2+标准方式）')
	parts.push('```python')
	parts.push('# 正确方式')
	parts.push('with bpy.context.temp_override(window=win, area=area, region=region):')
	parts.push('    bpy.ops.some_operator()')
	parts.push('')
	parts.push('# 错误方式（已废弃）：bpy.context.area = area')
	parts.push('```')
	parts.push('')
	parts.push('### 模型导入')
	parts.push('```python')
	parts.push('# GLB/GLTF')
	parts.push('bpy.ops.import_scene.gltf(filepath=path)')
	parts.push('# FBX')
	parts.push('bpy.ops.import_scene.fbx(filepath=path)')
	parts.push('# OBJ (Blender 3.2+)')
	parts.push('bpy.ops.wm.obj_import(filepath=path)')
	parts.push('# STL (Blender 3.2+)')
	parts.push('bpy.ops.wm.stl_import(filepath=path)')
	parts.push('```')
	parts.push('')
	parts.push('### 结果返回要求')
	parts.push('- 代码执行后**必须**设置result字典变量')
	parts.push('- 成功时：result = {"status": "ok", ...其他数据}')
	parts.push('- 失败时：result = {"status": "error", "message": "错误描述"}')
	parts.push('')
	parts.push('## 工作区图片工具')
	parts.push('- **blender_list_workspace_images**: 列出工作区中所有已保存的图片（截图和参考图），包含绝对路径。')
	parts.push('- **blender_read_workspace_image**: 读取工作区中的图片文件返回给你查看（传入相对路径，如 "screenshots/xxx.png" 或 "references/xxx.png"）。')
	parts.push('')
	parts.push('## 导航工具')
	parts.push('- **blender_jump_to_tab_by_name**: 按名称切换工作区标签（Modeling/Rendering/Animation等）。')
	parts.push('- **blender_jump_to_tab_by_space_type**: 按空间类型切换工作区。')
	parts.push('- **blender_jump_to_view3d_object_by_name**: 在3D视口中选中并框选聚焦到指定对象（自动显示隐藏对象）。')
	parts.push('- **blender_jump_to_view3d_object_data_by_name**: 按数据块名称聚焦对象。')
	parts.push('')
	parts.push('## 其他')
	parts.push('- **blender_import_model**: 导入3D模型文件（.glb/.gltf/.fbx/.obj/.stl/.usd/.usdz/.blend等）。')
	parts.push('')
	parts.push('## 使用规则')
	parts.push('1. **操作前先调用 blender_get_objects_summary 了解场景**')
	parts.push('2. **不要猜测对象名称**，先用工具获取真实名称')
	parts.push('3. **复杂操作拆分步骤**，每次少量代码')
	parts.push('4. **验证策略**：优先用结构化工具验证参数，视觉效果再用截图验证')
	parts.push('5. **截图节流**：两次截图间隔至少30秒，连续操作完成后再统一截图，代码错误先看stderr')
	parts.push('6. **避免N+1查询**：先从get_objects_summary获取足够信息（name/type/location），不要逐个查询所有对象详情')
	parts.push('7. **只查询需要修改的对象**：只对你要操作的对象调用get_object_detail_summary，不要查询所有对象')
	parts.push('8. **安全第一**：所有操作遵循安全编码规范，高风险操作前先push undo点')
	parts.push('9. **Blender 5.1**：API与旧版本不同，遇到不确认的属性先hasattr检查，不要重复犯同样错误')
	parts.push('10. **错误记忆**：同一个API错误不要犯第二次，报错后换方法实现')
	parts.push('11. **参考图已保存在工作区**，需要查看参考图时调用 blender_read_workspace_image 工具')
	parts.push('12. 代码执行后必须设置result = {...}字典')
	parts.push('13. 回复用户使用中文')
	if (toolNames.length > 0) {
		parts.push('')
		parts.push('## 当前会话可用工具列表（白名单）')
		parts.push(toolNames.map(t => `- ${t}（${getToolDisplayName(t)}）`).join('\n'))
	}
	if (context.blender.connected && context.blender.upstream.models.length > 0) {
		parts.push('')
		parts.push(`## 上游模型信息（共 ${context.blender.upstream.models.length} 个）`)
		for (const m of context.blender.upstream.models) {
			parts.push(`- 来源节点：${m.sourceAlias}，文件路径：${m.filePath}，格式：${m.format}`)
		}
		parts.push('当用户说"导入上游模型"或类似要求时，直接使用blender_import_model工具依次传入上述路径。')
	}
	if (context.blender.upstream.images.length > 0 && (!context.blender.workspace?.savedReferences || context.blender.workspace.savedReferences.length === 0)) {
		parts.push('')
		parts.push(`## 上游参考图（共 ${context.blender.upstream.images.length} 张）`)
		for (const img of context.blender.upstream.images) {
			parts.push(`- 来源节点：${img.sourceAlias}，URL：${img.url}`)
		}
		parts.push('用户连接了上述参考图作为建模/材质参考。这些图片将作为附件随消息发送给你。建模时尽量贴合参考图描述的形态与风格。')
	}
	if (context.blender.upstream.texts.length > 0) {
		parts.push('')
		parts.push(`## 上游文本输入（共 ${context.blender.upstream.texts.length} 段）`)
		for (const t of context.blender.upstream.texts) {
			parts.push(`### 来自节点：${t.sourceAlias}`)
			parts.push(t.text.slice(0, 4000))
		}
		parts.push('上述文本是用户通过蓝图连线提供的上下文，执行操作时优先参考。')
	}
	parts.push('')
	parts.push('重要：不要询问用户任何关于工作流、蓝图、其他节点的问题，不要尝试读取或修改工作流/蓝图。专注于Blender场景操作。')
	return parts.join('\n')
}

function extractResultText(output: unknown): string {
	if (!output) return ''
	if (typeof output === 'string') return output
	try {
		return JSON.stringify(output, null, 2)
	} catch {
		return String(output)
	}
}

function extractStdoutStderr(output: unknown): { stdout: string; stderr: string; result: string } {
	if (!output) return { stdout: '', stderr: '', result: '' }
	let outStr = typeof output === 'string' ? output : JSON.stringify(output)
	let stdout = ''
	let stderr = ''
	let result = ''
	try {
		const parsed = typeof output === 'string' ? JSON.parse(output) : output
		if (parsed && typeof parsed === 'object') {
			const rec = parsed as Record<string, unknown>
			if ('stdout' in rec) stdout = String(rec.stdout ?? '')
			if ('stderr' in rec) stderr = String(rec.stderr ?? '')
			if ('result' in rec) {
				const r = rec.result
				result = typeof r === 'string' ? r : JSON.stringify(r, null, 2)
			}
		}
	} catch {
		stdout = outStr
	}
	return { stdout, stderr, result }
}

function formatToolResultDisplay(output: unknown): { summary: string; detail: string } {
	if (!output) return { summary: '', detail: '' }

	if (typeof output === 'object' && output !== null) {
		const out = output as Record<string, unknown> & { content?: unknown[]; ok?: boolean; error?: unknown }
		if (Array.isArray(out.content)) {
			const textParts: string[] = []
			for (const part of out.content) {
				if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
					textParts.push(part.text)
				}
			}
			if (textParts.length > 0) {
				const fullText = textParts.join('\n')
				const lines = fullText.trim().split('\n')
				const firstLine = lines[0] || ''
				return {
					summary: firstLine.slice(0, 100),
					detail: fullText.slice(0, 5000)
				}
			}
		}
		if (out.ok === false && out.error) {
			return { summary: String(out.error).slice(0, 100), detail: String(out.error) }
		}
		if (out.value && typeof out.value === 'object') {
			const valStr = JSON.stringify(out.value, null, 2)
			return { summary: '操作完成', detail: valStr.slice(0, 5000) }
		}
	}

	const { stdout, stderr, result } = extractStdoutStderr(output)
	const parts: string[] = []
	if (stdout && stdout.trim()) parts.push(`📤 输出:\n${stdout.trim()}`)
	if (stderr && stderr.trim()) parts.push(`⚠️ 错误:\n${stderr.trim()}`)
	if (result && result.trim()) {
		try {
			const parsed = JSON.parse(result)
			parts.push(`📋 结果:\n${JSON.stringify(parsed, null, 2)}`)
		} catch {
			parts.push(`📋 结果:\n${result.trim()}`)
		}
	}
	const rawText = extractResultText(output)
	const detail = parts.length > 0 ? parts.join('\n\n') : rawText.slice(0, 3000)
	let summary = '操作完成'
	if (stderr && stderr.trim()) {
		summary = '执行出错'
	} else if (result && result.trim()) {
		try {
			JSON.parse(result)
			summary = '操作成功'
		} catch {
			summary = result.trim().split('\n')[0].slice(0, 80)
		}
	} else if (stdout && stdout.trim().length > 0) {
		const firstLine = stdout.trim().split('\n')[0].slice(0, 80)
		summary = firstLine
	}
	return { summary, detail }
}

export async function runBlenderAgentChat(
	deps: BlenderAgentChatDeps,
	nodeId: string,
	prompt: string,
	userAttachments?: ChatAttachment[]
) {
	const { store } = deps
	const node = store.state.nodesById[nodeId]
	if (!node) return

	const projectId = deps.getProjectId?.() ?? store.state.projectId ?? null

	const preUpstream = collectBlenderUpstreamInputs(store, nodeId)
	const referenceAttachments = preUpstream.images.length > 0
		? await upstreamImagesToAttachments(preUpstream.images)
		: []

	const mergedAttachments = [...referenceAttachments, ...(userAttachments || [])]

	let workspaceInfo: {
		workspacePath?: string
		screenshotsDir?: string
		referencesDir?: string
		savedReferences?: Array<{ fileName: string; absolutePath: string; relativePath: string; sourceAlias?: string }>
	} = {}

	if (projectId && window.dweb?.blender?.workspaceInit) {
		try {
			const references = mergedAttachments.map((att, idx) => {
				const data = att.data || ''
				const base64Match = data.match(/^data:(image\/[^;]+);base64,(.+)$/)
				const isFromUpstream = idx < preUpstream.images.length
				return {
					base64: base64Match ? base64Match[2] : '',
					mimeType: base64Match ? base64Match[1] : 'image/png',
					fileName: att.name || `reference_${idx + 1}.png`,
					sourceAlias: isFromUpstream ? (preUpstream.images[idx]?.sourceAlias || '') : '用户上传'
				}
			}).filter(ref => ref.base64)
			const wsResult = await window.dweb.blender.workspaceInit({ nodeId, projectId, references })
			if (wsResult?.ok && wsResult.workspacePath) {
				node.blenderSettings = node.blenderSettings ?? {}
				;(node.blenderSettings as Record<string, unknown>).workspacePath = wsResult.workspacePath
				;(node.blenderSettings as Record<string, unknown>).workspaceRelativePath = wsResult.relativePath
				workspaceInfo = {
					workspacePath: wsResult.workspacePath,
					screenshotsDir: wsResult.screenshotsDir,
					referencesDir: wsResult.referencesDir,
					savedReferences: wsResult.references || []
				}
			}
		} catch (err) {
			console.warn('[BlenderChat] Failed to init workspace:', err)
		}
	}

	const settings = (node.blenderSettings ?? {}) as Record<string, unknown>

	const blenderStatus = await getBlenderStatus()
	let realConnected = blenderStatus.connected
	let toolsReady = blenderStatus.toolsReady
	let availableToolCount = blenderStatus.availableToolCount
	let missingToolCount = blenderStatus.missingToolCount
	let missingTools = blenderStatus.missingTools

	if (realConnected && !toolsReady) {
		try {
			const mountResult = await window.dweb?.blender?.mountTools?.()
			if (mountResult?.ok) {
				toolsReady = !!mountResult.ready
				availableToolCount = Number(mountResult.availableToolCount) || 0
				missingToolCount = Number(mountResult.missingToolCount) || 0
				missingTools = mountResult.missingTools
			}
		} catch {}
	}

	if (realConnected && !toolsReady) {
		try {
			const recheckResult = await window.dweb?.blender?.checkToolsReady?.()
			if (recheckResult) {
				toolsReady = !!recheckResult.ready
				availableToolCount = Number(recheckResult.availableToolCount) || 0
				missingToolCount = Number(recheckResult.missingToolCount) || 0
				missingTools = recheckResult.missingTools
			}
		} catch {}
	}

	store.commit('setBlenderMcpStatus', {
		nodeId,
		status: realConnected ? 'connected' : 'disconnected',
		error: null,
		serverId: realConnected ? 'blender' : null,
		toolsReady: realConnected ? toolsReady : undefined,
		toolCount: realConnected ? availableToolCount : undefined,
		missingToolCount: realConnected ? missingToolCount : undefined,
		missingTools: realConnected ? missingTools : undefined
	})

	if (!realConnected || !toolsReady) {
		const userMsg: WorkflowBlenderChatMessage = {
			id: makeMsgId(),
			role: 'user',
			content: prompt,
			timestamp: Date.now()
		}
		store.commit('appendBlenderChatMessage', { nodeId, message: userMsg })

		let warnText = ''
		if (!realConnected) {
			warnText += '⚠️ Blender未连接，请先点击节点上的"连接"按钮连接到正在运行的Blender实例。\n'
		}
		if (!toolsReady) {
			warnText += '⚠️ Blender工具未就绪，请先点击"挂载工具"按钮完成工具注册。\n'
		}
		warnText += '完成上述步骤后，重新发送消息即可。'

		const warnMsg: WorkflowBlenderChatMessage = {
			id: makeMsgId(),
			role: 'system',
			content: warnText,
			timestamp: Date.now(),
			isError: true
		}
		store.commit('appendBlenderChatMessage', { nodeId, message: warnMsg })
		return
	}

	const backendCandidate = String(
		deps.backend || settings.agentBackend || 'dvsagent'
	).trim()
	const backend = (
		backendCandidate === 'codex' || backendCandidate === 'copilot' ? backendCandidate : 'dvsagent'
	) as AgentBackendType
	// 参数面板存放位置（nodeChatConfig blender 分支）：
	// dvsagent → model(gemini|bytedance) + geminiTextModelVersion/textModelVersion；codex/copilot → modelId
	const resolveModelFromSettings = (): string => {
		if (backend === 'dvsagent') {
			const apiSource = String(settings.model || '').trim()
			if (apiSource === 'gemini') return String(settings.geminiTextModelVersion || '').trim()
			if (apiSource === 'bytedance') return String(settings.textModelVersion || '').trim()
			return ''
		}
		return String(settings.modelId || '').trim()
	}
	const rawModel = deps.model || resolveModelFromSettings()
	const model = (!rawModel || rawModel === 'auto') ? undefined : rawModel

	const history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []
	const existingChat = Array.isArray(settings.chatMessages) ? settings.chatMessages : []
	for (const msg of existingChat) {
		if (msg.role === 'user') {
			history.push({ role: 'user', content: msg.content })
		} else if (msg.role === 'assistant' && msg.content && !msg.isError) {
			history.push({ role: 'assistant', content: msg.content })
		}
	}

	const userMsg: WorkflowBlenderChatMessage = {
		id: makeMsgId(),
		role: 'user',
		content: prompt,
		timestamp: Date.now()
	}
	store.commit('appendBlenderChatMessage', { nodeId, message: userMsg })

	let currentAssistantMsgId: string = ''
	let currentContent = ''
	let currentThinkingContent = ''
	const createAssistantMsg = () => {
		currentAssistantMsgId = makeMsgId()
		currentContent = ''
		currentThinkingContent = ''
		const msg: WorkflowBlenderChatMessage = {
			id: currentAssistantMsgId,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			isThinking: true,
			thinkingContent: '',
			thinkingCollapsed: true
		}
		store.commit('appendBlenderChatMessage', { nodeId, message: msg })
	}
	const ensureAssistantMsg = () => {
		if (!currentAssistantMsgId) {
			createAssistantMsg()
		}
	}
	store.commit('setBlenderResponding', { nodeId, responding: true })

	const abortController = new AbortController()
	deps.onAbortReady?.(() => {
		abortController.abort()
	})

	let disconnected = false

	let prevStatus: string | undefined = String(store.state.nodesById[nodeId]?.blenderSettings?.mcpStatus || '')
	const unsubscribeWatch = store.watch(
		(state) => state.nodesById[nodeId]?.blenderSettings?.mcpStatus,
		(newStatus: string | undefined) => {
			const wasConnected = prevStatus === 'connected'
			prevStatus = newStatus
			const isDisconnectedState = newStatus === 'disconnected' || newStatus === 'error'
			if (wasConnected && isDisconnectedState && !disconnected) {
				disconnected = true
				abortController.abort()
			}
		}
	)

	const finishCurrentAssistant = (patch: Partial<WorkflowBlenderChatMessage> = {}) => {
		if (!currentAssistantMsgId) return
		store.commit('updateBlenderChatMessage', {
			nodeId,
			messageId: currentAssistantMsgId,
			patch: { isThinking: false, isStreaming: false, isStreamingThinking: false, ...patch }
		})
		currentAssistantMsgId = ''
	}

	const discardCurrentAssistant = () => {
		store.commit('removeBlenderChatMessage', { nodeId, messageId: currentAssistantMsgId })
		currentAssistantMsgId = ''
		currentContent = ''
		currentThinkingContent = ''
	}

	const toolMsgMap = new Map<string, string>()
	const activeToolCalls = new Map<string, { msgId: string; name: string; args: Record<string, unknown> }>()

	const autoSaveToWorkspace = async (toolName: string, inputArgs: Record<string, unknown>, output: unknown, eventImages?: Array<{ mimeType: string; dataUrl: string; fileName?: string }>): Promise<string[]> => {
		const savedUrls: string[] = []
		try {
			if (!window.dweb?.blender?.workspaceSaveScript && !window.dweb?.blender?.workspaceSaveScreenshot) return savedUrls
			if (!projectId) return savedUrls

			if (toolName === 'blender_execute_blender_code' && inputArgs.code) {
				const code = String(inputArgs.code)
				const resultSummary = formatToolResultDisplay(output).summary || ''
				await window.dweb.blender.workspaceSaveScript({
					nodeId,
					projectId,
					code,
					summary: resultSummary.slice(0, 200)
				})
			}

			const isScreenshotTool = toolName.includes('screenshot')
			const hasEventImages = eventImages && eventImages.length > 0
			if (isScreenshotTool || hasEventImages) {
				let saved = false
				if (eventImages && eventImages.length > 0) {
					for (const img of eventImages) {
						const base64Match = img.dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
						const base64Data = base64Match ? base64Match[2] : img.dataUrl
						const mimeType = base64Match ? base64Match[1] : (img.mimeType || 'image/png')
						console.log(`[BlenderWorkspace] Saving screenshot from event.images to workspace, mimeType=${mimeType}, dataLen=${base64Data.length}`)
						const saveResult = await window.dweb.blender.workspaceSaveScreenshot({
							nodeId,
							projectId,
							base64Data,
							mimeType
						})
						if (saveResult?.ok && saveResult.url) {
							savedUrls.push(saveResult.url)
						}
						saved = true
					}
				}
				if (!saved) {
					const imageData = extractImageFromToolOutput(output)
					if (imageData) {
						console.log(`[BlenderWorkspace] Saving screenshot (fallback from output) to workspace, mimeType=${imageData.mimeType}, dataLen=${imageData.base64Data.length}`)
						const saveResult = await window.dweb.blender.workspaceSaveScreenshot({
							nodeId,
							projectId,
							base64Data: imageData.base64Data,
							mimeType: imageData.mimeType
						})
						if (saveResult?.ok && saveResult.url) {
							savedUrls.push(saveResult.url)
						}
						saved = true
					}
				}
				if (!saved) {
					console.warn('[BlenderWorkspace] Screenshot tool returned no extractable image data. Output keys:',
						output && typeof output === 'object' ? Object.keys(output as Record<string, unknown>) : typeof output,
						'eventImages:', eventImages?.length || 0)
				}
			}
		} catch (err) {
			console.warn('[BlenderWorkspace] Auto-save failed:', err)
		}
		return savedUrls
	}

	function extractImageFromToolOutput(output: unknown): { base64Data: string; mimeType: string } | null {
		if (!output || typeof output !== 'object') return null

		const out = output as Record<string, unknown>

		if (Array.isArray(out.content)) {
			for (const part of out.content) {
				if (part && typeof part === 'object') {
					const p = part as Record<string, unknown>
					if (p.type === 'image' && typeof p.data === 'string' && p.data) {
						return {
							base64Data: p.data,
							mimeType: String(p.mimeType || 'image/png')
						}
					}
					if (p.type === 'image_url' && typeof p.url === 'string' && p.url.startsWith('data:image')) {
						const match = p.url.match(/^data:(image\/[^;]+);base64,(.+)$/)
						if (match) {
							return { base64Data: match[2], mimeType: match[1] }
						}
					}
				}
			}
		}

		if (Array.isArray(out.images)) {
			for (const img of out.images) {
				if (img && typeof img === 'object') {
					const p = img as Record<string, unknown>
					if (typeof p.data === 'string' && p.data) {
						return {
							base64Data: p.data,
							mimeType: String(p.mimeType || 'image/png')
						}
					}
					if (typeof p.url === 'string' && p.url.startsWith('data:image')) {
						const match = p.url.match(/^data:(image\/[^;]+);base64,(.+)$/)
						if (match) {
							return { base64Data: match[2], mimeType: match[1] }
						}
					}
				}
			}
		}

		if (typeof out.image === 'string' && out.image) {
			if (out.image.startsWith('data:image')) {
				const match = out.image.match(/^data:(image\/[^;]+);base64,(.+)$/)
				if (match) {
					return { base64Data: match[2], mimeType: match[1] }
				}
			}
			return { base64Data: out.image, mimeType: String(out.mimeType || 'image/png') }
		}

		if (typeof out.data === 'string' && out.data && out.type === 'image') {
			return { base64Data: out.data, mimeType: String(out.mimeType || 'image/png') }
		}

		if (out.result && typeof out.result === 'object') {
			return extractImageFromToolOutput(out.result)
		}

		if (out.value && typeof out.value === 'object') {
			return extractImageFromToolOutput(out.value)
		}

		return null
	}

	// 产物捕获（设计文档 §4.5）：视口截图 + 最终文本，会话结束写入 lastOutputs
	let capturedScreenshotUrl = ''
	const tryCaptureScreenshot = (_toolName: string, output: unknown, eventImages?: Array<{ mimeType: string; dataUrl: string; fileName?: string }>) => {
		if (eventImages && eventImages.length > 0) {
			const img = eventImages[0]
			if (img.dataUrl.startsWith('data:image')) {
				capturedScreenshotUrl = img.dataUrl
			} else {
				capturedScreenshotUrl = `data:${img.mimeType || 'image/png'};base64,${img.dataUrl}`
			}
			return
		}
		const imageData = extractImageFromToolOutput(output)
		if (imageData) {
			capturedScreenshotUrl = `data:${imageData.mimeType};base64,${imageData.base64Data}`
		}
	}

	try {
		const chatBridge = getAgentChatBridge()

		const context = buildBlenderContext(store, nodeId, realConnected, workspaceInfo)
		const toolNames = [...BLENDER_TOOL_NAMES]
		const effectiveTools = toolNames
		const systemPrompt = buildBlenderSystemPrompt(context, toolNames)
		const attachments = mergedAttachments

		let globalAgentSettings = getCachedAgentSettings()
		try {
			globalAgentSettings = await loadAgentSettings()
		} catch {}

		const rawThinking = String(settings.thinkingEffort || '').trim()
		const thinkingEffort = (['disabled', 'low', 'medium', 'high'].includes(rawThinking)
			? rawThinking
			: 'medium') as 'disabled' | 'low' | 'medium' | 'high'

		const session = await chatBridge.createSession(backend, {
			title: prompt.slice(0, 24),
			model,
			projectId
		})
		const sessionId = session.id

		let receivedAnyContent = false
		let receivedError = false
		let aborted = false
		let lastContextUsage: { tokenCount: number; budget: number; usage: number; truncated: boolean } | null = null

		for await (const ev of chatBridge.sendMessage(
			backend,
			sessionId,
			{
				content: prompt,
				model,
				history,
				systemPrompt,
				tools: effectiveTools,
				attachments,
				thinkingEffort,
				maxToolCalls: globalAgentSettings.maxToolCalls,
				enableToolCallWarning: globalAgentSettings.enableToolCallWarning !== false
			},
			abortController.signal
		) as AsyncGenerator<ChatStreamEvent, void, void>) {
			if (abortController.signal.aborted) {
				aborted = true
				break
			}
			if (ev.type === 'done' || ev.type === 'turn_done') break
			if (ev.type === 'error') {
				receivedError = true
				ensureAssistantMsg()
				const errText = currentContent + (currentContent ? '\n\n' : '') + `❌ 错误：${ev.message}`
				finishCurrentAssistant({ content: errText, isError: true })
				deps.pushToast?.(`Blender Agent错误：${ev.message}`, 'error')
				break
			}
			if (ev.type === 'text_delta') {
				ensureAssistantMsg()
				receivedAnyContent = true
				currentContent += ev.content
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: currentAssistantMsgId,
					patch: { content: currentContent, isThinking: false, isStreaming: true, isStreamingThinking: false }
				})
				continue
			}
			if (ev.type === 'thinking_delta') {
				ensureAssistantMsg()
				currentThinkingContent += ev.content
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: currentAssistantMsgId,
					patch: {
						thinkingContent: currentThinkingContent,
						isThinking: true,
						isStreamingThinking: true
					}
				})
				continue
			}
			if (ev.type === 'thought') {
				ensureAssistantMsg()
				currentThinkingContent = ev.content
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: currentAssistantMsgId,
					patch: {
						thinkingContent: currentThinkingContent,
						isThinking: false,
						isStreamingThinking: false,
						thinkingCollapsed: true
					}
				})
				continue
			}
			if (ev.type === 'command_started') {
				const cmdStr = Array.isArray(ev.command) ? ev.command.join(' ') : String(ev.command || '')
				const cmdMsgId = ev.messageId || makeMsgId()
				const cmdMsg: WorkflowBlenderChatMessage = {
					id: cmdMsgId,
					role: 'command',
					content: `⚙️ 执行命令: ${cmdStr.slice(0, 100)}`,
					timestamp: Date.now(),
					command: cmdStr,
					status: 'running',
					collapsed: true
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: cmdMsg })
				continue
			}
			if (ev.type === 'command_completed') {
				continue
			}
			if (ev.type === 'plan_update') {
				const planMsg: WorkflowBlenderChatMessage = {
					id: makeMsgId(),
					role: 'system',
					content: `📋 ${String(ev.explanation || '计划更新')}`,
					timestamp: Date.now()
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: planMsg })
				continue
			}
			if (ev.type === 'tool_call_start') {
				const tcId = ev.toolCallId || `tool-${ev.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
				const toolName = ev.tool || 'unknown'
				const toolDisplay = getToolDisplayName(toolName)
				const toolMsgId = makeMsgId()
				const toolArgs = (ev.input as Record<string, unknown>) || {}
				const toolMsg: WorkflowBlenderChatMessage = {
					id: toolMsgId,
					role: 'tool_call',
					content: `🔧 ${toolDisplay}...`,
					timestamp: Date.now(),
					toolName,
					toolArgs,
					toolCallId: tcId,
					status: 'running',
					collapsed: true
				}
				if (currentAssistantMsgId) {
					if (currentContent.trim() || currentThinkingContent.trim()) {
						finishCurrentAssistant()
					} else {
						discardCurrentAssistant()
					}
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: toolMsg })
				toolMsgMap.set(tcId, toolMsgId)
				activeToolCalls.set(tcId, { msgId: toolMsgId, name: toolName, args: toolArgs })
				continue
			}
			if (ev.type === 'tool_call_end') {
				const tcId = ev.toolCallId || Array.from(activeToolCalls.keys()).pop() || ''
				const toolMsgId = toolMsgMap.get(tcId)
				const activeTc = tcId ? activeToolCalls.get(tcId) : null
				const toolName = ev.tool || activeTc?.name || 'unknown'
				const toolDisplay = getToolDisplayName(toolName)
				const toolArgs = activeTc?.args || (ev as unknown as { input?: Record<string, unknown> }).input || {}
				const eventImages = ev.images
				tryCaptureScreenshot(toolName, ev.output, eventImages)
				const { summary, detail } = formatToolResultDisplay(ev.output)
				const outRec = (ev.output && typeof ev.output === 'object') ? ev.output as Record<string, unknown> : null
				const hasError = !!(outRec && (
					('isError' in outRec && outRec.isError) ||
					('ok' in outRec && outRec.ok === false)
				))
				if (toolMsgId) {
					const hasScreenshot = eventImages && eventImages.length > 0
					store.commit('updateBlenderChatMessage', {
						nodeId,
						messageId: toolMsgId,
						patch: {
							content: `${hasError ? '❌' : '✅'} ${toolDisplay}${summary ? ' — ' + summary : ''}`,
							toolResult: ev.output,
							toolError: hasError ? (detail || '执行出错') : undefined,
							status: hasError ? 'error' : 'completed',
							isError: hasError,
							collapsed: !hasError,
							screenshots: undefined
						}
					})
					if (!hasError) {
						autoSaveToWorkspace(toolName, toolArgs, ev.output, eventImages).then((savedUrls) => {
							if (savedUrls.length > 0) {
								store.commit('updateBlenderChatMessage', {
									nodeId,
									messageId: toolMsgId,
									patch: {
										screenshots: savedUrls
									}
								})
							}
							if (savedUrls.length > 0 && !capturedScreenshotUrl) {
								capturedScreenshotUrl = savedUrls[savedUrls.length - 1]
							}
						})
					}
					activeToolCalls.delete(tcId)
				}
				continue
			}
			if (ev.type === 'tool_call_error') {
				const tcId = ev.toolCallId || Array.from(activeToolCalls.keys()).pop() || ''
				const toolMsgId = toolMsgMap.get(tcId)
				const toolName = ev.tool || (tcId ? activeToolCalls.get(tcId)?.name : null) || 'unknown'
				const toolDisplay = getToolDisplayName(toolName)
				let errDetail = ev.error || '未知错误'

				if (errDetail.includes('does not exist') || errDetail.includes('Tool not found')) {
					errDetail = '⚠️ 工具未注册，请点击节点上的"挂载工具"按钮重新挂载'
				} else if (errDetail.includes('未连接') || errDetail.includes('disconnected')) {
					errDetail = '⚠️ Blender未连接，请先点击"连接"按钮连接Blender'
				}

				if (toolMsgId) {
					store.commit('updateBlenderChatMessage', {
						nodeId,
						messageId: toolMsgId,
						patch: {
							content: `❌ ${toolDisplay}失败：${errDetail.slice(0, 200)}`,
							toolError: errDetail,
							status: 'error',
							isError: true,
							collapsed: false
						}
					})
					activeToolCalls.delete(tcId)
				} else {
					const errMsg: WorkflowBlenderChatMessage = {
						id: makeMsgId(),
						role: 'tool_result',
						content: `❌ ${toolDisplay}失败：${errDetail}`,
						timestamp: Date.now(),
						toolName,
						toolError: errDetail,
						toolCallId: tcId,
						status: 'error',
						isError: true
					}
					store.commit('appendBlenderChatMessage', { nodeId, message: errMsg })
				}
				continue
			}
			if (ev.type === 'context_usage') {
				lastContextUsage = {
					tokenCount: Number(ev.tokenCount) || 0,
					budget: Number(ev.budget) || 0,
					usage: Number(ev.usage) || 0,
					truncated: !!ev.truncated
				}
				store.commit('setBlenderChatContextUsage', { nodeId, usage: lastContextUsage })
				continue
			}
			if (ev.type === 'assistant_done') {
				if (ev.content && ev.content.trim()) {
					ensureAssistantMsg()
					currentContent = ev.content
					finishCurrentAssistant({ content: currentContent })
				} else {
					finishCurrentAssistant()
				}
				continue
			}
		}

		if (aborted) {
			if (currentAssistantMsgId) {
				if (currentContent.trim()) {
					finishCurrentAssistant({
						content: currentContent + '\n\n⏹ 已停止生成'
					})
				} else {
					store.commit('updateBlenderChatMessage', {
						nodeId,
						messageId: currentAssistantMsgId,
						patch: { content: '⏹ 已停止生成', isThinking: false, isStreaming: false }
					})
				}
			} else {
				const stopMsg: WorkflowBlenderChatMessage = {
					id: makeMsgId(),
					role: 'assistant',
					content: '⏹ 已停止生成',
					timestamp: Date.now()
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: stopMsg })
			}
			for (const info of activeToolCalls.values()) {
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: info.msgId,
					patch: { content: `⏹ ${info.name} 已中止`, status: 'error', isError: true, collapsed: false }
				})
			}
			activeToolCalls.clear()
		} else if (!receivedError && !receivedAnyContent && !currentContent.trim()) {
			if (currentAssistantMsgId) {
				finishCurrentAssistant({
					content: '（Agent未返回有效内容，请检查Blender连接状态或重试）',
					isError: true
				})
			}
		} else {
			if (currentAssistantMsgId) {
				if (currentContent.trim() || currentThinkingContent.trim()) {
					finishCurrentAssistant()
				} else {
					discardCurrentAssistant()
				}
			}
			// 会话正常结束：归档产物供 out-0 下游取数（设计文档 §4.5）
			const outputs: { text?: string; imageUrl?: string } = {}
			if (currentContent.trim()) outputs.text = currentContent.trim()
			if (capturedScreenshotUrl) outputs.imageUrl = capturedScreenshotUrl
			if (outputs.text || outputs.imageUrl) {
				store.commit('setBlenderLastOutputs', { nodeId, outputs })
			}
		}
	} catch (err) {
		const e = err as { name?: string; message?: string }
		if (e?.name === 'AbortError' || abortController.signal.aborted) {
			if (currentAssistantMsgId) {
				finishCurrentAssistant({
					content: currentContent + (currentContent ? '\n\n' : '') + '⏹ 已停止生成'
				})
			} else {
				const stopMsg: WorkflowBlenderChatMessage = {
					id: makeMsgId(),
					role: 'assistant',
					content: '⏹ 已停止生成',
					timestamp: Date.now()
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: stopMsg })
			}
			for (const info of activeToolCalls.values()) {
				store.commit('updateBlenderChatMessage', {
					nodeId,
					messageId: info.msgId,
					patch: { content: `⏹ ${info.name} 已中止`, status: 'error', isError: true, collapsed: false }
				})
			}
			activeToolCalls.clear()
		} else {
			const errMsg = e?.message || String(err)
			if (currentAssistantMsgId) {
				finishCurrentAssistant({
					content: currentContent + (currentContent ? '\n\n' : '') + `❌ 错误：${errMsg}`,
					isError: true
				})
			} else {
				const errChatMsg: WorkflowBlenderChatMessage = {
					id: makeMsgId(),
					role: 'assistant',
					content: `❌ 错误：${errMsg}`,
					timestamp: Date.now(),
					isError: true
				}
				store.commit('appendBlenderChatMessage', { nodeId, message: errChatMsg })
			}
			deps.pushToast?.(`Blender Agent错误：${errMsg}`, 'error')
		}
	} finally {
		unsubscribeWatch()
		// 清理残留的空assistant消息（isThinking=true但无内容、无thinking的消息）
		const node = store.state.nodesById[nodeId]
		const msgs = node?.blenderSettings?.chatMessages
		if (Array.isArray(msgs)) {
			const staleIds: string[] = []
			for (const m of msgs) {
				if (
					m &&
					m.role === 'assistant' &&
					m.isThinking &&
					!m.isStreaming &&
					!m.isStreamingThinking &&
					(!m.content || !String(m.content).trim()) &&
					(!m.thinkingContent || !String(m.thinkingContent).trim())
				) {
					staleIds.push(m.id)
				}
			}
			for (const staleId of staleIds) {
				store.commit('removeBlenderChatMessage', { nodeId, messageId: staleId })
			}
		}
		store.commit('setBlenderResponding', { nodeId, responding: false })
		deps.onAbortReady?.(() => {})
	}
}
