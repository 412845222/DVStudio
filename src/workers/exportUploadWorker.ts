type InitMsg = {
	type: 'init'
	jobId: string
	baseUrl?: string
}

export {}

type UploadMsg = {
	type: 'upload'
	frameIndex: number
	blob: Blob
}

type InMsg = InitMsg | UploadMsg

type OutMsg =
	| { type: 'ready' }
	| { type: 'uploaded'; frameIndex: number }
	| { type: 'error'; frameIndex: number; message: string }

let jobId = ''
let baseUrl = ''

const post = (msg: OutMsg) => {
	;(self as any).postMessage(msg)
}

const uploadOne = async (frameIndex: number, blob: Blob) => {
	if (!jobId) throw new Error('worker 未初始化（缺少 jobId）')
	const fd = new FormData()
	fd.set('frameIndex', String(Math.floor(frameIndex)))
	fd.set('file', blob, `frame_${String(Math.floor(frameIndex)).padStart(6, '0')}.png`)
	const url = `${baseUrl || ''}/api/export/jobs/${encodeURIComponent(jobId)}/frames`
	const res = await fetch(url, { method: 'POST', body: fd })
	if (!res.ok) {
		let preview = ''
		try {
			preview = (await res.text()).slice(0, 300)
		} catch {
			preview = ''
		}
		throw new Error(`上传帧失败：${res.status} ${res.statusText}${preview ? `，body: ${preview}` : ''}`)
	}
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
	const msg = ev.data
	if (!msg || typeof msg !== 'object') return
	if (msg.type === 'init') {
		jobId = String(msg.jobId || '')
		baseUrl = String(msg.baseUrl || '')
		post({ type: 'ready' })
		return
	}
	if (msg.type === 'upload') {
		const frameIndex = Math.floor(Number(msg.frameIndex))
		const blob = msg.blob
		Promise.resolve()
			.then(() => uploadOne(frameIndex, blob))
			.then(() => post({ type: 'uploaded', frameIndex }))
			.catch((e) => post({ type: 'error', frameIndex, message: String((e as any)?.message ?? e) }))
		return
	}
}
