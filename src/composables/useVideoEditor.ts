import { useI18n } from '../i18n'
import { openVideoEditor, type OpenVideoEditorResult } from '../electronBridge'
import { isElectron } from '../electronBridge'

export interface UseVideoEditorOptions {
	nodeId: string
	projectId?: number
	videoUrl: string
	videoName?: string
	title?: string
}

export function useVideoEditor() {
	const { t } = useI18n()

	async function open(options: UseVideoEditorOptions): Promise<OpenVideoEditorResult> {
		if (!options.videoUrl) {
			return { ok: false, error: 'videoUrl is required' }
		}

		if (!isElectron()) {
			return { ok: false, error: 'Video editor is only available in Electron app.' }
		}

		const title = options.title || (t as any)('nodes.video.editorTitle', '视频编辑器')

		return openVideoEditor({
			nodeId: options.nodeId,
			projectId: options.projectId,
			videoUrl: options.videoUrl,
			videoName: options.videoName,
			title,
		})
	}

	return {
		open,
	}
}
