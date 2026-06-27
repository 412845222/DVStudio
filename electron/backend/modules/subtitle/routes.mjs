// subtitle module routes - IPC channel definitions
import * as handlers from './handlers.mjs'

export const routes = [
  // Ping
  { channel: 'dweb:subtitle:ping', handler: handlers.subtitlePing },
  // Stream routes (use createInvokeStream in frontend)
  { channel: 'dweb:subtitle:understand:stream', handler: handlers.subtitleUnderstandStream, stream: true },
  { channel: 'dweb:subtitle:chat:stream', handler: handlers.subtitleChatStream, stream: true },
  { channel: 'dweb:subtitle:style:stream', handler: handlers.subtitleStyleStream, stream: true },
  { channel: 'dweb:subtitle:templates:stream', handler: handlers.subtitleTemplatesStream, stream: true },
  { channel: 'dweb:subtitle:palette:stream', handler: handlers.subtitlePaletteStream, stream: true },
  { channel: 'dweb:subtitle:panel-chat:stream', handler: handlers.subtitlePanelChatStream, stream: true },
  { channel: 'dweb:subtitle:template:stream', handler: handlers.subtitleTemplateStream, stream: true },
]