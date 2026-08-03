import { useI18n } from '../i18n'
import { open3DEditor, type Open3DEditorPayload, type Open3DEditorResult } from '../electronBridge'
import { isElectron } from '../electronBridge'

export interface UseModel3DEditorOptions {
	nodeId: string
	projectId?: number
	modelUrl?: string
	modelAssetPath?: string
	modelName?: string
	models?: Array<{
		id?: string
		name?: string
		url: string
	}>
}

export function useModel3DEditor() {
	const { t } = useI18n()

	async function open(options: UseModel3DEditorOptions): Promise<Open3DEditorResult> {
		const models: Open3DEditorPayload['models'] = []

		if (options.modelUrl) {
			models.push({
				id: `model-${options.nodeId || 'default'}`,
				name: options.modelName || (t as any)('nodes.model3d.defaultModelName', 'Model'),
				url: options.modelUrl,
			})
		}

		if (Array.isArray(options.models)) {
			for (let i = 0; i < options.models.length; i++) {
				const m = options.models[i]
				if (m?.url) {
					models.push({
						id: m.id || `model-${options.nodeId || 'default'}-${i}`,
						name: m.name || `${(t as any)('nodes.model3d.model', 'Model')} ${i + 1}`,
						url: m.url,
					})
				}
			}
		}

		if (!isElectron()) {
			return { ok: false, error: '3D editor is only available in Electron app.' }
		}

		return open3DEditor({
			nodeId: options.nodeId,
			projectId: options.projectId,
			models,
		})
	}

	return {
		open,
	}
}
