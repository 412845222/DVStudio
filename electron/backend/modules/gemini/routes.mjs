import * as handlers from './handlers.mjs'

export const routes = [
  { channel: 'dweb:gemini:health',         handler: handlers.health },
  { channel: 'dweb:gemini:get-task',       handler: handlers.getTask },
  { channel: 'dweb:gemini:list-tasks',     handler: handlers.listTasks },
  { channel: 'dweb:gemini:cancel',         handler: handlers.cancel },
  { channel: 'dweb:gemini:delete',         handler: handlers.deleteTask },
  { channel: 'dweb:gemini:clear-completed',handler: handlers.clearCompleted },
  { channel: 'dweb:gemini:get-image-path', handler: handlers.getImagePath },
]
