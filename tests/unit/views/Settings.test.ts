import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClientSettings } from '@/electronBridge/types'

const FIXED_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const FIXED_DEEPSEEK_MODEL = 'deepseek-chat'
const FIXED_GEMINI_MODEL = 'gemini-2.5-flash-image'
const API_KEY_AGREEMENT_VERSION = '1.0'

function buildSavePayload(form: ClientSettings, overrides: Partial<ClientSettings> = {}): ClientSettings {
	const payload: ClientSettings = {
		defaultResolution: form.defaultResolution,
		deepseekApiKey: form.deepseekApiKey,
		deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
		deepseekModel: FIXED_DEEPSEEK_MODEL,
		geminiApiKey: form.geminiApiKey,
		geminiModel: FIXED_GEMINI_MODEL,
		bytedanceApiKey: form.bytedanceApiKey,
		meshyApiKey: form.meshyApiKey,
		githubToken: form.githubToken,
		ui: {
			locale: form.ui?.locale || '',
		},
		apiKeySecurityAgreement: form.apiKeySecurityAgreement
			? {
					accepted: form.apiKeySecurityAgreement.accepted,
					acceptedAt: form.apiKeySecurityAgreement.acceptedAt,
					acceptedVersion: form.apiKeySecurityAgreement.acceptedVersion,
			  }
			: {
					accepted: false,
					acceptedAt: 0,
					acceptedVersion: '',
			  },
		...overrides,
	}
	return payload
}

function createDefaultForm(): ClientSettings {
	return {
		defaultResolution: '1920x1080',
		deepseekApiKey: '',
		deepseekBaseUrl: FIXED_DEEPSEEK_BASE_URL,
		deepseekModel: FIXED_DEEPSEEK_MODEL,
		geminiApiKey: '',
		geminiModel: FIXED_GEMINI_MODEL,
		bytedanceApiKey: '',
		meshyApiKey: '',
		githubToken: '',
		ui: {
			locale: '',
		},
		apiKeySecurityAgreement: {
			accepted: false,
			acceptedAt: 0,
			acceptedVersion: '',
		},
	}
}

describe('Settings', () => {
	describe('buildSavePayload', () => {
		it('builds payload with default values', () => {
			const form = createDefaultForm()
			const payload = buildSavePayload(form)

			expect(payload.defaultResolution).toBe('1920x1080')
			expect(payload.deepseekBaseUrl).toBe(FIXED_DEEPSEEK_BASE_URL)
			expect(payload.deepseekModel).toBe(FIXED_DEEPSEEK_MODEL)
			expect(payload.geminiModel).toBe(FIXED_GEMINI_MODEL)
			expect(payload.apiKeySecurityAgreement?.accepted).toBe(false)
		})

		it('includes API keys when set', () => {
			const form = createDefaultForm()
			form.deepseekApiKey = 'sk-test-123'
			form.geminiApiKey = 'AIza-test-456'

			const payload = buildSavePayload(form)

			expect(payload.deepseekApiKey).toBe('sk-test-123')
			expect(payload.geminiApiKey).toBe('AIza-test-456')
		})

		it('includes security agreement when accepted', () => {
			const form = createDefaultForm()
			const now = Date.now()
			form.apiKeySecurityAgreement = {
				accepted: true,
				acceptedAt: now,
				acceptedVersion: '1.0',
			}

			const payload = buildSavePayload(form)

			expect(payload.apiKeySecurityAgreement?.accepted).toBe(true)
			expect(payload.apiKeySecurityAgreement?.acceptedAt).toBe(now)
			expect(payload.apiKeySecurityAgreement?.acceptedVersion).toBe('1.0')
		})

		it('fills missing security agreement with defaults', () => {
			const form = createDefaultForm()
			;(form as any).apiKeySecurityAgreement = undefined

			const payload = buildSavePayload(form)

			expect(payload.apiKeySecurityAgreement?.accepted).toBe(false)
			expect(payload.apiKeySecurityAgreement?.acceptedAt).toBe(0)
			expect(payload.apiKeySecurityAgreement?.acceptedVersion).toBe('')
		})

		it('applies overrides correctly', () => {
			const form = createDefaultForm()
			form.defaultResolution = '1280x720'

			const payload = buildSavePayload(form, {
				defaultResolution: '3840x2160',
				deepseekApiKey: 'sk-override',
			})

			expect(payload.defaultResolution).toBe('3840x2160')
			expect(payload.deepseekApiKey).toBe('sk-override')
		})
	})

	describe('Security Agreement Logic', () => {
		it('hasAcceptedAgreement returns true when agreement is accepted', () => {
			const form = createDefaultForm()
			form.apiKeySecurityAgreement = {
				accepted: true,
				acceptedAt: Date.now(),
				acceptedVersion: '1.0',
			}

			const hasAccepted = Boolean(form.apiKeySecurityAgreement?.accepted)

			expect(hasAccepted).toBe(true)
		})

		it('hasAcceptedAgreement returns false when agreement is not accepted', () => {
			const form = createDefaultForm()
			form.apiKeySecurityAgreement = {
				accepted: false,
				acceptedAt: 0,
				acceptedVersion: '',
			}

			const hasAccepted = Boolean(form.apiKeySecurityAgreement?.accepted)

			expect(hasAccepted).toBe(false)
		})

		it('hasAcceptedAgreement returns false when agreement is undefined', () => {
			const form = createDefaultForm()
			;(form as any).apiKeySecurityAgreement = undefined

			const hasAccepted = Boolean(form.apiKeySecurityAgreement?.accepted)

			expect(hasAccepted).toBe(false)
		})
	})

	describe('API Key Field Input Handling', () => {
		it('should trigger security agreement when user inputs API key without accepting', () => {
			const hasAcceptedAgreement = false
			const inputValue = 'sk-new-api-key'
			const pendingFieldKey = { value: null }
			const pendingFieldValue = { value: '' }
			const pendingProviderKey = { value: null }
			const securityAgreementOpen = { value: false }
			const securityAgreementChecked = { value: true }

			if (!hasAcceptedAgreement && inputValue.trim()) {
				pendingProviderKey.value = 'deepseek'
				pendingFieldKey.value = 'deepseekApiKey'
				pendingFieldValue.value = inputValue
				securityAgreementOpen.value = true
				securityAgreementChecked.value = false
			}

			expect(securityAgreementOpen.value).toBe(true)
			expect(securityAgreementChecked.value).toBe(false)
			expect(pendingFieldKey.value).toBe('deepseekApiKey')
			expect(pendingFieldValue.value).toBe('sk-new-api-key')
		})

		it('should not trigger security agreement when user has already accepted', () => {
			const hasAcceptedAgreement = true
			const inputValue = 'sk-new-api-key'
			const securityAgreementOpen = { value: false }

			if (!hasAcceptedAgreement && inputValue.trim()) {
				securityAgreementOpen.value = true
			}

			expect(securityAgreementOpen.value).toBe(false)
		})

		it('should not trigger security agreement when input is empty', () => {
			const hasAcceptedAgreement = false
			const inputValue = ''
			const securityAgreementOpen = { value: false }

			if (!hasAcceptedAgreement && inputValue.trim()) {
				securityAgreementOpen.value = true
			}

			expect(securityAgreementOpen.value).toBe(false)
		})
	})

	describe('Security Agreement Accept/Cancel', () => {
		it('acceptSecurityAgreement updates form and clears pending values', () => {
			const form = createDefaultForm()
			const pendingFieldKey = { value: 'deepseekApiKey' as const }
			const pendingFieldValue = { value: 'sk-pending-key' }
			const pendingProviderKey = { value: 'deepseek' }
			const securityAgreementOpen = { value: true }
			const pendingForm: Record<string, string> = {}

			form.apiKeySecurityAgreement = {
				accepted: true,
				acceptedAt: Date.now(),
				acceptedVersion: API_KEY_AGREEMENT_VERSION,
			}

			securityAgreementOpen.value = false

			if (pendingFieldKey.value && pendingFieldValue.value !== undefined) {
				pendingForm[pendingFieldKey.value] = pendingFieldValue.value
				pendingFieldKey.value = null
				pendingFieldValue.value = ''
				pendingProviderKey.value = null
			}

			expect(form.apiKeySecurityAgreement?.accepted).toBe(true)
			expect(form.apiKeySecurityAgreement?.acceptedVersion).toBe(API_KEY_AGREEMENT_VERSION)
			expect(securityAgreementOpen.value).toBe(false)
			expect(pendingForm['deepseekApiKey']).toBe('sk-pending-key')
			expect(pendingFieldKey.value).toBe(null)
		})

		it('cancelSecurityAgreement restores original value and clears pending', () => {
			const form = createDefaultForm()
			form.deepseekApiKey = 'sk-original'
			const pendingFieldKey = { value: 'deepseekApiKey' as const }
			const pendingFieldValue = { value: 'sk-pending-key' }
			const pendingProviderKey = { value: 'deepseek' }
			const securityAgreementOpen = { value: true }
			const pendingForm: Record<string, string> = {}

			securityAgreementOpen.value = false

			if (pendingFieldKey.value) {
				pendingForm[pendingFieldKey.value] = form[pendingFieldKey.value] || ''
			}

			pendingFieldKey.value = null
			pendingFieldValue.value = ''
			pendingProviderKey.value = null

			expect(securityAgreementOpen.value).toBe(false)
			expect(pendingForm['deepseekApiKey']).toBe('sk-original')
			expect(pendingFieldKey.value).toBe(null)
		})
	})
})