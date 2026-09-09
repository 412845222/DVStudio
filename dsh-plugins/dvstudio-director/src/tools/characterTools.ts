/**
 * 角色工具（4 个 dc_* 工具）
 *
 * 使用 DSH defineTool 格式注册，execute 中调用 callAction 转发到 Electron。
 */

import { callAction } from '../client.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'

export function registerCharacterTools(ctx: any) {
	// dc_add_character
	ctx.tools.register(
		defineTool({
			name: 'dc_add_character',
			description:
				'在导演控制台场景中添加一个角色占位。返回角色ID，后续可通过该ID设置位置、父子关系和关键帧。',
			parameters: {
				name: { type: 'string', description: '角色名称，如主角、反派', required: true },
				color: { type: 'string', description: '占位颜色十六进制，如#ff5500' },
				position: {
					type: 'object',
					description: '初始世界坐标，缺省放置在相机目标点',
					additionalProperties: true,
					properties: {
						x: { type: 'number' },
						y: { type: 'number' },
						z: { type: 'number' }
					}
				}
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						characterId: { type: 'string' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; characterId?: string; error?: string }
					if (v?.ok) {
						return [{ type: 'text', text: `角色已添加，ID: ${v.characterId}` }]
					}
					return [{ type: 'text', text: `添加角色失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_add_character', ...args })
			}
		})
	)

	// dc_set_character_transform
	ctx.tools.register(
		defineTool({
			name: 'dc_set_character_transform',
			description: '设置指定角色的变换（位置/旋转/缩放）。每次设置一个轴的值。',
			parameters: {
				characterId: { type: 'string', description: '角色ID', required: true },
				kind: {
					type: 'string',
					enum: ['position', 'rotation', 'scale'],
					description: '变换类型',
					required: true
				},
				axis: { type: 'string', enum: ['x', 'y', 'z'], description: '轴', required: true },
				value: { type: 'number', description: '值', required: true }
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
					if (v?.ok) return [{ type: 'text', text: '变换已设置' }]
					return [{ type: 'text', text: `设置失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_set_character_transform', ...args })
			}
		})
	)

	// dc_set_character_parent
	ctx.tools.register(
		defineTool({
			name: 'dc_set_character_parent',
			description:
				'设置角色的父级角色，建立层级关系。子角色会跟随父角色移动。parentId传null则挂到场景根。',
			parameters: {
				childId: { type: 'string', description: '子角色ID', required: true },
				parentId: { type: 'string', description: '父角色ID，传"null"字符串表示挂到场景根' }
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
					if (v?.ok) return [{ type: 'text', text: '父子关系已设置' }]
					return [{ type: 'text', text: `设置失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(args: any) {
				return await callAction({ action: 'dc_set_character_parent', ...args })
			}
		})
	)

	// dc_list_characters
	ctx.tools.register(
		defineTool({
			name: 'dc_list_characters',
			description: '列出场景中所有角色及其ID、名称、位置，用于Agent了解当前场景状态。',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: true,
					properties: {
						ok: { type: 'boolean' },
						characters: { type: 'array', items: { type: 'object', additionalProperties: true } },
						count: { type: 'number' },
						error: { type: 'string' }
					}
				},
				render: (_args, value: any) => {
					const v = value as { ok?: boolean; characters?: any[]; count?: number; error?: string }
					if (v?.ok) {
						return [
							{
								type: 'text',
								text: `场景中有 ${v.count ?? 0} 个角色\n${JSON.stringify(v.characters, null, 2)}`
							}
						]
					}
					return [{ type: 'text', text: `查询失败：${v?.error || '未知错误'}` }]
				}
			},
			async execute(_args: any) {
				return await callAction({ action: 'dc_list_characters' })
			}
		})
	)
}
