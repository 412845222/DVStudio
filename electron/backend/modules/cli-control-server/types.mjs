/**
 * CLI Control Server 类型定义（运行时JSDoc注释，非TS文件）
 */

/**
 * @typedef {Object} CliControlConfig
 * @property {number} pid
 * @property {string} host
 * @property {number} port
 * @property {string} token
 * @property {string} startedAt
 * @property {string} version
 */

/**
 * @typedef {'submitted'|'running'|'completed'|'failed'|'cancelled'} TaskStatus
 */

/**
 * @typedef {Object} CliTask
 * @property {string} taskId
 * @property {'generate-image'} command
 * @property {TaskStatus} status
 * @property {Object} payload
 * @property {string} [nodeId]
 * @property {string[]} [outputFiles]
 * @property {string[]} [exportedFiles]
 * @property {Object} [error]
 * @property {number} createdAt
 * @property {number} [updatedAt]
 * @property {number} [completedAt]
 * @property {string} source - 固定 "cli"
 */

/**
 * 任务变更事件（供 addTaskChangeListener 回调使用）
 * @typedef {Object} TaskChangeEvent
 * @property {'created'|'updated'} type
 * @property {string} taskId
 * @property {CliTask} task
 * @property {Object} [patch] - type=updated 时携带变更字段
 */

/**
 * @typedef {Object} HealthResult
 * @property {boolean} ok
 * @property {boolean} running
 * @property {{host:string,port:number,url:string}} server
 * @property {{name:string,version:string,currentProject?:{id:number,name:string,rootDir:string}}} app
 * @property {{ready:boolean,runtime:string}} agent
 * @property {{builtinToolsCount:number}} mcp
 */

export const CLI_CONTROL_RUNTIME_FILENAME = 'cli-control-server.json'
export const CLI_CONTROL_PORT_RANGE_START = 52300
export const CLI_CONTROL_PORT_RANGE_END = 52399
export const CLI_CONTROL_FEATURE_FLAG = 'DVS_DISABLE_CLI_CONTROL_SERVER'
export const CLI_TOKEN_HEADER = 'x-dvs-cli-token'
