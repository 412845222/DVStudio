import { ipcMain } from 'electron'
import logger from './core/logger.mjs'
import { wrapError } from './core/errors.mjs'
import { createStreamHandler } from './core/stream.mjs'

export function createRouter({ routes, contextFactory, mainWindow }) {
  const registeredChannels = new Map()

  function wrapHandler(channel, handler, isStream = false) {
    if (isStream) {
      return createStreamHandler(channel, async (event, payload) => {
        const ctx = contextFactory ? contextFactory() : {}
        return await handler(ctx, payload, event)
      })
    }

    return async (event, payload) => {
      const ctx = contextFactory ? contextFactory() : {}
      try {
        const result = await handler(ctx, payload, event)
        if (result && typeof result === 'object' && 'ok' in result) {
          return result
        }
        return { ok: true, value: result }
      } catch (err) {
        const wrapped = wrapError(err)
        logger.error(`Error in channel ${channel}:`, wrapped.message)
        return wrapped.toJSON()
      }
    }
  }

  return {
    register() {
      for (const route of routes) {
        const { channel, handler, stream = false } = route
        
        if (registeredChannels.has(channel)) {
          logger.warn(`Channel ${channel} is already registered, skipping duplicate`)
          continue
        }

        const wrapped = wrapHandler(channel, handler, stream)
        ipcMain.handle(channel, wrapped)
        registeredChannels.set(channel, wrapped)
        logger.debug(`Registered IPC channel: ${channel}${stream ? ' (stream)' : ''}`)
      }

      logger.info(`Registered ${registeredChannels.size} IPC routes`)
    },

    unregister() {
      for (const [channel, handler] of registeredChannels) {
        ipcMain.removeHandler(channel)
      }
      registeredChannels.clear()
      logger.info('Unregistered all IPC routes')
    },

    getRegisteredChannels() {
      return Array.from(registeredChannels.keys())
    },
  }
}
