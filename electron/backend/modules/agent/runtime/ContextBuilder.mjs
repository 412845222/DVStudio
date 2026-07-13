/**
 * 上下文构建器
 *
 * 负责构建 system prompt、完整消息列表、token 预算管理。
 * 从现有 agent/service.mjs 中提取 buildContextPrompt、buildMessages、token 估算等逻辑。
 */

const MODEL_CONTEXT_BUDGETS = {
  'doubao-seed-1-6': 224000,
  'doubao-seed-1-6-flash': 224000,
  'doubao-seed-1-6-thinking': 224000,
  'doubao-seed-1-6-vision': 224000,
  'doubao-seed-2-0': 224000,
  'doubao-seed-2-1': 224000,
  'doubao-seed-evolving': 224000,
  'deepseek-v3': 96000,
  'deepseek-v3-1': 96000,
  'deepseek-v3-2': 96000,
  'deepseek-v4': 96000,
  'deepseek-r1': 256000,
  'deepseek-r3': 256000,
  'kimi-k2': 256000,
  'glm-4': 128000,
  'glm-4-5': 128000,
  'qwen2': 128000,
  'qwen3': 128000,
};

const DEFAULT_CONTEXT_BUDGET = 96000;

function estimateTokens(text) {
  if (!text) return 0;
  const str = String(text);
  const cjkChars = str.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || [];
  const otherChars = str.length - cjkChars.length;
  return Math.ceil(cjkChars.length * 1.3 + otherChars * 0.75);
}

function estimateImageTokens(imageUrl, detail = 'auto') {
  const BASE_TOKEN = 85;
  const HIGH_RES_MULTIPLIER = 2.5;

  if (!imageUrl) return BASE_TOKEN;

  try {
    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1];
      if (base64Data) {
        const byteLength = Math.floor(base64Data.length * 0.75);
        const pixelEstimate = Math.sqrt(byteLength / 3);
        const resolutionFactor = Math.min(pixelEstimate / 512, 4);
        return Math.round(BASE_TOKEN * resolutionFactor);
      }
      return BASE_TOKEN;
    }

    const urlObj = new URL(imageUrl);
    const widthStr = urlObj.searchParams.get('width');
    const heightStr = urlObj.searchParams.get('height');
    
    if (widthStr && heightStr) {
      const width = parseInt(widthStr, 10);
      const height = parseInt(heightStr, 10);
      if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
        const pixels = width * height;
        const basePixels = 640 * 480;
        const resolutionFactor = Math.sqrt(pixels / basePixels);
        const cappedFactor = Math.min(resolutionFactor, 4);
        const detailMultiplier = detail === 'high' ? HIGH_RES_MULTIPLIER : 1;
        return Math.round(BASE_TOKEN * cappedFactor * detailMultiplier);
      }
    }

    const sizeMatch = imageUrl.match(/\/(\d+)x(\d+)\//);
    if (sizeMatch) {
      const width = parseInt(sizeMatch[1], 10);
      const height = parseInt(sizeMatch[2], 10);
      if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
        const pixels = width * height;
        const basePixels = 640 * 480;
        const resolutionFactor = Math.sqrt(pixels / basePixels);
        const cappedFactor = Math.min(resolutionFactor, 4);
        return Math.round(BASE_TOKEN * cappedFactor);
      }
    }
  } catch {
  }

  return BASE_TOKEN;
}

function getContextBudget(modelId) {
  const id = String(modelId || '').toLowerCase();
  for (const [pattern, budget] of Object.entries(MODEL_CONTEXT_BUDGETS)) {
    if (id.includes(pattern)) return budget;
  }
  return DEFAULT_CONTEXT_BUDGET;
}

function buildBlueprintContext(bp, parts) {
  parts.push('\n## 工作流蓝图\n');

  if (bp.nodeCount !== undefined) parts.push(`- 节点总数: ${bp.nodeCount}\n`);
  if (bp.edgeCount !== undefined) parts.push(`- 连接总数: ${bp.edgeCount}\n`);

  if (bp.nodeTypeStats && typeof bp.nodeTypeStats === 'object') {
    const stats = Object.entries(bp.nodeTypeStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    if (stats) parts.push(`- 节点类型分布: ${stats}\n`);
  }

  if (bp.selectedNode && typeof bp.selectedNode === 'object') {
    parts.push('\n### 当前选中节点\n');
    parts.push(`- 节点 ID: ${bp.selectedNode.id || 'unknown'}\n`);
    parts.push(`- 节点类型: ${bp.selectedNode.type || 'unknown'}\n`);
    if (bp.selectedNode.label) parts.push(`- 节点名称: ${bp.selectedNode.label}\n`);
    if (bp.selectedNode.config && typeof bp.selectedNode.config === 'object') {
      const configKeys = Object.keys(bp.selectedNode.config).slice(0, 10);
      if (configKeys.length > 0) parts.push(`- 配置字段: ${configKeys.join(', ')}\n`);
    }
  }

  if (Array.isArray(bp.nodes) && bp.nodes.length > 0) {
    const totalNodes = bp.nodeCount || bp.nodes.length;
    if (totalNodes <= 30) {
      parts.push('\n### 节点列表\n');
      for (const node of bp.nodes) {
        const label = node.label || node.type || 'unknown';
        parts.push(`- [${node.type || '?'}] ${label} (${node.id})\n`);
      }
    } else {
      parts.push(`\n### 节点列表（共 ${totalNodes} 个，仅展示前 ${bp.nodes.length} 个）\n`);
      for (const node of bp.nodes.slice(0, 30)) {
        const label = node.label || node.type || 'unknown';
        parts.push(`- [${node.type || '?'}] ${label} (${node.id})\n`);
      }
      if (bp.nodes.length > 30) parts.push(`- ... 还有 ${bp.nodes.length - 30} 个节点未展示\n`);
    }
  }
}

export class ContextBuilder {
  buildSystemPrompt(context, options = {}) {
    const parts = ['# DVStudio 工作流上下文\n'];
    parts.push('你是 DVStudio AI 工作流中的智能助手，可以理解当前工作状态并协助操作工作流蓝图。\n');

    if (!context) {
      if (options.includeToolInstructions && options.toolPromptText) {
        parts.push('\n' + options.toolPromptText);
      }
      return parts.join('');
    }

    if (context.project) {
      parts.push('\n## 当前项目\n');
      if (context.project.name) parts.push(`- 项目名称: ${context.project.name}\n`);
      if (context.project.id !== undefined && context.project.id !== null) {
        parts.push(`- 项目 ID: ${context.project.id}\n`);
      }
      if (context.project.path) parts.push(`- 项目路径: ${context.project.path}\n`);
    }

    if (context.blueprint) {
      buildBlueprintContext(context.blueprint, parts);
    }

    if (Array.isArray(context.availableActions) && context.availableActions.length > 0) {
      parts.push('\n## 可用工具操作\n');
      parts.push('你可以通过工具调用执行以下操作：\n');
      for (const action of context.availableActions) {
        parts.push(`- ${action}\n`);
      }
    }

    if (context.restrictions && typeof context.restrictions === 'object') {
      parts.push('\n## 边界规则\n');
      const r = context.restrictions;
      if (r.maxNodes) parts.push(`- 最大节点数限制: ${r.maxNodes}\n`);
      if (r.disallowDeleteSystemNodes) parts.push('- 禁止删除系统节点\n');
      if (r.allowedImageFormats?.length) parts.push(`- 支持的图片格式: ${r.allowedImageFormats.join(', ')}\n`);
      if (r.allowedVideoFormats?.length) parts.push(`- 支持的视频格式: ${r.allowedVideoFormats.join(', ')}\n`);
      if (r.maxConcurrentTasks) parts.push(`- 最大并发任务数: ${r.maxConcurrentTasks}\n`);
    }

    parts.push('\n请根据以上上下文回答用户问题。如需操作工作流蓝图，请使用工具调用。\n');

    if (options.includeToolInstructions && options.toolPromptText) {
      parts.push('\n' + options.toolPromptText);
    }

    return parts.join('');
  }

  /**
   * 构建完整消息列表
   * @param {string} content - 用户消息文本
   * @param {Array} attachments - 附件
   * @param {object|null} context - 上下文（仅用于system prompt，buildMessages本身不构建system，由调用方插入）
   * @param {Array} history - 历史消息
   * @param {string} modelId - 模型ID（用于token预算计算）
   * @returns {{ messages: Array, tokenCount: number, budget: number, usage: number }}
   */
  buildMessages(content, attachments = [], history = [], modelId = '') {
    const messages = [];

    if (Array.isArray(history) && history.length > 0) {
      const filteredHistory = history.filter(m => m.role !== 'system');
      messages.push(...filteredHistory);
    }

    if (attachments && attachments.length > 0) {
      const parts = [{ type: 'text', text: content }];
      for (const att of attachments) {
        if (att.type === 'image_url' || att.name?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          parts.push({
            type: 'image_url',
            image_url: { url: att.data || att.url, detail: 'auto' },
          });
        }
      }
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content });
    }

    const tokenCount = messages.reduce((sum, msg) => {
      if (!msg) return sum;
      if (typeof msg.content === 'string') {
        return sum + estimateTokens(msg.content);
      }
      if (Array.isArray(msg.content)) {
        let partSum = 0;
        for (const part of msg.content) {
          if (part.type === 'text') {
            partSum += estimateTokens(part.text || '');
          } else if (part.type === 'image_url') {
            const url = part.image_url?.url || '';
            const detail = part.image_url?.detail || 'auto';
            partSum += estimateImageTokens(url, detail);
          }
        }
        return sum + partSum;
      }
      if (msg.tool_calls) {
        return sum + estimateTokens(JSON.stringify(msg.tool_calls));
      }
      if (msg.role === 'tool' && msg.content) {
        return sum + estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
      }
      return sum;
    }, 0);

    const budget = getContextBudget(modelId);

    return {
      messages,
      tokenCount,
      budget,
      usage: Math.min(100, Math.round((tokenCount / budget) * 100)),
    };
  }

  /**
   * Token预算截断：在循环中按需要截断历史
   * @param {string} content
   * @param {Array} attachments
   * @param {Array} history
   * @param {string} modelId
   * @returns {{ messages: Array, tokenCount: number, budget: number, usage: number, truncated: boolean, history: Array }}
   */
  buildMessagesWithTruncation(content, attachments = [], history = [], modelId = '') {
    let workingHistory = [...history];
    let buildResult = this.buildMessages(content, attachments, workingHistory, modelId);
    const budget = buildResult.budget;
    const TRUNCATION_THRESHOLD = 0.8;

    while (buildResult.tokenCount > budget * TRUNCATION_THRESHOLD) {
      if (workingHistory.length <= 0) break;
      workingHistory.splice(0, 2);
      buildResult = this.buildMessages(content, attachments, workingHistory, modelId);
    }

    return {
      ...buildResult,
      truncated: workingHistory.length < (history?.length || 0),
      history: workingHistory,
    };
  }

  static getTokenCount(text) {
    return estimateTokens(text);
  }

  static getContextBudget(modelId) {
    return getContextBudget(modelId);
  }

  static estimateMessagesTokens(messages) {
    if (!Array.isArray(messages)) return 0;
    return messages.reduce((sum, msg) => {
      if (!msg) return sum;
      if (typeof msg.content === 'string') {
        return sum + estimateTokens(msg.content);
      }
      if (Array.isArray(msg.content)) {
        let partSum = 0;
        for (const part of msg.content) {
          if (part.type === 'text') {
            partSum += estimateTokens(part.text || '');
          } else if (part.type === 'image_url') {
            const url = part.image_url?.url || '';
            const detail = part.image_url?.detail || 'auto';
            partSum += estimateImageTokens(url, detail);
          }
        }
        return sum + partSum;
      }
      if (msg.tool_calls) {
        return sum + estimateTokens(JSON.stringify(msg.tool_calls));
      }
      if (msg.role === 'tool' && msg.content) {
        return sum + estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
      }
      return sum;
    }, 0);
  }

  static truncateMessagesInLoop(messages, thresholdTokens) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { messages, tokenCount: 0, truncated: false };
    }

    let tokenCount = ContextBuilder.estimateMessagesTokens(messages);
    if (tokenCount <= thresholdTokens) {
      return { messages, tokenCount, truncated: false };
    }

    const working = [...messages];
    let truncated = false;
    const systemMsg = working[0]?.role === 'system' ? working[0] : null;
    const hasSystem = systemMsg !== null;
    const startIdx = hasSystem ? 1 : 0;

    while (tokenCount > thresholdTokens && working.length > (hasSystem ? 2 : 1)) {
      let toolCallIdx = -1;
      for (let i = startIdx; i < working.length - 1; i++) {
        if (working[i].role === 'assistant' && working[i].tool_calls) {
          toolCallIdx = i;
          break;
        }
      }

      if (toolCallIdx !== -1) {
        let endIdx = toolCallIdx + 1;
        while (endIdx < working.length - 1 && working[endIdx].role === 'tool') {
          endIdx++;
        }
        if (endIdx < working.length - 1 &&
            working[endIdx].role === 'user' &&
            Array.isArray(working[endIdx].content) &&
            working[endIdx].content.some(p => p.type === 'image_url')) {
          endIdx++;
        }
        working.splice(toolCallIdx, endIdx - toolCallIdx);
        tokenCount = ContextBuilder.estimateMessagesTokens(working);
        truncated = true;
      } else {
        break;
      }
    }

    while (tokenCount > thresholdTokens && working.length > (hasSystem ? 3 : 2)) {
      const removeStart = hasSystem ? 1 : 0;
      if (working[removeStart].role === 'user' || working[removeStart].role === 'assistant') {
        let removeEnd = removeStart + 1;
        if (working[removeEnd] && (working[removeEnd].role === 'assistant' || working[removeEnd].role === 'user')) {
          removeEnd = removeStart + 2;
        }
        working.splice(removeStart, removeEnd - removeStart);
        tokenCount = ContextBuilder.estimateMessagesTokens(working);
        truncated = true;
      } else {
        break;
      }
    }

    return { messages: working, tokenCount, truncated };
  }
}
