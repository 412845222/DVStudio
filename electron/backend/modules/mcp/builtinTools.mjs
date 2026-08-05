/**
 * DVStudio 内置 MCP 工具注册
 *
 * 使用统一的ToolExecutor注册与工作流蓝图相关的内置工具。
 */

import { getToolExecutor } from './toolExecutor.mjs'
import logger from '../../core/logger.mjs'

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

	executor.registerIPCBridge()
	logger.info('DVStudio builtin tools registered via ToolExecutor')
}
