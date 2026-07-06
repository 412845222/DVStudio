/**
 * LLM Provider 注册中心
 */

import { DVSAgentProvider } from './DVSAgentProvider.mjs';
import { CopilotProvider } from './CopilotProvider.mjs';
import { CodexProvider } from './CodexProvider.mjs';

const providers = new Map();

function register(ProviderClass) {
  const tmp = new ProviderClass({});
  providers.set(tmp.id, ProviderClass);
}

register(DVSAgentProvider);
register(CopilotProvider);
register(CodexProvider);

export function getProviderById(id) {
  return providers.get(id) || null;
}

export function listProviders() {
  return Array.from(providers.keys());
}

export function registerProvider(ProviderClass) {
  register(ProviderClass);
}
