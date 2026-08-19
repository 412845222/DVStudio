/**
 * DVStudio 内置 MCP 工具注册
 *
 * 使用统一的ToolExecutor注册与工作流蓝图相关的内置工具。
 */

import { getToolExecutor } from './toolExecutor.mjs'
import logger from '../../core/logger.mjs'
import fs from 'node:fs'
import path from 'node:path'

/**
 * P3: 生成图片的复合 MCP 工具（generate_image）
 *
 * 流程：create_node(image-generation) → execute_node → 轮询完成 → get_node_info → fs copy 到 outputPath(可选)
 * 返回：{ nodeId, outputFiles, exportedFiles }，该结构会被 Agent Runtime 写入 assistant message，
 * 前端 useCLIAgentTrigger 的 JSON 解析器可直接识别并写回 CLI Control Server 的 completed 状态
 */
async function generateImageHandler(args, { requestId }) {
	const executor = getToolExecutor()
	const prompt = String(args?.prompt || '').trim()
	if (!prompt) throw new Error('prompt is required (non-empty string)')

	const width = typeof args?.width === 'number' ? Math.max(64, Math.floor(args.width)) : undefined
	const height = typeof args?.height === 'number' ? Math.max(64, Math.floor(args.height)) : undefined
	const aspectRatio = typeof args?.aspectRatio === 'string' ? args.aspectRatio : undefined
	const negativePrompt = typeof args?.negativePrompt === 'string' ? args.negativePrompt : undefined
	const model = typeof args?.model === 'string' ? args.model : undefined
	const imageCount = typeof args?.imageCount === 'number' ? Math.max(1, Math.min(16, Math.floor(args.imageCount))) : 1
	const seed = typeof args?.seed === 'number' ? Math.floor(args.seed) : undefined
	const outputPath = typeof args?.outputPath === 'string' ? args.outputPath || '' : ''
	const autoExport = args?.autoExport !== false
	const references = Array.isArray(args?.references) ? args.references.filter((x) => typeof x === 'string' && x) : undefined

	// 1. 构造 image-generation 节点配置（兼容多种配置字段名，未被识别的会被节点内部忽略，不影响主流程）
	const nodeConfig = {
		prompt,
		...(negativePrompt ? { negativePrompt, negative_prompt: negativePrompt } : {}),
		...(typeof width === 'number' ? { width } : {}),
		...(typeof height === 'number' ? { height } : {}),
		...(aspectRatio ? { aspectRatio, aspect_ratio: aspectRatio } : {}),
		...(model ? { model, modelKey: model } : {}),
		...(typeof imageCount === 'number' ? { imageCount, count: imageCount, numImages: imageCount } : {}),
		...(typeof seed === 'number' ? { seed } : {}),
		...(Array.isArray(references) && references.length ? { references, referenceImages: references } : {})
	}

	// 2. create_node
	const title = `CLI图片 ${prompt.slice(0, 18)}${prompt.length > 18 ? '…' : ''}`
	const createRes = await executor.callTool('create_node', {
		type: 'image-generation',
		title,
		config: nodeConfig
	}, { skipFrontend: false })
	const nodeId = String(createRes?.nodeId || createRes?.id || '')
	if (!nodeId) {
		throw new Error(`create_node did not return nodeId. createRes=${JSON.stringify(createRes).slice(0, 400)}`)
	}
	logger.info(`[generate_image][${requestId}] created node=${nodeId}`)

	// 3. execute_node（超时 5 分钟，图片生成可能需要较长时间）
	const IPC_TIMEOUT_5MIN = 5 * 60 * 1000
	const execRes = await executor.callTool('execute_node', { nodeId }, { skipFrontend: false, timeoutMs: IPC_TIMEOUT_5MIN })
	logger.info(`[generate_image][${requestId}] execute_node submitted. node=${nodeId}`, execRes ? `submitted=${JSON.stringify(execRes).slice(0,200)}` : '')

	// 4. 轮询 list_node_tasks，等待该节点有 completed / failed 状态的任务
	const WAIT_START = Date.now()
	const WAIT_TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟
	const POLL_MS = 2500
	const POLL_IPC_TIMEOUT = 30 * 1000 // list_node_tasks 查询超时 30s
	let finalTask = null
	while (Date.now() - WAIT_START < WAIT_TIMEOUT_MS) {
		const tasksRes = await executor.callTool('list_node_tasks', { nodeId }, { skipFrontend: false, timeoutMs: POLL_IPC_TIMEOUT })
		const tasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : (Array.isArray(tasksRes) ? tasksRes : [])
		const sorted = tasks
			.filter((t) => t && (t.nodeId === nodeId || !nodeId))
			.sort((a, b) => (Number(b.createdAt || b.created_at || 0) - Number(a.createdAt || a.created_at || 0)))
		// 取该节点最新的一个任务
		const latest = sorted[0]
		if (latest) {
			const st = String(latest.status || '').toLowerCase()
			if (st === 'completed') { finalTask = latest; break }
			if (st === 'failed' || st === 'canceled') { finalTask = latest; break }
		}
		await new Promise((r) => setTimeout(r, POLL_MS))
	}
	if (!finalTask) {
		throw new Error(`execute_node timed out (>${WAIT_TIMEOUT_MS}ms) waiting for node ${nodeId}`)
	}
	const finalStatus = String(finalTask.status || '').toLowerCase()
	if (finalStatus === 'failed') {
		const msg = finalTask.error?.message || finalTask.error || finalTask.errMsg || '生成失败'
		throw new Error(`image generation failed for node ${nodeId}: ${String(msg)}`)
	}
	if (finalStatus === 'canceled') {
		throw new Error(`image generation canceled for node ${nodeId}`)
	}

	// 5. get_node_info 获取输出文件
	let outputFiles = Array.isArray(finalTask?.outputFiles)
		? finalTask.outputFiles.filter(Boolean)
		: []
	if (outputFiles.length === 0) {
		const info = await executor.callTool('get_node_info', { nodeId }, { skipFrontend: false, timeoutMs: 30 * 1000 })
		const maybe = info?.outputFiles || info?.outputs || info?.output || info?.result
		if (Array.isArray(maybe)) outputFiles = maybe.filter((x) => typeof x === 'string' && x)
		else if (typeof maybe === 'string' && maybe) outputFiles = [maybe]
	}
	// 若最终仍没有文件，返回空（P2解析逻辑视为成功但stub）
	const exportedFiles = []

	// 6. 如果指定了 outputPath 且 autoExport=true，尝试复制
	if (autoExport && outputPath && outputFiles.length > 0) {
		try {
			const outParsed = path.parse(outputPath)
			const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null
			const destIsDir = stat ? stat.isDirectory() : !outParsed.ext
			const destDir = destIsDir ? outputPath : outParsed.dir
			if (destDir && !fs.existsSync(destDir)) {
				fs.mkdirSync(destDir, { recursive: true })
			}
			for (let i = 0; i < outputFiles.length; i++) {
				const src = outputFiles[i]
				if (!fs.existsSync(src)) continue
				let dest
				if (destIsDir) {
					const srcName = path.basename(src)
					dest = path.join(outputPath, srcName)
				} else if (outputFiles.length === 1) {
					dest = outputPath
				} else {
					const ext = outParsed.ext || path.extname(src) || '.png'
					const base = outParsed.name || `image-${i}`
					dest = path.join(destDir || '.', `${base}_${i + 1}${ext}`)
				}
				fs.copyFileSync(src, dest)
				exportedFiles.push(dest)
				logger.debug(`[generate_image][${requestId}] copied output ${src} → ${dest}`)
			}
		} catch (copyErr) {
			// 复制失败不视为整体失败（因为图已经生成在节点output里了），但会记录警告
			logger.warn(`[generate_image][${requestId}] autoExport copy failed (non-fatal): ${copyErr?.message || copyErr}`)
		}
	}

	logger.info(`[generate_image][${requestId}] done. node=${nodeId} outputs=${outputFiles.length} exported=${exportedFiles.length}`)
	return {
		ok: true,
		nodeId,
		taskStatus: finalTask?.status || 'completed',
		outputFiles,
		exportedFiles,
		// 给 useCLIAgentTrigger JSON 解析器一个明确的结构，防止被嵌套 JSON 漏掉
		_jsonBridge: JSON.stringify({ nodeId, outputFiles, exportedFiles })
	}
}

/**
 * 注册 DVStudio 内置工具到统一工具执行器
 */
export function registerBuiltinTools() {
	const executor = getToolExecutor()

	// ========== get_blueprint_state ==========
	executor.registerTool(
		'get_blueprint_state',
		'获取当前工作流蓝图的状态，包括节点列表、连接关系、选中节点，以及viewport（视口位置与缩放信息）。在创建节点之前建议先调用此工具了解当前蓝图状态。',
		{
			type: 'object',
			properties: {
				includeNodes: {
					type: 'boolean',
					description: '是否包含节点详情，默认 true'
				},
				includeEdges: {
					type: 'boolean',
					description: '是否包含连接详情，默认 true'
				}
			}
		}
	)

	// ========== list_node_types ==========
	executor.registerTool('list_node_types', '列出 DVStudio 支持的节点类型，可按分类筛选', {
		type: 'object',
		properties: {
			category: {
				type: 'string',
				description: '节点分类，如 image、video、3d、text、control 等，可选'
			}
		}
	})

	// ========== create_node ==========
	executor.registerTool(
		'create_node',
		'在工作流蓝图中创建新节点。重要提示：新节点会自动放置在用户当前蓝图视口中心（自动避开已有节点），你不需要也不应该传入position/x/y参数。创建前建议先调用 list_node_types 获取正确的节点类型ID。',
		{
			type: 'object',
			required: ['type'],
			properties: {
				type: {
					type: 'string',
					description:
						'节点类型ID，必须是list_node_types返回的有效type值。常用类型：text-generation(文本节点), image-generation(图片节点), video-generation(视频节点), scene-understanding(场景理解), scene-layout(场景布局), scene-decompose(场景拆解), comfyui(ComfyUI), model3d(3D模型), rotate-image(旋转图片), unreal-export(Unreal导出)'
				},
				title: {
					type: 'string',
					description: '节点显示名称/标题，可选。不指定则使用节点类型默认名称'
				},
				alias: {
					type: 'string',
					description: '节点别名，可选'
				},
				config: {
					type: 'object',
					description: '节点初始配置参数，可选'
				}
			}
		}
	)

	// ========== delete_node ==========
	executor.registerTool('delete_node', '删除工作流蓝图中的指定节点，危险操作需要用户确认', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '要删除的节点 ID'
			},
			force: {
				type: 'boolean',
				description: '是否强制删除（跳过确认），默认 false'
			}
		}
	})

	// ========== update_node_config ==========
	executor.registerTool('update_node_config', '更新指定节点的配置参数', {
		type: 'object',
		required: ['nodeId', 'config'],
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID'
			},
			config: {
				type: 'object',
				description: '要更新的配置项，将与现有配置合并'
			}
		}
	})

	// ========== connect_nodes ==========
	executor.registerTool('connect_nodes', '连接两个节点的指定端口', {
		type: 'object',
		required: ['fromNode', 'fromPort', 'toNode', 'toPort'],
		properties: {
			fromNode: {
				type: 'string',
				description: '源节点 ID'
			},
			fromPort: {
				type: 'string',
				description: '源端口 ID（输出端口）'
			},
			toNode: {
				type: 'string',
				description: '目标节点 ID'
			},
			toPort: {
				type: 'string',
				description: '目标端口 ID（输入端口）'
			}
		}
	})

	// ========== disconnect_nodes ==========
	executor.registerTool('disconnect_nodes', '断开指定的连接', {
		type: 'object',
		properties: {
			edgeId: {
				type: 'string',
				description: '要断开的连接边 ID'
			},
			nodeId: {
				type: 'string',
				description: '节点ID（断开该节点所有连接）'
			},
			portType: {
				type: 'string',
				enum: ['input', 'output', 'all'],
				description: '端口类型，默认all'
			}
		}
	})

	// ========== get_project_info ==========
	executor.registerTool('get_project_info', '获取当前项目的基本信息', {
		type: 'object',
		properties: {}
	})

	// ========== get_node_info ==========
	executor.registerTool('get_node_info', '获取指定节点的详细信息，包括配置、输入输出端口、状态等', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID'
			}
		}
	})

	// ========== select_node ==========
	executor.registerTool('select_node', '选中指定节点，使其在画布中高亮显示', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '要选中的节点 ID'
			}
		}
	})

	// ========== set_node_text ==========
	executor.registerTool('set_node_text', '设置文本节点的文本内容或其他节点的提示词', {
		type: 'object',
		required: ['nodeId', 'text'],
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID'
			},
			text: {
				type: 'string',
				description: '要设置的文本内容'
			}
		}
	})

	// ========== execute_node ==========
	executor.registerTool('execute_node', '执行指定节点（提交生成任务），危险操作需要用户确认', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '要执行的节点 ID'
			}
		}
	})

	// ========== auto_layout ==========
	executor.registerTool(
		'auto_layout',
		'【仅在用户明确要求时使用】自动排列指定的节点。注意：不要在创建节点后自动调用此工具，节点创建时已自动放置在合适位置。',
		{
			type: 'object',
			properties: {
				nodeIds: {
					type: 'array',
					items: { type: 'string' },
					description:
						'要排列的节点ID列表。如果不提供，将只排列本次会话中新创建的节点，不会影响已有节点。'
				},
				direction: {
					type: 'string',
					enum: ['horizontal', 'vertical'],
					description: '布局方向，默认horizontal'
				},
				spacing: {
					type: 'number',
					description: '节点间距，默认200'
				}
			}
		}
	)

	// ========== list_node_tasks ==========
	executor.registerTool('list_node_tasks', '列出指定节点或所有节点的生成任务记录', {
		type: 'object',
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID，可选。不提供则列出所有任务'
			},
			status: {
				type: 'string',
				enum: ['pending', 'running', 'completed', 'failed', 'canceled'],
				description: '按状态筛选，可选'
			}
		}
	})

	// ========== generate_image (P3 新增：复合MCP工具) ==========
	executor.registerTool(
		'generate_image',
		'创建一个图片生成节点，配置参数后自动执行生成，等待完成后返回输出文件列表。这是一个高便捷的复合工具，等同于依次调用 create_node(type=image-generation) → update_node_config(可选) → execute_node → 轮询 list_node_tasks → get_node_info → (可选) 复制输出文件到 outputPath。当用户的请求包含提示词、参考图、尺寸、输出路径等参数时，优先使用该工具。',
		{
			type: 'object',
			required: ['prompt'],
			properties: {
				prompt: {
					type: 'string',
					description: '图片生成提示词（必填）'
				},
				references: {
					type: 'array',
					description: '参考图本地路径列表（可选），用于图生图、IP适配器、参考风格等',
					items: { type: 'string' }
				},
				width: {
					type: 'number',
					description: '图片宽度（像素，推荐 512/768/1024 等标准值，可选）'
				},
				height: {
					type: 'number',
					description: '图片高度（像素，可选）'
				},
				aspectRatio: {
					type: 'string',
					description: '宽高比，如 1:1、16:9、9:16、3:4、4:3（可选，如果指定了width/height则以实际像素为准）'
				},
				negativePrompt: {
					type: 'string',
					description: '负向提示词（可选）'
				},
				model: {
					type: 'string',
					description: '使用的生成模型名称或ID（可选，不指定使用当前节点默认）'
				},
				imageCount: {
					type: 'number',
					description: '生成图片数量（1-16，默认 1）'
				},
				seed: {
					type: 'number',
					description: '随机种子（可选，不传则随机）'
				},
				outputPath: {
					type: 'string',
					description: '生成完成后自动复制到的目标路径。当为目录时将输出逐个复制到目录下；当为文件路径且 imageCount=1 时复制为指定文件名；多个图时按 outputPath 命名规则加后缀（可选）'
				},
				autoExport: {
					type: 'boolean',
					description: '是否在生成完成后自动复制输出文件到 outputPath（默认 true）'
				},
				projectId: {
					type: 'number',
					description: '项目ID（可选，当前未使用，保留）'
				}
			}
		},
		generateImageHandler
	)

	executor.registerIPCBridge()
	logger.info('DVStudio builtin tools registered via ToolExecutor')
}
