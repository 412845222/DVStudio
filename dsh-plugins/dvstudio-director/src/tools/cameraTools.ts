/**
 * 摄像头工具（3 个 dc_* 工具）
 */

import { callAction } from '../client.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'

export function registerCameraTools(ctx: any) {
	// dc_add_camera
	ctx.tools.register(
		defineTool({
			name: 'dc_add_camera',
			description: '在场景中添加一个摄像头。导演控制台必须有摄像头才能记录关键帧和导出视频。',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						cameraId: { type: 'string' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; cameraId?: string; error?: string }
					if (v?.ok) return [{ type: 'text', text: `摄像头已添加，ID: ${v.cameraId}` }]
					return [{ type: 'text', text: `添加失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(_args: any) {
				return await callAction({ action: 'dc_add_camera' })
			}
		})
	)

	// dc_set_camera_transform
	ctx.tools.register(
		defineTool({
			name: 'dc_set_camera_transform',
			description: '设置摄像头的位置和看向目标点（target），用于构图。',
			parameters: {
				position: {
					type: 'object',
					description: '摄像头位置',
					required: true,
					additionalProperties: true,
					properties: {
						x: { type: 'number', required: true },
						y: { type: 'number', required: true },
						z: { type: 'number', required: true }
					}
				},
				target: {
					type: 'object',
					description: '看向的目标点',
					required: true,
					additionalProperties: true,
					properties: {
						x: { type: 'number', required: true },
						y: { type: 'number', required: true },
						z: { type: 'number', required: true }
					}
				}
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; error?: string }
					if (v?.ok) return [{ type: 'text', text: '相机变换已设置' }]
					return [{ type: 'text', text: `设置失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_set_camera_transform', ...args })
			}
		})
	)

	// dc_set_camera_parent
	ctx.tools.register(
		defineTool({
			name: 'dc_set_camera_parent',
			description:
				'将摄像头挂载到指定角色下，摄像头会跟随该角色移动（第三人称跟随）。parentId传"null"字符串表示挂回场景根。',
			parameters: {
				parentId: { type: 'string', description: '角色ID，传"null"表示挂到场景根' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; error?: string }
					if (v?.ok) return [{ type: 'text', text: '相机挂载已设置' }]
					return [{ type: 'text', text: `设置失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_set_camera_parent', ...args })
			}
		})
	)
}
