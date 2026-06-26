const CHANNEL_SUFFIX_DATA = ':data'
const CHANNEL_SUFFIX_END = ':end'
const CHANNEL_SUFFIX_ERROR = ':error'

export function createIpcStream(mainWindow, baseChannel, requestId) {
  const dataChannel = baseChannel + CHANNEL_SUFFIX_DATA
  const endChannel = baseChannel + CHANNEL_SUFFIX_END
  const errorChannel = baseChannel + CHANNEL_SUFFIX_ERROR

  return {
    send(chunk) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(dataChannel, requestId, chunk)
      }
    },
    end() {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(endChannel, requestId)
      }
    },
    error(err) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const message = err?.message || String(err || 'Stream error')
        mainWindow.webContents.send(errorChannel, requestId, { error: message })
      }
    },
  }
}

export async function pipeAsyncGeneratorToIpc(generator, ipcStream) {
  try {
    for await (const chunk of generator) {
      ipcStream.send(chunk)
    }
    ipcStream.end()
  } catch (err) {
    ipcStream.error(err)
    throw err
  }
}

export function createStreamHandler(handlerFactory) {
  return async (event, payload) => {
    const requestId = payload?.requestId || Date.now().toString(36)
    const mainWindow = event.sender.getOwnerBrowserWindow()
    
    const baseChannel = event.channel.replace(':stream', '')
    const ipcStream = createIpcStream(mainWindow, baseChannel, requestId)

    try {
      const generator = await handlerFactory(event, payload)
      await pipeAsyncGeneratorToIpc(generator, ipcStream)
      return { ok: true, requestId }
    } catch (err) {
      ipcStream.error(err)
      return { ok: false, error: err?.message || String(err), requestId }
    }
  }
}
