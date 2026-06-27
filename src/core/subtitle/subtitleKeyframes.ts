import type { SubtitleCue, SubtitleCueRange, SubtitleTextStyle } from '../timeline'
import type { VideoSceneNodeProps, VideoSceneNodeTransform } from '../scene'

export type SubtitleGeneratedKeyframes = {
	frames: number[]
	nodeKeyframesByFrame: Record<
		string,
		Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
	>
}

const frameKey = (frameIndex: number) => String(Math.floor(frameIndex))

export const buildSubtitleGeneratedKeyframes = (args: {
	layerId: string
	nodeId: string
	cues: SubtitleCue[]
	cueRanges: SubtitleCueRange[]
	defaultStyle: SubtitleTextStyle
	overridesByCueIndex?: Record<string, Partial<SubtitleTextStyle>>
	nodeTransform: VideoSceneNodeTransform
}): SubtitleGeneratedKeyframes => {
	const nodeId = String(args.nodeId || '').trim()
	if (!nodeId) return { frames: [], nodeKeyframesByFrame: {} }

	const cues = Array.isArray(args.cues) ? args.cues : []
	const ranges = Array.isArray(args.cueRanges) ? args.cueRanges : []
	const n = Math.min(cues.length, ranges.length)
	const overrides = args.overridesByCueIndex ?? {}

	const frames = new Set<number>()
	frames.add(0)

	const map: Record<
		string,
		Record<string, { transform?: VideoSceneNodeTransform; props?: VideoSceneNodeProps }>
	> = {}

	const write = (
		frameIndex: number,
		props: VideoSceneNodeProps,
		transform?: VideoSceneNodeTransform
	) => {
		const fi = Math.floor(frameIndex)
		frames.add(fi)
		const fk = frameKey(fi)
		map[fk] = map[fk] ?? {}
		map[fk][nodeId] = { transform: transform ?? args.nodeTransform, props }
	}

	// frame 0: hidden baseline (do NOT force opacity; keep node's base opacity)
	write(
		0,
		{
			textContent: '',
			fontSize: args.defaultStyle.fontSize,
			fontColor: args.defaultStyle.fontColor,
			fontStyle: args.defaultStyle.fontStyle,
			textAlign: args.defaultStyle.textAlign
		},
		args.nodeTransform
	)

	for (let i = 0; i < n; i++) {
		const cue = cues[i]
		const r = ranges[i]
		const startFrame = Math.floor(r.startFrame)
		const endFrame = Math.floor(r.endFrame)
		if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame)) continue
		if (endFrame < startFrame) continue

		const style = { ...args.defaultStyle, ...(overrides[String(i)] ?? {}) } as SubtitleTextStyle
		const props: VideoSceneNodeProps = {
			textContent: String(cue?.text ?? ''),
			fontSize: style.fontSize,
			fontColor: style.fontColor,
			fontStyle: style.fontStyle,
			textAlign: style.textAlign
		}
		write(startFrame, props, args.nodeTransform)

		// Ensure the LAST cue has a closing keyframe so the timeline can form a segment (prev/next).
		// We intentionally do NOT write end keyframes for all cues to avoid dense keyframes.
		if (i === n - 1 && endFrame > startFrame) write(endFrame, props, args.nodeTransform)
	}

	const outFrames = Array.from(frames)
		.filter((x) => Number.isFinite(x))
		.sort((a, b) => a - b)

	return { frames: outFrames, nodeKeyframesByFrame: map }
}
