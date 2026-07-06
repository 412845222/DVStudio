/**
 * OpenAI Codex CLI Provider
 */

import { CliLLMProvider } from './CliLLMProvider.mjs';

export class CodexProvider extends CliLLMProvider {
  constructor(ctx) {
    super(ctx);
  }

  get id() { return 'codex'; }

  get displayName() { return 'OpenAI Codex'; }

  get adapterName() { return 'codex'; }
}
