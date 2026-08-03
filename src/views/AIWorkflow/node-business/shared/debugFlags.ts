/**
 * AIWorkflow / BlueprintEditor 调试开关。
 *
 * 日常开发保持默认 false — 避免任务轮询时控制台刷屏、
 * 防止 computed/watcher 的高频副作用被 console.log 放大成卡顿。
 *
 * 需要排查引用刷新、节点绑定、bulk update 等细节时，
 * 临时把对应开关改为 true（在控制台 hot-reload 或改文件都可）。
 *
 * 放在最底层 shared/，不依赖任何业务模块，避免循环 import。
 */

/** AIWorkflowPage.inputParamPreviewRefsByNodeId 相关的重算日志（轮询期高频） */
export const BLUEPRINT_POLL_DEBUG = false as boolean

/** Meshy/Tripo3D Runtime 成功路径的资源绑定 / 回写日志（任务完成时低频） */
export const NODE_BINDING_DEBUG = false as boolean

/** BlueprintEditor.vue 内 enterEditMode / bulkUpdate / Enter 按键等调试日志 */
export const BLUEPRINT_EDITOR_DEBUG = false as boolean
