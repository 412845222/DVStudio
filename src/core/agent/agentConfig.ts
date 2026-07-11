import type { AgentSettings, AgentThinkingEffort } from '../../electronBridge/types';

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
	maxToolCalls: 35,
	defaultThinkingEffort: 'medium',
	enableToolCallWarning: true,
	autoScrollToBottom: true,
	showThoughtProcess: false
};

export const AGENT_CONFIG_CONSTRAINTS = {
	maxToolCalls: { min: 5, max: 500, step: 5 }
};

export const THINKING_EFFORT_OPTIONS: Array<{ value: AgentThinkingEffort; label: string; description: string }> = [
	{ value: 'disabled', label: '禁用', description: '不使用思考模式，响应最快' },
	{ value: 'low', label: '低', description: '快速思考，平衡速度与质量' },
	{ value: 'medium', label: '中', description: '标准思考深度（推荐）' },
	{ value: 'high', label: '高', description: '深度思考，质量更高但更慢' }
];

let cachedSettings: AgentSettings | null = null;

export function getDefaultAgentSettings(): AgentSettings {
	return { ...DEFAULT_AGENT_SETTINGS };
}

export function mergeAgentSettings(stored?: Partial<AgentSettings>): AgentSettings {
	return {
		...DEFAULT_AGENT_SETTINGS,
		...stored
	};
}

export async function loadAgentSettings(): Promise<AgentSettings> {
	try {
		if (window.dweb?.common?.getClientSettings) {
			const result = await window.dweb.common.getClientSettings();
			if (result.ok && result.data) {
				cachedSettings = mergeAgentSettings(result.data.agent);
				return cachedSettings;
			}
		}
	} catch (e) {
		console.warn('Failed to load agent settings:', e);
	}
	cachedSettings = getDefaultAgentSettings();
	return cachedSettings;
}

export async function saveAgentSettings(settings: AgentSettings): Promise<boolean> {
	try {
		if (window.dweb?.common?.saveClientSettings) {
			const result = await window.dweb.common.getClientSettings();
			if (result.ok && result.data) {
				const updated = {
					...result.data,
					agent: settings
				};
				await window.dweb.common.saveClientSettings(updated);
				cachedSettings = { ...settings };
				return true;
			}
		}
	} catch (e) {
		console.error('Failed to save agent settings:', e);
	}
	return false;
}

export function getCachedAgentSettings(): AgentSettings {
	if (!cachedSettings) {
		cachedSettings = getDefaultAgentSettings();
	}
	return cachedSettings;
}

export function validateMaxToolCalls(value: number): number {
	const { min, max } = AGENT_CONFIG_CONSTRAINTS.maxToolCalls;
	if (isNaN(value) || value < min) return min;
	if (value > max) return max;
	return Math.round(value / AGENT_CONFIG_CONSTRAINTS.maxToolCalls.step) * AGENT_CONFIG_CONSTRAINTS.maxToolCalls.step;
}
