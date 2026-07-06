import * as handlers from './handlers.mjs'

export const routes = [
  { channel: 'dweb:tripo3d:health',       handler: handlers.health },
  { channel: 'dweb:tripo3d:generate',     handler: handlers.generate },
  { channel: 'dweb:tripo3d:get-task',     handler: handlers.getTask },
  { channel: 'dweb:tripo3d:list-tasks',   handler: handlers.listTasks },
  { channel: 'dweb:tripo3d:task-detail',  handler: handlers.taskDetail },
  { channel: 'dweb:tripo3d:stop',         handler: handlers.stop },
  { channel: 'dweb:tripo3d:delete',       handler: handlers.deleteTask },
  { channel: 'dweb:tripo3d:balance',      handler: handlers.balance },
]
