export const ModelSize = {
  TINY: 'tiny',
  BASE: 'base',
  SMALL: 'small',
}

export const RecognitionPhase = {
  IDLE: 'idle',
  CHECKING: 'checking',
  EXTRACTING_AUDIO: 'extracting-audio',
  RECOGNIZING: 'recognizing',
  PARSING: 'parsing',
  DONE: 'done',
  ERROR: 'error',
}

export const SetupStepId = {
  OVERVIEW: 'overview',
  FFMPEG: 'ffmpeg',
  BINARY: 'binary',
  MODEL: 'model',
  VERIFY: 'verify',
  DONE: 'done',
}

export const SetupStepStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  ERROR: 'error',
  SKIPPED: 'skipped',
}
