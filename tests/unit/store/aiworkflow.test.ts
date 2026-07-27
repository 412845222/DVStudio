import { describe, it, expect, beforeEach } from 'vitest'
import { AIWorkflowStore, createDefaultAIWorkflowState } from '@/store/aiworkflow/store'

describe('store/aiworkflow', () => {
	let store: typeof AIWorkflowStore

	beforeEach(() => {
		store = AIWorkflowStore
	})

	describe('hydrateDraft - node chat fields', () => {
		it('should preserve valid nodeChatDraft string', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-1': {
							id: 'node-1',
							type: 'image',
							title: 'Test Node',
							nodeChatDraft: 'test draft text',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-1'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-1'].nodeChatDraft).toBe('test draft text')
		})

		it('should set nodeChatDraft to undefined for non-string types (number)', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-2': {
							id: 'node-2',
							type: 'image',
							title: 'Test Node',
							nodeChatDraft: 12345,
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-2'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-2'].nodeChatDraft).toBeUndefined()
		})

		it('should set nodeChatDraft to undefined for invalid types', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-3': {
							id: 'node-3',
							type: 'image',
							title: 'Test Node',
							nodeChatDraft: { not: 'a string' },
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-3'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-3'].nodeChatDraft).toBeUndefined()
		})

		it('should preserve valid nodeChatParams object', () => {
			const params = { modelId: 'model-1', speed: 'fast' }
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-4': {
							id: 'node-4',
							type: 'image',
							title: 'Test Node',
							nodeChatParams: params,
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-4'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-4'].nodeChatParams).toEqual(params)
		})

		it('should set nodeChatParams to undefined for non-object types', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-5': {
							id: 'node-5',
							type: 'image',
							title: 'Test Node',
							nodeChatParams: 'not an object',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-5'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-5'].nodeChatParams).toBeUndefined()
		})

		it('should preserve valid prompt string (legacy field)', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-6': {
							id: 'node-6',
							type: 'image',
							title: 'Test Node',
							prompt: 'legacy prompt text',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-6'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-6'].prompt).toBe('legacy prompt text')
		})

		it('should set prompt to undefined for non-string types (number)', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-7': {
							id: 'node-7',
							type: 'image',
							title: 'Test Node',
							prompt: 999,
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-7'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-7'].prompt).toBeUndefined()
		})

		it('should set prompt to undefined for invalid types', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-8': {
							id: 'node-8',
							type: 'image',
							title: 'Test Node',
							prompt: { invalid: 'type' },
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-8'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(store.state.nodesById['node-8'].prompt).toBeUndefined()
		})

		it('should handle all three chat fields together', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-9': {
							id: 'node-9',
							type: 'text',
							title: 'Text Generation Node',
							nodeChatDraft: 'draft text',
							nodeChatParams: { modelId: 'gpt-4', maxTokens: 1024 },
							prompt: 'fallback prompt',
							worldX: 100,
							worldY: 200,
							width: 320,
							height: 200,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-9'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			const node = store.state.nodesById['node-9']
			expect(node.nodeChatDraft).toBe('draft text')
			expect(node.nodeChatParams).toEqual({ modelId: 'gpt-4', maxTokens: 1024 })
			expect(node.prompt).toBe('fallback prompt')
		})

		it('should handle missing chat fields gracefully', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'node-10': {
							id: 'node-10',
							type: 'image',
							title: 'Image Node',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['node-10'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			const node = store.state.nodesById['node-10']
			expect(node.nodeChatDraft).toBeUndefined()
			expect(node.nodeChatParams).toBeUndefined()
			expect(node.prompt).toBeUndefined()
		})
	})

	describe('createDefaultAIWorkflowState - empty blueprint (no default nodes)', () => {
		it('should return empty nodesById and nodeOrder for new projects', () => {
			const state = createDefaultAIWorkflowState()
			expect(Object.keys(state.nodesById)).toHaveLength(0)
			expect(state.nodeOrder).toHaveLength(0)
			expect(state.edgesById).toEqual({})
			expect(state.edgeOrder).toHaveLength(0)
		})

		it('should have default viewport at origin with zoom 1', () => {
			const state = createDefaultAIWorkflowState()
			expect(state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 })
		})

		it('should have no selected nodes or edges by default', () => {
			const state = createDefaultAIWorkflowState()
			expect(state.selectedNodeId).toBeNull()
			expect(state.selectedNodeIds).toEqual([])
			expect(state.selectedEdgeId).toBeNull()
		})
	})

	describe('hydrateDraft - empty snapshot should stay empty (no default node injection)', () => {
		it('should produce empty canvas when hydrating an empty snapshot', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {},
					nodeOrder: [],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			expect(Object.keys(store.state.nodesById)).toHaveLength(0)
			expect(store.state.nodeOrder).toHaveLength(0)
			expect(Object.keys(store.state.edgesById)).toHaveLength(0)
		})

		it('should not inject NanoBanana reference node when hydrating empty snapshot', () => {
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {},
					nodeOrder: [],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			const allNodes = Object.values(store.state.nodesById)
			const nanoNodes = allNodes.filter(
				(n) => n.type === 'nanoanchor' || (n.title && n.title.includes('NanoBanana'))
			)
			expect(nanoNodes).toHaveLength(0)
		})
	})
})