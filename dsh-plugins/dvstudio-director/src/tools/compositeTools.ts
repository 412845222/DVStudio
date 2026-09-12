/**
 * 综合工具（2 个 dc_* 工具）
 */

import { callAction } from '../client.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'

export function registerCompositeTools(ctx: any) {
	// dc_get_scene_state
	ctx.tools.register(
		defineTool({
			name: 'dc_get_scene_state',
			description:
				'获取导演控制台当前完整状态：场景布局（房间、墙壁、家具的位置和尺寸）、角色列表、摄像头、时间轴关键帧。场景布局数据包含墙壁位置和房间结构，用于规划角色放置位置和相机运镜路径。',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						layout: { type: 'array', items: { type: 'object', additionalProperties: true } },
						characters: { type: 'array', items: { type: 'object', additionalProperties: true } },
						cameras: { type: 'array', items: { type: 'object', additionalProperties: true } },
						timeline: { type: 'object', additionalProperties: true },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; error?: string; characters?: any[]; sceneLayout?: any }
					if (v?.ok) {
						const totalItems = v.sceneLayout?.totalItems ?? 0
						const charCount = v.characters?.length ?? 0
						const roomCount = v.sceneLayout?.rooms?.length ?? 0
						const wallCount = v.sceneLayout?.walls?.length ?? 0
						const lines = [
							`场景状态：${totalItems} 个布局项（${roomCount} 个房间，${wallCount} 面墙），${charCount} 个角色`,
							JSON.stringify(v, null, 2)
						]
						return [{ type: 'text', text: lines.join('\n') }]
					}
					return [{ type: 'text', text: `获取失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(_args: any) {
				return await callAction({ action: 'dc_get_scene_state' })
			}
		})
	)

	// dc_export_video
	ctx.tools.register(
		defineTool({
			name: 'dc_export_video',
			description:
				'将当前时间轴动画导出为MP4视频，返回资产URL。导出后可在蓝图中自动连线到下游视频节点。',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						url: { type: 'string' },
						duration: { type: 'number' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; url?: string; duration?: number; error?: string }
					if (v?.ok) return [{ type: 'text', text: `导出成功：${v.url}（${v.duration || 0}秒）` }]
					return [{ type: 'text', text: `导出失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(_args: any) {
				return await callAction({ action: 'dc_export_video' })
			}
		})
	)

	// dc_capture_camera_preview
	ctx.tools.register(
		defineTool({
			name: 'dc_capture_camera_preview',
			description: [
				'捕获当前镜头预览画面为PNG图片（从摄像头位置朝target方向渲染）。',
				'用途：添加摄像头关键帧后调用本工具检查镜头构图，判断是否需要调整摄像头位置、target或FOV。',
				'常见检查点：镜头是否过低（看到地面太多）、是否过高（俯视感强）、主体是否在画面中心、画面是否被墙壁遮挡。',
				'可传 frame 跳转到指定帧后截图（例如检查关键帧位置的镜头效果）。',
				'返回图片供模型直接查看。'
			].join('\n'),
			parameters: {
				frame: {
					type: 'integer',
					description: '可选：跳转到该帧后截图（用于检查关键帧位置的镜头效果）。不传则截当前帧。'
				}
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						absolutePath: { type: 'string', description: '截图文件绝对路径（节点工作区）' },
						projectRelativePath: { type: 'string', description: '项目相对路径' },
						width: { type: 'integer' },
						height: { type: 'integer' },
						frame: { type: 'integer', description: '截图时所在帧号' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as {
						ok?: boolean
						absolutePath?: string
						projectRelativePath?: string
						width?: number
						height?: number
						frame?: number
						error?: string
					}
					if (v?.ok && (v.absolutePath || v.projectRelativePath)) {
						const pathLine = v.absolutePath
							? `文件路径: ${v.absolutePath}`
							: `项目相对路径: ${v.projectRelativePath}`
						const lines = [
							`镜头预览截图成功（帧 ${v.frame ?? '?'}，${v.width ?? 0}×${v.height ?? 0}）。`,
							pathLine,
							'提示：可使用文件读取工具（如 read_file 或 fs_read）打开该路径的图片文件查看镜头构图，判断是否需要调整摄像头位置、target或FOV。'
						]
						return [{ type: 'text', text: lines.join('\n') }]
					}
					if (v?.ok) {
						return [
							{
								type: 'text',
								text: `截图成功但未保存到工作区（帧 ${v.frame ?? '?'}，${v.width ?? 0}×${v.height ?? 0}）。error: ${v.error || '无 projectId/nodeId'}`
							}
						]
					}
					return [{ type: 'text', text: `截图失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				const payload: { action: string; frame?: number } = { action: 'dc_capture_camera_preview' }
				if (typeof args?.frame === 'number' && Number.isFinite(args.frame)) {
					payload.frame = args.frame
				}
				console.error('[dvstudio-director] dc_capture_camera_preview: calling callAction')
				const result = await callAction<{
					ok?: boolean
					dataUrl?: string
					absolutePath?: string
					projectRelativePath?: string
					width?: number
					height?: number
					frame?: number
					error?: string
				}>(payload)

				console.error('[dvstudio-director] dc_capture_camera_preview: callAction returned', {
					ok: result.ok,
					hasDataUrl: !!result.dataUrl,
					hasAbsolutePath: !!result.absolutePath,
					absolutePath: result.absolutePath,
					projectRelativePath: result.projectRelativePath,
					width: result.width,
					height: result.height,
					frame: result.frame,
					error: result.error
				})

				if (!result.ok) {
					return { ok: false, error: result.error || '截图返回无数据' }
				}

				// 截图已由 DVStudio 侧保存到节点工作区，直接透传路径信息给 render
				return {
					ok: true,
					absolutePath: result.absolutePath,
					projectRelativePath: result.projectRelativePath,
					width: result.width,
					height: result.height,
					frame: result.frame
				}
			}
		})
	)
}
