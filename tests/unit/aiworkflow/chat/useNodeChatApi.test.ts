import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, provide } from 'vue'
import { mount } from '@vue/test-utils'
import {
	NodeChatApiKey,
	provideNodeChatApi,
	useNodeChatApi,
	type NodeChatApi
} from '@/ui/BluePrint/node-dialog/useNodeChatApi'

function createMockApi(overrides: Partial<NodeChatApi> = {}): NodeChatApi {
	return {
		getState: vi.fn((nodeId: string) => ({
			visible: false,
			draft: '',
			params: {},
			selectedRefs: [],
			submitting: false
		})),
		open: vi.fn(),
		close: vi.fn(),
		saveDraft: vi.fn(),
		saveParams: vi.fn(),
		saveSelectedRefs: vi.fn(),
		flush: vi.fn(),
		submit: vi.fn(),
		stop: vi.fn(),
		removeParamRef: vi.fn(),
		...overrides
	}
}

describe('useNodeChatApi', () => {
	describe('provide/inject contract', () => {
		it('throws when no NodeChatApi is provided', () => {
			const Child = defineComponent({
				setup() {
					expect(() => useNodeChatApi()).toThrow(/NodeChatApi not provided/)
					return () => h('div')
				}
			})
			mount(Child)
		})

		it('returns the provided API via provideNodeChatApi', () => {
			const mockApi = createMockApi()
			let injected: NodeChatApi | null = null

			const Child = defineComponent({
				setup() {
					injected = useNodeChatApi()
					return () => h('div')
				}
			})

			const Parent = defineComponent({
				setup() {
					provideNodeChatApi(mockApi)
					return () => h(Child)
				}
			})

			mount(Parent)
			expect(injected).toBe(mockApi)
		})

		it('returns the provided API via raw provide with NodeChatApiKey', () => {
			const mockApi = createMockApi()
			let injected: NodeChatApi | null = null

			const Child = defineComponent({
				setup() {
					injected = useNodeChatApi()
					return () => h('div')
				}
			})

			const Parent = defineComponent({
				setup() {
					provide(NodeChatApiKey, mockApi)
					return () => h(Child)
				}
			})

			mount(Parent)
			expect(injected).toBe(mockApi)
		})
	})

	describe('NodeChatApi interface', () => {
		it('getState returns a complete state object', () => {
			const expectedState = {
				visible: true,
				draft: 'hello world',
				params: { model: 'gpt-4' },
				selectedRefs: [{ kind: 'image', label: 'ref1' }],
				submitting: false
			}
			const mockApi = createMockApi({
				getState: vi.fn(() => expectedState)
			})

			const state = mockApi.getState('node-1')
			expect(state.visible).toBe(true)
			expect(state.draft).toBe('hello world')
			expect(state.params).toEqual({ model: 'gpt-4' })
			expect(state.selectedRefs).toHaveLength(1)
			expect(state.submitting).toBe(false)
		})

		it('open/close/saveDraft/saveParams/saveSelectedRefs are callable with nodeId', () => {
			const mockApi = createMockApi()

			mockApi.open('node-1', 'text')
			expect(mockApi.open).toHaveBeenCalledWith('node-1', 'text')

			mockApi.close('node-1')
			expect(mockApi.close).toHaveBeenCalledWith('node-1')

			mockApi.saveDraft('node-1', 'new draft')
			expect(mockApi.saveDraft).toHaveBeenCalledWith('node-1', 'new draft')

			mockApi.saveParams('node-1', { key: 'value' })
			expect(mockApi.saveParams).toHaveBeenCalledWith('node-1', { key: 'value' })

			const refs = [{ kind: 'image', label: 'r1' }]
			mockApi.saveSelectedRefs('node-1', refs)
			expect(mockApi.saveSelectedRefs).toHaveBeenCalledWith('node-1', refs)
		})

		it('submit/stop/removeParamRef/flush accept correct payloads', () => {
			const mockApi = createMockApi()
			const payload = {
				nodeId: 'node-1',
				nodeType: 'text',
				prompt: 'test',
				params: {},
				paramKey: 'aiText',
				selectedReferences: []
			}

			mockApi.submit('node-1', payload)
			expect(mockApi.submit).toHaveBeenCalledWith('node-1', payload)

			mockApi.stop('node-1')
			expect(mockApi.stop).toHaveBeenCalledWith('node-1')

			const refItem = { kind: 'image', label: 'r1', edgeId: 'e1' }
			mockApi.removeParamRef('node-1', refItem)
			expect(mockApi.removeParamRef).toHaveBeenCalledWith('node-1', refItem)

			const flushState = { draft: 'saved draft', params: { a: 1 } }
			mockApi.flush('node-1', flushState)
			expect(mockApi.flush).toHaveBeenCalledWith('node-1', flushState)
		})
	})

	describe('draft persistence contract', () => {
		it('saveDraft persists draft so that getState returns it (integration-style mock)', () => {
			const storedDrafts = new Map<string, string>()
			const mockApi: NodeChatApi = {
				getState: (nodeId) => ({
					visible: true,
					draft: storedDrafts.get(nodeId) ?? '',
					params: {},
					selectedRefs: [],
					submitting: false
				}),
				open: vi.fn(),
				close: vi.fn(),
				saveDraft: (nodeId, draft) => {
					storedDrafts.set(nodeId, draft)
				},
				saveParams: vi.fn(),
				saveSelectedRefs: vi.fn(),
				flush: vi.fn(),
				submit: vi.fn(),
				stop: vi.fn(),
				removeParamRef: vi.fn()
			}

			mockApi.saveDraft('node-a', 'my first draft')
			mockApi.saveDraft('node-b', 'another prompt')

			expect(mockApi.getState('node-a').draft).toBe('my first draft')
			expect(mockApi.getState('node-b').draft).toBe('another prompt')
			expect(mockApi.getState('node-c').draft).toBe('')
		})
	})
})
