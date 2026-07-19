import { NodeBase } from './NodeBase'
import type { VideoNodeDTO, VideoNodeProps, NodeBaseDTO, NodeType } from './types'

export class VideoNode extends NodeBase {
	static readonly type: NodeType = 'video'

	static defaultProps(): VideoNodeProps {
		return {
			videoId: '',
			videoPath: '',
			videoFit: 'contain'
		}
	}

	static upgradeFrom(dto: NodeBaseDTO): VideoNodeDTO {
		const base = dto.props ?? {}
		const videoId = typeof base.videoId === 'string' ? base.videoId : ''
		const videoPath = typeof base.videoPath === 'string' ? base.videoPath : ''
		const videoFit =
			base.videoFit === 'contain' ||
			base.videoFit === 'cover' ||
			base.videoFit === 'fill' ||
			base.videoFit === 'none' ||
			base.videoFit === 'scale-down'
				? base.videoFit
				: 'contain'
		return {
			id: dto.id,
			name: dto.name,
			type: 'video',
			transform: {
				...dto.transform,
				width: Math.max(1, dto.transform.width ?? 1920),
				height: Math.max(1, dto.transform.height ?? 1080)
			},
			props: { videoId, videoPath, videoFit }
		}
	}
}
