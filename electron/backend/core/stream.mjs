const CHANNEL_SUFFIX_DATA = ':data'
const CHANNEL_SUFFIX_END = ':end'
const CHANNEL_SUFFIX_ERROR = ':error'

export function createIpcStream(mainWindow, baseChannel, requestId) {
	const dataChannel = baseChannel + CHANNEL_SUFFIX_DATA
	const endChannel = baseChannel + CHANNEL_SUFFIX_END
	const errorChannel = baseChannel + CHANNEL_SUFFIX_ERROR

	const safeSend = (channel, ...args) => {
		if (mainWindow && !mainWindow.isDestroyed?.()) {
			try {
				mainWindow.webContents.send(channel, ...args)
			} catch (err) {
				console.warn('[stream] Failed to send on channel', channel, ':', err?.message || err)
			}
		}
	}

	return {
		send(chunk) {
			safeSend(dataChannel, requestId, chunk)
		},
		end() {
			safeSend(endChannel, requestId)
		},
		error(err) {
			const message = err?.message || String(err || 'Stream error')
			safeSend(errorChannel, requestId, { error: message })
		}
	}
}

export async function pipeAsyncGeneratorToIpc(generator, ipcStream, debugTag = 'stream') {
	try {
		let chunkCount = 0
		for await (const chunk of generator) {
			chunkCount++
			if (chunk?.type === 'error') {
				console.error(`[DEBUG UPDATE COMFYUI] [${debugTag}] YIELD error chunk #${chunkCount}:`, chunk?.message)
			}
			ipcStream.send(chunk)
		}
		console.error(`[DEBUG UPDATE COMFYUI] [${debugTag}] Iterator ended normally. Total chunks yielded: ${chunkCount}`)
		ipcStream.end()
	} catch (err) {
		console.error(`[DEBUG UPDATE COMFYUI] [${debugTag}] PIPE EXPLOSION (caught by pipeAsyncGeneratorToIpc)`, err?.stack || err)
		ipcStream.error(err)
		throw err
	}
}

export function createStreamHandler(channel, handlerFactory) {
	return async (event, payload) => {
		const requestId = payload?.requestId || Date.now().toString(36)
		const streamChannel = channel || event?.channel || 'dweb:unknown:stream'
		const baseChannel = streamChannel.replace(/:stream$/, '')
		const debugTag = baseChannel + '#' + requestId

		if (baseChannel.includes('update-comfyui')) {
			console.error(`[DEBUG UPDATE COMFYUI] [${debugTag}] createStreamHandler INVOKED (channel=${streamChannel})`)
		}

		const mainWindow = event?.sender?.getOwnerBrowserWindow?.()
		const ipcStream = createIpcStream(mainWindow, baseChannel, requestId)

		try {
			const generator = await handlerFactory(event, payload)
			if (baseChannel.includes('update-comfyui')) {
				console.error(`[DEBUG UPDATE COMFYUI] [${debugTag}] generator created: typeof=`, typeof generator, 'next?', typeof generator?.next)
			}
			await pipeAsyncGeneratorToIpc(generator, ipcStream, debugTag)
			return { ok: true, requestId }
		} catch (err) {
			console.error(`[DEBUG UPDATE COMFYUI] [${debugTag}] createStreamHandler CATCH (outer try-catch):`, err?.stack || err)
			ipcStream.error(err)
			return { ok: false, error: err?.message || String(err), requestId }
		}
	}
}
