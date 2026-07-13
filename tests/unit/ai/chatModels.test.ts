import { describe, it, expect, beforeEach } from 'vitest'
import {
	setDynamicCopilotModels,
	setDynamicCodexModels,
	getCopilotModels,
	getCodexModels,
	setCopilotEnabled,
	setCodexEnabled,
	convertCliModelsToCatalog,
} from '@/ai/models/chatModels'

describe('chatModels - model validation and filtering', () => {
	beforeEach(() => {
		setDynamicCopilotModels([])
		setDynamicCodexModels([])
		setCopilotEnabled(false)
		setCodexEnabled(false)
	})

	describe('setDynamicCodexModels filters invalid entries', () => {
		it('filters out null and undefined entries', () => {
			setDynamicCodexModels([
				{ id: 'valid-model', label: 'Valid', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' },
				null as any,
				undefined as any,
				{ id: 'another-valid', label: 'Another', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' },
			])
			const models = getCodexModels()
			expect(models).toHaveLength(2)
			expect(models.map(m => m.id)).toEqual(['valid-model', 'another-valid'])
		})

		it('filters out entries without string id', () => {
			setDynamicCodexModels([
				{ id: 'valid-model', label: 'Valid', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' },
				{ id: 123 as any, label: 'Bad ID', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' },
				{ label: 'No ID', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' } as any,
				{ id: '', label: 'Empty ID', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' },
			])
			const models = getCodexModels()
			expect(models.map(m => m.id)).toEqual(['valid-model'])
		})

		it('filters out non-object entries', () => {
			setDynamicCodexModels([
				{ id: 'valid', label: 'Valid', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' },
				'not-an-object' as any,
				12345 as any,
				true as any,
			])
			const models = getCodexModels()
			expect(models).toHaveLength(1)
			expect(models[0].id).toBe('valid')
		})

		it('returns default models when all dynamic models are invalid', () => {
			setDynamicCodexModels([
				null as any,
				{ id: '' } as any,
				'bad' as any,
			])
			const models = getCodexModels()
			expect(models.length).toBeGreaterThan(0)
			expect(models[0].id).toBeTruthy()
			expect(models.every(m => m.id && typeof m.id === 'string')).toBe(true)
		})
	})

	describe('getCopilotModels filters invalid entries from loaded models', () => {
		it('returns default models (non-empty) when not loaded', () => {
			const models = getCopilotModels()
			expect(models.length).toBeGreaterThan(0)
			expect(models.every(m => m.id && typeof m.id === 'string')).toBe(true)
		})

		it('filters invalid entries from dynamic models at retrieval time', () => {
			setDynamicCopilotModels([
				{ id: 'valid-copilot', label: 'Valid Copilot', needType: 'text', apiSource: 'copilot', legacyModelKey: 'copilot' },
				null as any,
				{ id: 456 as any, label: 'Bad' } as any,
			])
			const models = getCopilotModels()
			expect(models).toHaveLength(1)
			expect(models[0].id).toBe('valid-copilot')
		})

		it('returns defaults when loaded but all models are invalid', () => {
			setDynamicCopilotModels([null as any, undefined as any])
			const models = getCopilotModels()
			expect(models.length).toBeGreaterThan(0)
			expect(models[0].apiSource).toBe('copilot')
		})
	})

	describe('getCodexModels filters invalid entries from loaded models', () => {
		it('filters invalid entries from dynamic models at retrieval time', () => {
			setDynamicCodexModels([
				{ id: 'valid-codex', label: 'Valid Codex', needType: 'text', apiSource: 'codex', legacyModelKey: 'codex' },
				{ notId: 'missing-id' } as any,
			])
			const models = getCodexModels()
			expect(models).toHaveLength(1)
			expect(models[0].id).toBe('valid-codex')
		})
	})

	describe('convertCliModelsToCatalog', () => {
		it('converts CLI model info to catalog items', () => {
			const cliModels = [
				{ id: 'model-1', label: 'Model One', vendor: 'Test Vendor', recommended: true },
				{ id: 'model-2', label: 'Model Two' },
			]
			const result = convertCliModelsToCatalog(cliModels, 'copilot')
			expect(result).toHaveLength(2)
			expect(result[0].id).toBe('model-1')
			expect(result[0].label).toBe('Model One')
			expect(result[0].vendor).toBe('Test Vendor')
			expect(result[0].recommended).toBe(true)
			expect(result[0].apiSource).toBe('copilot')
			expect(result[0].legacyModelKey).toBe('copilot')
			expect(result[1].vendor).toBe('GitHub Copilot')
		})

		it('uses id as label when label is not provided', () => {
			const result = convertCliModelsToCatalog([{ id: 'no-label-model' }], 'codex')
			expect(result[0].label).toBe('no-label-model')
			expect(result[0].apiSource).toBe('codex')
			expect(result[0].legacyModelKey).toBe('codex')
		})
	})
})

describe('chatModels - unsupported model fallback logic', () => {
	function getValidModelIds(models: any[]): string[] {
		if (!models || !Array.isArray(models)) return []
		return models.filter(m => m && typeof m === 'object').map((m: any) => m.id).filter((id: any) => id && typeof id === 'string')
	}

	function resolveModel(requestedModel: string, configuredModels: any[], defaultModel: string): string {
		const validModelIds = getValidModelIds(configuredModels)
		if (validModelIds.length > 0 && validModelIds.includes(requestedModel)) {
			return requestedModel
		}
		return validModelIds.length > 0 ? validModelIds[0] : defaultModel
	}

	it('selects first valid model when requested model is unavailable', () => {
		const configuredModels = [
			{ id: 'codex-mini', label: 'Codex Mini' },
			{ id: 'gpt-5', label: 'GPT-5' },
		]
		expect(resolveModel('unavailable-model', configuredModels, 'codex-mini')).toBe('codex-mini')
	})

	it('uses requested model when it is available', () => {
		const configuredModels = [
			{ id: 'codex-mini', label: 'Codex Mini' },
			{ id: 'gpt-5', label: 'GPT-5' },
		]
		expect(resolveModel('gpt-5', configuredModels, 'codex-mini')).toBe('gpt-5')
	})

	it('falls back to hardcoded default when no valid models configured', () => {
		const configuredModels: any[] = [null, { id: '' }, undefined]
		expect(resolveModel('some-model', configuredModels, 'codex-mini')).toBe('codex-mini')
	})

	it('handles empty model list by using default', () => {
		expect(resolveModel('any-model', [], 'auto')).toBe('auto')
	})

	it('handles null/undefined model list by using default', () => {
		expect(resolveModel('any-model', null as any, 'auto')).toBe('auto')
		expect(resolveModel('any-model', undefined as any, 'auto')).toBe('auto')
	})
})
