import * as handlers from './handlers.mjs'

export const routes = [
  { channel: 'dweb:subtitle-recog:check-env', handler: handlers.checkEnv },
  { channel: 'dweb:subtitle-recog:get-binary-config', handler: handlers.getBinaryConfig },
  { channel: 'dweb:subtitle-recog:download-binary:stream', handler: handlers.downloadBinary, stream: true },
  { channel: 'dweb:subtitle-recog:get-ffmpeg-config', handler: handlers.getFfmpegConfig },
  { channel: 'dweb:subtitle-recog:download-ffmpeg:stream', handler: handlers.downloadFfmpeg, stream: true },
  { channel: 'dweb:subtitle-recog:get-available-models', handler: handlers.getAvailableModels },
  { channel: 'dweb:subtitle-recog:get-model-config', handler: handlers.getModelConfig },
  { channel: 'dweb:subtitle-recog:download-model:stream', handler: handlers.downloadModel, stream: true },
  { channel: 'dweb:subtitle-recog:get-installed-models', handler: handlers.getInstalledModels },
  { channel: 'dweb:subtitle-recog:recognize:stream', handler: handlers.recognize, stream: true },
  { channel: 'dweb:subtitle-recog:read-audio-file', handler: handlers.readAudioFile },
  { channel: 'dweb:subtitle-recog:cleanup-audio-file', handler: handlers.cleanupAudioFile },
]
