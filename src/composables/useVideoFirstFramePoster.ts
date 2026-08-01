import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { VideoFirstFrameCaptureQueue } from '../aiworkflow/VideoFirstFrameCaptureQueue'

export type UseVideoFirstFramePosterOptions = {
	/** Max width for the captured poster (preserves aspect) */
	maxWidth?: number
	/** Per-video timeout in ms */
	timeoutMs?: number
}

function readRefOrFn<T>(x: Ref<T> | (() => T)): T {
	return typeof x === 'function' ? (x as () => T)() : (x as Ref<T>).value
}

/**
 * Composable: watch a video source URL and auto-capture the first frame
 * when no explicit poster is provided. Emits the captured poster URL so
 * callers can persist it (SSOT: the caller owns syncing to store/engine).
 *
 * Usage:
 *   const { localPosterUrl, capturing } = useVideoFirstFramePoster({
 *     effectiveResourceUrl,
 *     explicitPosterUrl: () => props.posterUrl,
 *     nodeId: () => props.nodeId,
 *     onCaptured: (url) => emit('update-poster', url),
 *     options: { maxWidth: 480, timeoutMs: 8000 },
 *   })
 */
export function useVideoFirstFramePoster(input: {
	effectiveResourceUrl: Ref<string> | (() => string)
	explicitPosterUrl: Ref<string | null | undefined> | (() => string | null | undefined)
	nodeId: Ref<string> | (() => string)
	onCaptured?: (posterDataUrl: string) => void
	options?: UseVideoFirstFramePosterOptions
}) {
	const getSrc = () => readRefOrFn(input.effectiveResourceUrl)
	const getExplicit = () => readRefOrFn(input.explicitPosterUrl)
	const getNodeId = () => readRefOrFn(input.nodeId)

	const capturing = ref(false)
	const localPosterUrl = ref<string | null>(null)

	let lastKey = ''
	let lastLocal = ''
	let queue: VideoFirstFrameCaptureQueue | null = null
	const ensureQueue = () => {
		if (!queue) queue = new VideoFirstFrameCaptureQueue({ concurrency: 2 })
		return queue
	}

	const tryCapture = () => {
		const src = String(getSrc() || '').trim()
		const explicit = String(getExplicit() || '').trim()
		if (!src) {
			localPosterUrl.value = null
			lastKey = ''
			return
		}
		// If the caller already has an explicit poster, respect it (SSOT upstream)
		if (explicit) {
			if (localPosterUrl.value && lastLocal) {
				// Release cached blob to avoid memory leaks
				try { URL.revokeObjectURL(lastLocal) } catch {}
			}
			localPosterUrl.value = null
			lastLocal = ''
			return
		}
		const key = `${getNodeId() || 'n'}::${src}`
		if (key === lastKey && localPosterUrl.value) return
		lastKey = key
		if (lastLocal) {
			try { URL.revokeObjectURL(lastLocal) } catch {}
			lastLocal = ''
		}
		localPosterUrl.value = null
		capturing.value = true
		const q = ensureQueue()
		q.enqueue([{
			id: key,
			url: src,
			maxWidth: input.options?.maxWidth,
			timeoutMs: input.options?.timeoutMs,
			onResult: (res) => {
				if (key !== lastKey) return
				capturing.value = false
				if (res?.posterUrl) {
					localPosterUrl.value = res.posterUrl
					lastLocal = res.posterUrl
					try {
						input.onCaptured?.(res.posterUrl)
					} catch {
						// ignore subscriber errors
					}
				}
			},
		}])
	}

	// Watch: URL changes, explicit poster changes, node changes
	const depsWatch: Array<Ref<any> | (() => any)> = [getSrc, getExplicit, getNodeId]
	const stopHandlers: Array<() => void> = []
	for (const d of depsWatch) {
		const refLike = d as Ref<any>
		const getter = typeof d === 'function' ? d : () => refLike.value
		stopHandlers.push(watch(getter, () => tryCapture(), { flush: 'post' }))
	}

	// Try once initially
	tryCapture()

	onBeforeUnmount(() => {
		for (const s of stopHandlers) try { s() } catch {}
		try { queue?.cancel() } catch {}
		queue = null
		lastKey = ''
		if (lastLocal) {
			try { URL.revokeObjectURL(lastLocal) } catch {}
			lastLocal = ''
		}
		localPosterUrl.value = null
	})

	return { localPosterUrl, capturing, forceRecapture: tryCapture }
}
