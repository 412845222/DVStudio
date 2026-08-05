export type SkillCategory = 'scene' | 'node' | 'workflow' | 'general'

export interface SkillDefinition {
	id: string
	name: string
	description: string
	prompt: string
	icon: string
	category: SkillCategory
	order?: number
}

export const BUILTIN_SKILLS: SkillDefinition[] = [
	{
		id: 'scene-understand',
		name: '场景理解',
		description: '分析当前3D场景的布局、光照和物体关系',
		prompt:
			'请先仔细分析当前场景，包括物体位置、光照设置、相机角度，然后再回答我的问题或执行操作。',
		icon: '🖼️',
		category: 'scene',
		order: 1
	},
	{
		id: 'scene-lighting',
		name: '光照调整',
		description: '专注于场景光照设置与优化',
		prompt:
			'专注于光照相关操作：调整环境光、方向光、点光源参数，优化阴影和反射效果。优先使用光照调整相关工具。',
		icon: '💡',
		category: 'scene',
		order: 2
	},
	{
		id: 'node-create',
		name: '节点创建',
		description: '快速创建并连接新节点',
		prompt:
			'我需要创建新节点。请根据我的描述创建合适类型的节点，配置必要参数，并自动连接到合理的位置。',
		icon: '➕',
		category: 'node',
		order: 3
	},
	{
		id: 'node-config',
		name: '节点配置',
		description: '查看和修改节点参数配置',
		prompt:
			'请仔细查看我引用的节点配置，根据我的需求修改参数。修改前先说明要调整哪些参数，修改后确认变更。',
		icon: '⚙️',
		category: 'node',
		order: 4
	},
	{
		id: 'workflow-plan',
		name: '工作流规划',
		description: '先制定执行计划再逐步执行',
		prompt: '在执行任何操作前，请先输出清晰的执行计划，列出步骤和预期结果，经我确认后再逐步执行。',
		icon: '📋',
		category: 'workflow',
		order: 5
	}
]
