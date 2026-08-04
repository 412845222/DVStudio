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

	describe('hydrateDraft - node deletion sync (fix: deleted nodes reappear after refresh)', () => {
		it('should delete old nodes not present in snapshot (user deleted them, engine confirms deletion)', () => {
			// First, set up a canvas with one old node (created 10 seconds ago)
			const oldTimestamp = Date.now() - 10000
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'old-node': {
							id: 'old-node',
							type: 'image',
							title: 'Old Node',
							worldX: 100,
							worldY: 100,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: oldTimestamp
						}
					},
					nodeOrder: ['old-node'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})
			expect(store.state.nodesById['old-node']).toBeDefined()

			// Simulate: user deleted the node, engine syncs snapshot without that node
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						'other-node': {
							id: 'other-node',
							type: 'text',
							title: 'Other Node',
							worldX: 200,
							worldY: 200,
							width: 240,
							height: 160,
							inputs: [],
							outputs: [],
							createdAt: oldTimestamp
						}
					},
					nodeOrder: ['other-node'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			// The old-node should be DELETED (it was not in the snapshot and is not recent)
			expect(store.state.nodesById['old-node']).toBeUndefined()
			expect(store.state.nodesById['other-node']).toBeDefined()
		})

		it('should preserve very recently created nodes (batch import scenario where engine has not synced yet)', () => {
			// First set up an existing canvas
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						existing: {
							id: 'existing',
							type: 'image',
							title: 'Existing',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now() - 60000
						}
					},
					nodeOrder: ['existing'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			// Simulate: user just batch-imported media, creating new nodes in Vuex state
			// These nodes were created 500ms ago (very recent) and are not yet in engine snapshot
			const veryRecentTimestamp = Date.now() - 500
			store.state.nodesById['brand-new-1'] = {
				id: 'brand-new-1',
				type: 'image',
				title: 'Just Imported 1',
				worldX: 300,
				worldY: 100,
				width: 280,
				height: 180,
				inputs: [],
				outputs: [],
				createdAt: veryRecentTimestamp
			} as any
			store.state.nodeOrder = [...store.state.nodeOrder, 'brand-new-1']

			// Engine syncs snapshot (still only has the existing node, not the new ones yet)
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						existing: {
							id: 'existing',
							type: 'image',
							title: 'Existing',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now() - 60000
						}
					},
					nodeOrder: ['existing'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			// The brand-new node should be PRESERVED (it was created <3s ago)
			expect(store.state.nodesById['brand-new-1']).toBeDefined()
			expect(store.state.nodesById['existing']).toBeDefined()
		})

		it('empty snapshot (clear canvas) should remove ALL nodes regardless of recency', () => {
			// First clear any leftover state from previous tests
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {},
					nodeOrder: [],
					edgesById: {},
					edgeOrder: [],
					resourcesById: {},
					resourceOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			// Set up a canvas with a very recent node
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {
						recent: {
							id: 'recent',
							type: 'image',
							title: 'Recent Node',
							worldX: 0,
							worldY: 0,
							width: 280,
							height: 180,
							inputs: [],
							outputs: [],
							createdAt: Date.now()
						}
					},
					nodeOrder: ['recent'],
					edgesById: {},
					edgeOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})
			expect(Object.keys(store.state.nodesById)).toHaveLength(1)

			// Empty snapshot = clear canvas operation
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

			// ALL nodes must be cleared, even recent ones
			expect(Object.keys(store.state.nodesById)).toHaveLength(0)
			expect(store.state.nodeOrder).toHaveLength(0)
		})
	})

	describe('hydrateDraft - resource deletion sync', () => {
		it('should clear all resources when snapshot has no resources', () => {
			// First clear state
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {},
					nodeOrder: [],
					edgesById: {},
					edgeOrder: [],
					resourcesById: {},
					resourceOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			// Set up a canvas with a resource
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {},
					nodeOrder: [],
					edgesById: {},
					edgeOrder: [],
					resourcesById: {
						'res-1': {
							id: 'res-1',
							kind: 'image',
							name: 'test.png',
							url: 'file:///test.png'
						}
					},
					resourceOrder: ['res-1'],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})
			expect(Object.keys(store.state.resourcesById)).toHaveLength(1)

			// Empty resources snapshot = resources were deleted
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById: {},
					nodeOrder: [],
					edgesById: {},
					edgeOrder: [],
					resourcesById: {},
					resourceOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: null,
					selectedNodeIds: [],
					selectedEdgeId: null
				}
			})

			// All resources should be cleared
			expect(Object.keys(store.state.resourcesById)).toHaveLength(0)
			expect(store.state.resourceOrder).toHaveLength(0)
		})
	})

	describe('hydrateDraft - empty selection state preservation (fix blueprint always-selected bug)', () => {
		const baseSnapshot = (extraNodes: any[] = []) => ({
			nodesById: Object.fromEntries(extraNodes.map((n) => [n.id, n])),
			nodeOrder: extraNodes.map((n) => n.id),
			edgesById: {},
			edgeOrder: [],
			resourcesById: {},
			resourceOrder: [],
			viewport: { zoom: 1, panX: 0, panY: 0 },
			selectedEdgeId: null
		})

		const mkNode = (id: string) => ({
			id,
			type: 'image',
			title: `Node ${id}`,
			worldX: 0,
			worldY: 0,
			width: 280,
			height: 180,
			inputs: [],
			outputs: [],
			createdAt: Date.now()
		})

		it('should NOT fallback to nodeOrder[0] when snapshot has empty selectedNodeIds and selectedNodeId=null', () => {
			const nodes = [mkNode('node-first'), mkNode('node-second')]
			// Simulates engine clearSelection → snapshot.selectedNodeId=null & selectedNodeIds=[] (or null)
			store.commit('hydrateDraft', {
				snapshot: {
					...baseSnapshot(nodes),
					selectedNodeId: null,
					selectedNodeIds: []
				}
			})
			expect(store.state.selectedNodeId).toBeNull()
			expect(store.state.selectedNodeIds).toEqual([])
			expect(store.state.nodeOrder[0]).toBe('node-first')
		})

		it('should keep empty selection when snapshot.selectedNodeIds is omitted/null (legacy saver compat)', () => {
			const nodes = [mkNode('n1'), mkNode('n2'), mkNode('n3')]
			// Legacy saver used to emit null for empty selectedNodeIds
			store.commit('hydrateDraft', {
				snapshot: {
					...baseSnapshot(nodes),
					selectedNodeId: null,
					selectedNodeIds: null as any
				}
			})
			expect(store.state.selectedNodeId).toBeNull()
			expect(store.state.selectedNodeIds).toEqual([])
		})

		it('should still pick primary from ids[0] when there ARE selected nodes but primaryRaw is invalid', () => {
			const nodes = [mkNode('a1'), mkNode('a2'), mkNode('a3')]
			store.commit('hydrateDraft', {
				snapshot: {
					...baseSnapshot(nodes),
					selectedNodeId: 'does-not-exist',
					selectedNodeIds: ['a2', 'a3']
				}
			})
			expect(store.state.selectedNodeIds).toEqual(['a2', 'a3'])
			expect(store.state.selectedNodeId).toBe('a2')
		})

		it('should respect valid primaryRaw when it is inside selectedNodeIds', () => {
			const nodes = [mkNode('p1'), mkNode('p2'), mkNode('p3')]
			store.commit('hydrateDraft', {
				snapshot: {
					...baseSnapshot(nodes),
					selectedNodeId: 'p3',
					selectedNodeIds: ['p1', 'p2', 'p3']
				}
			})
			expect(store.state.selectedNodeIds).toEqual(['p1', 'p2', 'p3'])
			expect(store.state.selectedNodeId).toBe('p3')
		})
	})

	describe('setSelectedNodes - empty selection state preservation', () => {
		const baseSeed = () => {
			const ids = ['s1', 's2', 's3']
			const nodesById: any = {}
			for (const id of ids) {
				nodesById[id] = {
					id,
					type: 'image',
					title: id,
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			}
			store.commit('hydrateDraft', {
				snapshot: {
					nodesById,
					nodeOrder: ids,
					edgesById: {},
					edgeOrder: [],
					resourcesById: {},
					resourceOrder: [],
					viewport: { zoom: 1, panX: 0, panY: 0 },
					selectedNodeId: 's1',
					selectedNodeIds: ['s1'],
					selectedEdgeId: null
				}
			})
			expect(store.state.selectedNodeId).toBe('s1')
		}

		it('should clear selection to truly empty state when nodeIds=[], without fallback to nodeOrder[0]', () => {
			baseSeed()
			store.commit('setSelectedNodes', { nodeIds: [], primaryNodeId: null })
			expect(store.state.selectedNodeIds).toEqual([])
			expect(store.state.selectedNodeId).toBeNull()
		})

		it('should still work for single node selection (non-regression)', () => {
			baseSeed()
			store.commit('setSelectedNodes', { nodeIds: ['s3'], primaryNodeId: 's3' })
			expect(store.state.selectedNodeIds).toEqual(['s3'])
			expect(store.state.selectedNodeId).toBe('s3')
		})

		it('should pick ids[0] when multi-select but invalid primaryNodeId (non-regression)', () => {
			baseSeed()
			store.commit('setSelectedNodes', {
				nodeIds: ['s2', 's3'],
				primaryNodeId: 'ghost'
			})
			expect(store.state.selectedNodeIds).toEqual(['s2', 's3'])
			expect(store.state.selectedNodeId).toBe('s2')
		})
	})
})
