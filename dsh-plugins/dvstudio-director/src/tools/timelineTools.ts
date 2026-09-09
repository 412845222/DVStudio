/**
 * 时间轴关键帧工具（4 个 dc_* 工具）
 */

import { callAction } from '../client.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'

export function registerTimelineTools(ctx: any) {
	// dc_set_timeline
	ctx.tools.register(
		defineTool({
			name: 'dc_set_timeline',
			description: '设置时间轴的帧率和总帧数，决定动画时长。默认30fps、150帧(5秒)。',
			parameters: {
				fps: { type: 'integer', description: '帧率，1-120' },
				totalFrames: { type: 'integer', description: '总帧数' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						fps: { type: 'number' },
						totalFrames: { type: 'number' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; fps?: number; totalFrames?: number; error?: string }
					if (v?.ok)
						return [{ type: 'text', text: `时间轴已设置：${v.fps}fps × ${v.totalFrames}帧` }]
					return [{ type: 'text', text: `设置失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_set_timeline', ...args })
			}
		})
	)

	// dc_add_camera_keyframe
	ctx.tools.register(
		defineTool({
			name: 'dc_add_camera_keyframe',
			description:
				'在指定帧添加摄像头关键帧，记录当前摄像头的位置和朝向。先调用dc_set_camera_transform设置相机，再调用此工具记录关键帧。',
			parameters: {
				frame: { type: 'integer', description: '关键帧所在帧号（≥0）', required: true }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						frame: { type: 'number' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; frame?: number; error?: string }
					if (v?.ok) return [{ type: 'text', text: `第 ${v.frame} 帧摄像头关键帧已记录` }]
					return [{ type: 'text', text: `记录失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_add_camera_keyframe', ...args })
			}
		})
	)

	// dc_add_character_keyframe
	ctx.tools.register(
		defineTool({
			name: 'dc_add_character_keyframe',
			description:
				'在指定帧为角色添加关键帧，记录角色当前位置/旋转/缩放。会级联到该角色的所有子角色。',
			parameters: {
				characterId: { type: 'string', description: '角色ID', required: true },
				frame: { type: 'integer', description: '帧号（≥0）', required: true }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						frame: { type: 'number' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; frame?: number; error?: string }
					if (v?.ok) return [{ type: 'text', text: `第 ${v.frame} 帧角色关键帧已记录` }]
					return [{ type: 'text', text: `记录失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_add_character_keyframe', ...args })
			}
		})
	)

	// dc_seek_frame
	ctx.tools.register(
		defineTool({
			name: 'dc_seek_frame',
			description: '跳转到指定帧，预览该帧的角色与摄像头状态。',
			parameters: {
				frame: { type: 'integer', description: '帧号（≥0）', required: true }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						frame: { type: 'number' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; frame?: number; error?: string }
					if (v?.ok) return [{ type: 'text', text: `已跳转到第 ${v.frame} 帧` }]
					return [{ type: 'text', text: `跳转失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_seek_frame', ...args })
			}
		})
	)
}
