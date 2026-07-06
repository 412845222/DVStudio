import JSZip from 'jszip'
import type { BuiltinTemplateConfig } from './types'
import { AIWF_PROJECT_PACKAGE_ENTRY } from '../../views/AIWorkflow/node-business/project/projectPackage'
import { AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION } from '../persistence/blueprintSnapshot'

export const BUILTIN_TEMPLATES: BuiltinTemplateConfig[] = [
	{
		id: 'builtin-basic-empty',
		name: '空白蓝图',
		description: '一个空白的AI工作流蓝图，从零开始构建你的工作流',
		category: 'basic',
		packagePath: 'builtin:empty',
		author: 'DVStudio',
		version: '1.0.0',
		tags: ['基础', '空白'],
		nodeCount: 0
	}
]

export function getBuiltinTemplates(): BuiltinTemplateConfig[] {
	return [...BUILTIN_TEMPLATES]
}

function createEmptySnapshot() {
	return {
		schemaVersion: AIWF_BLUEPRINT_SNAPSHOT_SCHEMA_VERSION,
		savedAt: Date.now(),
		viewport: { zoom: 1, panX: 0, panY: 0 },
		nodesById: {},
		nodeOrder: [],
		edgesById: {},
		edgeOrder: [],
		resourcesById: {},
		resourceOrder: [],
		selectedNodeId: null,
		selectedNodeIds: []
	}
}

export async function generateBuiltinTemplateBlob(packagePath: string): Promise<Blob | null> {
	if (packagePath === 'builtin:empty') {
		const snapshot = createEmptySnapshot()
		const pkg = {
			schemaVersion: 1,
			kind: 'aiwf-project-package',
			exportedAt: Date.now(),
			projectName: '空白蓝图',
			snapshot,
			assets: []
		}
		const zip = new JSZip()
		zip.file(AIWF_PROJECT_PACKAGE_ENTRY, JSON.stringify(pkg, null, 2))
		return zip.generateAsync({
			type: 'blob',
			compression: 'DEFLATE',
			compressionOptions: { level: 6 }
		})
	}
	return null
}
