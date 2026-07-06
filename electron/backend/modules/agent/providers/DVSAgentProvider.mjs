/**
 * DVSAgent Provider
 *
 * 基于 OpenAI 兼容 API 的多模型 Provider，支持 DeepSeek/豆包/Gemini/OpenAI 等。
 * 继承 ApiLLMProvider，设置基础标识。
 */

import { ApiLLMProvider } from './ApiLLMProvider.mjs';

export class DVSAgentProvider extends ApiLLMProvider {
  constructor(ctx) {
    super(ctx);
  }

  get id() { return 'dvsagent'; }

  get displayName() { return 'DVS Agent'; }
}
