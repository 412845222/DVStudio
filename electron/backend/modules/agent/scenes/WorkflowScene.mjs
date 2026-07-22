import { BaseAgentScene } from './BaseScene.mjs'

function estimateTokens(text) {
  if (!text) return 0
  const str = String(text)
  const cjkChars = str.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []
  const otherChars = str.length - cjkChars.length
  return Math.ceil(cjkChars.length * 1.3 + otherChars * 0.75)
}

function buildBlueprintContext(bp, parts) {
  parts.push('\n## 工作流蓝图\n')

  if (bp.nodeCount !== undefined) parts.push(`- 节点总数: ${bp.nodeCount}\n`)
  if (bp.edgeCount !== undefined) parts.push(`- 连接总数: ${bp.edgeCount}\n`)

  if (bp.nodeTypeStats && typeof bp.nodeTypeStats === 'object') {
    const stats = Object.entries(bp.nodeTypeStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ')
    if (stats) parts.push(`- 节点类型分布: ${stats}\n`)
  }

  if (bp.selectedNode && typeof bp.selectedNode === 'object') {
    parts.push('\n### 当前选中节点\n')
    parts.push(`- 节点 ID: ${bp.selectedNode.id || 'unknown'}\n`)
    parts.push(`- 节点类型: ${bp.selectedNode.type || 'unknown'}\n`)
    if (bp.selectedNode.label) parts.push(`- 节点名称: ${bp.selectedNode.label}\n`)
    if (bp.selectedNode.config && typeof bp.selectedNode.config === 'object') {
      const configKeys = Object.keys(bp.selectedNode.config).slice(0, 10)
      if (configKeys.length > 0) parts.push(`- 配置字段: ${configKeys.join(', ')}\n`)
    }
  }

  if (Array.isArray(bp.nodes) && bp.nodes.length > 0) {
    const totalNodes = bp.nodeCount || bp.nodes.length
    if (totalNodes <= 30) {
      parts.push('\n### 节点列表\n')
      for (const node of bp.nodes) {
        const label = node.label || node.type || 'unknown'
        parts.push(`- [${node.type || '?'}] ${label} (${node.id})\n`)
      }
    } else {
      parts.push(`\n### 节点列表（共 ${totalNodes} 个，仅展示前 ${bp.nodes.length} 个）\n`)
      for (const node of bp.nodes.slice(0, 30)) {
        const label = node.label || node.type || 'unknown'
        parts.push(`- [${node.type || '?'}] ${label} (${node.id})\n`)
      }
      if (bp.nodes.length > 30) parts.push(`- ... 还有 ${bp.nodes.length - 30} 个节点未展示\n`)
    }
  }
}

export class WorkflowScene extends BaseAgentScene {
  buildDefaultSystemPrompt(context, options = {}) {
    const parts = ['# DVStudio 工作流上下文\n']
    parts.push('你是 DVStudio AI 工作流中的智能助手，可以理解当前工作状态并协助操作工作流蓝图。\n')

    if (!context) {
      if (options.includeToolInstructions && options.toolPromptText) {
        parts.push('\n' + options.toolPromptText)
      }
      return parts.join('')
    }

    if (context.project) {
      parts.push('\n## 当前项目\n')
      if (context.project.name) parts.push(`- 项目名称: ${context.project.name}\n`)
      if (context.project.id !== undefined && context.project.id !== null) {
        parts.push(`- 项目 ID: ${context.project.id}\n`)
      }
      if (context.project.path) parts.push(`- 项目路径: ${context.project.path}\n`)
    }

    if (context.blueprint) {
      buildBlueprintContext(context.blueprint, parts)
    }

    if (Array.isArray(context.availableActions) && context.availableActions.length > 0) {
      parts.push('\n## 可用工具操作\n')
      parts.push('你可以通过工具调用执行以下操作：\n')
      for (const action of context.availableActions) {
        parts.push(`- ${action}\n`)
      }
    }

    if (context.restrictions && typeof context.restrictions === 'object') {
      parts.push('\n## 边界规则\n')
      const r = context.restrictions
      if (r.maxNodes) parts.push(`- 最大节点数限制: ${r.maxNodes}\n`)
      if (r.disallowDeleteSystemNodes) parts.push('- 禁止删除系统节点\n')
      if (r.allowedImageFormats?.length) parts.push(`- 支持的图片格式: ${r.allowedImageFormats.join(', ')}\n`)
      if (r.allowedVideoFormats?.length) parts.push(`- 支持的视频格式: ${r.allowedVideoFormats.join(', ')}\n`)
      if (r.maxConcurrentTasks) parts.push(`- 最大并发任务数: ${r.maxConcurrentTasks}\n`)
    }

    parts.push('\n请根据以上上下文回答用户问题。如需操作工作流蓝图，请使用工具调用。\n')

    if (options.includeToolInstructions && options.toolPromptText) {
      parts.push('\n' + options.toolPromptText)
    }

    return parts.join('')
  }
}
