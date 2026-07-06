/**
 * GitHub Copilot CLI Provider
 */

import { CliLLMProvider } from './CliLLMProvider.mjs';

export class CopilotProvider extends CliLLMProvider {
  constructor(ctx) {
    super(ctx);
  }

  get id() { return 'copilot'; }

  get displayName() { return 'GitHub Copilot'; }

  get adapterName() { return 'copilot'; }
}
