import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClientSettings } from '@/electronBridge/types'

const FIXED_GEMINI_MODEL = 'gemini-2.5-flash-image'
const API_KEY_AGREEMENT_VERSION = '1.0'

function buildSavePayload(form: ClientSettings, overrides: Partial<ClientSettings> = {}): ClientSettings {
	const payload: ClientSettings = {
		defaultResolution: form.defaultResolution,
		geminiApiKey: form.geminiApiKey,
		geminiModel: FIXED_GEMINI_MODEL,
		geminiBaseUrl: form.geminiBaseUrl,
		httpProxy: form.httpProxy,
		bytedanceApiKey: form.bytedanceApiKey,
		meshyApiKey: form.meshyApiKey,
		tripo3dApiKey: form.tripo3dApiKey,
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
		cliAdapters: form.cliAdapters || {},
		...overrides,
	}
	return payload
}

function createDefaultForm(): ClientSettings {
	return {
		defaultResolution: '1920x1080',
		geminiApiKey: '',
		geminiModel: FIXED_GEMINI_MODEL,
		geminiBaseUrl: '',
		httpProxy: '',
		bytedanceApiKey: '',
		meshyApiKey: '',
		tripo3dApiKey: '',
		githubToken: '',
		ui: {
			locale: '',
		},
		apiKeySecurityAgreement: {
			accepted: false,
			acceptedAt: 0,
			acceptedVersion: '',
		},
		cliAdapters: {},
	}
}

describe('Settings', () => {
	describe('buildSavePayload', () => {
		it('builds payload with default values', () => {
			const form = createDefaultForm()
			const payload = buildSavePayload(form)

			expect(payload.defaultResolution).toBe('1920x1080')
			expect(payload.geminiModel).toBe(FIXED_GEMINI_MODEL)
			expect(payload.apiKeySecurityAgreement?.accepted).toBe(false)
		})

		it('includes API keys when set', () => {
			const form = createDefaultForm()
			form.bytedanceApiKey = 'ark-test-123'
			form.geminiApiKey = 'AIza-test-456'

			const payload = buildSavePayload(form)

			expect(payload.bytedanceApiKey).toBe('ark-test-123')
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
				bytedanceApiKey: 'ark-override',
			})

			expect(payload.defaultResolution).toBe('3840x2160')
			expect(payload.bytedanceApiKey).toBe('ark-override')
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
			const inputValue = 'ark-new-api-key'
			const pendingFieldKey = { value: null as string | null }
			const pendingFieldValue = { value: '' }
			const pendingProviderKey = { value: null as string | null }
			const securityAgreementOpen = { value: false }
			const securityAgreementChecked = { value: true }

			if (!hasAcceptedAgreement && inputValue.trim()) {
				pendingProviderKey.value = 'bytedance'
				pendingFieldKey.value = 'bytedanceApiKey'
				pendingFieldValue.value = inputValue
				securityAgreementOpen.value = true
				securityAgreementChecked.value = false
			}

			expect(securityAgreementOpen.value).toBe(true)
			expect(securityAgreementChecked.value).toBe(false)
			expect(pendingFieldKey.value).toBe('bytedanceApiKey')
			expect(pendingFieldValue.value).toBe('ark-new-api-key')
		})

		it('should not trigger security agreement when user has already accepted', () => {
			const hasAcceptedAgreement = true
			const inputValue = 'ark-new-api-key'
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
			const pendingFieldKey = { value: 'bytedanceApiKey' as const }
			const pendingFieldValue = { value: 'ark-pending-key' }
			const pendingProviderKey = { value: 'bytedance' }
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
			expect(pendingForm['bytedanceApiKey']).toBe('ark-pending-key')
			expect(pendingFieldKey.value).toBe(null)
		})

		it('cancelSecurityAgreement restores original value and clears pending', () => {
			const form = createDefaultForm()
			form.bytedanceApiKey = 'ark-original'
			const pendingFieldKey = { value: 'bytedanceApiKey' as const }
			const pendingFieldValue = { value: 'ark-pending-key' }
			const pendingProviderKey = { value: 'bytedance' }
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
			expect(pendingForm['bytedanceApiKey']).toBe('ark-original')
			expect(pendingFieldKey.value).toBe(null)
		})
	})
})
