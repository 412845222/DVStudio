/**
 * 导演控制台 MCP 工具注册
 *
 * 注册所有 dc_* 工具到 ToolExecutor。
 * 这些工具没有 in-process handler，调用时通过 IPC 转发到导演控制台渲染进程执行。
 * 渲染进程的 DirectorConsoleToolHandler 监听 dweb:builtin-tool:call 并分发到 DirectorSceneViewer。
 */

import { getToolExecutor } from '../toolExecutor.mjs'
import logger from '../../../core/logger.mjs'

/**
 * 注册导演控制台所有 dc_* 工具。
 * 在后端初始化时调用一次。
 */
export function registerDirectorConsoleTools() {
	const executor = getToolExecutor()

	// ========== 角色工具 ==========

	executor.registerTool(
		'dc_add_character',
		'在导演控制台场景中添加一个角色占位。返回角色ID，后续可通过该ID设置位置、父子关系和关键帧。',
		{
			type: 'object',
			properties: {
				name: { type: 'string', description: '角色名称，如主角、反派' },
				color: { type: 'string', description: '占位颜色十六进制，如#ff5500' },
				position: {
					type: 'object',
					description: '初始世界坐标，缺省放置在相机目标点',
					properties: {
						x: { type: 'number' },
						y: { type: 'number' },
						z: { type: 'number' }
					}
				}
			},
			required: ['name']
		}
	)

	executor.registerTool(
		'dc_set_character_transform',
		'设置指定角色的变换（位置/旋转/缩放）。每次设置一个轴的值。',
		{
			type: 'object',
			properties: {
				characterId: { type: 'string', description: '角色ID' },
				kind: { type: 'string', enum: ['position', 'rotation', 'scale'] },
				axis: { type: 'string', enum: ['x', 'y', 'z'] },
				value: { type: 'number' }
			},
			required: ['characterId', 'kind', 'axis', 'value']
		}
	)

	executor.registerTool(
		'dc_set_character_parent',
		'设置角色的父级角色，建立层级关系。子角色会跟随父角色移动。parentId传null则挂到场景根。',
		{
			type: 'object',
			properties: {
				childId: { type: 'string' },
				parentId: { type: ['string', 'null'] }
			},
			required: ['childId']
		}
	)

	executor.registerTool(
		'dc_list_characters',
		'列出场景中所有角色及其ID、名称、位置，用于Agent了解当前场景状态。'
	)

	// ========== 摄像头工具 ==========

	executor.registerTool(
		'dc_add_camera',
		'在场景中添加一个摄像头。导演控制台必须有摄像头才能记录关键帧和导出视频。'
	)

	executor.registerTool(
		'dc_set_camera_transform',
		'设置摄像头的位置和看向目标点（target），用于构图。',
		{
			type: 'object',
			properties: {
				position: {
					type: 'object',
					properties: {
						x: { type: 'number' },
						y: { type: 'number' },
						z: { type: 'number' }
					},
					required: ['x', 'y', 'z']
				},
				target: {
					type: 'object',
					properties: {
						x: { type: 'number' },
						y: { type: 'number' },
						z: { type: 'number' }
					},
					required: ['x', 'y', 'z']
				}
			},
			required: ['position', 'target']
		}
	)

	executor.registerTool(
		'dc_set_camera_parent',
		'将摄像头挂载到指定角色下，摄像头会跟随该角色移动（第三人称跟随）。parentId传null则挂回场景根。',
		{
			type: 'object',
			properties: {
				parentId: { type: ['string', 'null'], description: '角色ID，null表示挂到场景根' }
			}
		}
	)

	// ========== 时间轴关键帧工具 ==========

	executor.registerTool(
		'dc_set_timeline',
		'设置时间轴的帧率和总帧数，决定动画时长。默认30fps、150帧(5秒)。',
		{
			type: 'object',
			properties: {
				fps: { type: 'integer', minimum: 1, maximum: 120 },
				totalFrames: { type: 'integer', minimum: 1 }
			}
		}
	)

	executor.registerTool(
		'dc_add_camera_keyframe',
		'在指定帧添加摄像头关键帧，记录当前摄像头的位置和朝向。先调用dc_set_camera_transform设置相机，再调用此工具记录关键帧。',
		{
			type: 'object',
			properties: {
				frame: { type: 'integer', minimum: 0, description: '关键帧所在帧号' }
			},
			required: ['frame']
		}
	)

	executor.registerTool(
		'dc_add_character_keyframe',
		'在指定帧为角色添加关键帧，记录角色当前位置/旋转/缩放。会级联到该角色的所有子角色。',
		{
			type: 'object',
			properties: {
				characterId: { type: 'string' },
				frame: { type: 'integer', minimum: 0 }
			},
			required: ['characterId', 'frame']
		}
	)

	executor.registerTool('dc_seek_frame', '跳转到指定帧，预览该帧的角色与摄像头状态。', {
		type: 'object',
		properties: {
			frame: { type: 'integer', minimum: 0 }
		},
		required: ['frame']
	})

	// ========== 综合工具 ==========

	executor.registerTool(
		'dc_get_scene_state',
		'获取导演控制台当前完整状态：场景布局（房间、墙壁、家具的位置和尺寸）、角色列表、摄像头、时间轴关键帧。场景布局数据包含墙壁位置和房间结构，用于规划角色放置位置和相机运镜路径。'
	)

	executor.registerTool(
		'dc_export_video',
		'将当前时间轴动画导出为MP4视频，返回资产URL。导出后可在蓝图中自动连线到下游视频节点。'
	)

	// ========== 镜头预览截图工具 ==========

	executor.registerTool(
		'dc_capture_camera_preview',
		'捕获当前镜头预览画面（从摄像头位置朝target方向渲染）为PNG图片，用于检查镜头构图是否合适、镜头是否过低或位置不合理。可指定frame跳转到目标帧后截图（检查关键帧位置镜头效果）。返回base64 dataURL图片。',
		{
			type: 'object',
			properties: {
				frame: {
					type: 'integer',
					minimum: 0,
					description:
						'可选：跳转到该帧后截图（检查关键帧位置镜头是否过低或构图是否合理）。不传则截当前帧。'
				}
			}
		}
	)

	logger.info('[DirectorConsoleTools] 注册了 13 个 dc_* 导演控制台工具')
}
