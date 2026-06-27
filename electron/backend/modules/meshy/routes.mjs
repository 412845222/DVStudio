import * as handlers from './handlers.mjs'

export const routes = [
  { channel: 'dweb:meshy:health',       handler: handlers.health },
  { channel: 'dweb:meshy:generate',     handler: handlers.generate },
  { channel: 'dweb:meshy:get-task',     handler: handlers.getTask },
  { channel: 'dweb:meshy:list-tasks',   handler: handlers.listTasks },
  { channel: 'dweb:meshy:task-detail',  handler: handlers.taskDetail },
  { channel: 'dweb:meshy:stop',         handler: handlers.stop },
  { channel: 'dweb:meshy:delete',       handler: handlers.deleteTask },
  { channel: 'dweb:meshy:balance',      handler: handlers.balance },
]
