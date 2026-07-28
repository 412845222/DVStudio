import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AIWorkflowStore } from '@/store/aiworkflow/store'
import type { WorkflowState, WorkflowNodeChatSelectedRef } from '@/aiworkflow/types'

describe('store/nodeChatDialog', () => {
	let store: typeof AIWorkflowStore

	beforeEach(() => {
		store = AIWorkflowStore
		// Reset state for each test
		store.commit('replaceWorkflowState', {
			snapshot: {
				nodesById: {},
				nodeOrder: [],
				edgesById: {},
				edgeOrder: [],
				nodeChatDialog: {
					visible: false,
					nodeId: null,
					nodeType: null,
					draft: '',
					submitting: false,
					params: {},
					selectedRefs: []
				},
				viewport: { zoom: 1, panX: 0, panY: 0 },
				selectedNodeId: null,
				selectedNodeIds: [],
				selectedEdgeId: null
			}
		})
	})

	describe('openNodeChatDialog', () => {
		it('sets visible, nodeId, nodeType correctly', () => {
			// Create a test node
			store.commit('upsertNode', {
				node: {
					id: 'node-1',
					type: 'image',
					title: 'Test Image Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-1', nodeType: 'image' })

			expect(store.state.nodeChatDialog.visible).toBe(true)
			expect(store.state.nodeChatDialog.nodeId).toBe('node-1')
			expect(store.state.nodeChatDialog.nodeType).toBe('image')
			expect(store.state.nodeChatDialog.submitting).toBe(false)
		})

		it('reads textValue for image nodes when available', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-2',
					type: 'image',
					title: 'Image Node',
					textValue: 'beautiful sunset',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-2', nodeType: 'image' })

			expect(store.state.nodeChatDialog.draft).toBe('beautiful sunset')
		})

		it('reads prompt field when textValue is empty', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-3',
					type: 'image',
					title: 'Image Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now(),
					prompt: 'anime style poster'
				} as Record<string, unknown>
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-3', nodeType: 'image' })

			expect(store.state.nodeChatDialog.draft).toBe('anime style poster')
		})

		it('reads nodeChatDraft when prompt and textValue are empty', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-4',
					type: 'image',
					title: 'Image Node',
					nodeChatDraft: 'saved draft text',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-4', nodeType: 'image' })

			expect(store.state.nodeChatDialog.draft).toBe('saved draft text')
		})

		it('does NOT read textValue for text nodes', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-5',
					type: 'text',
					title: 'Text Node',
					textValue: 'AI generated content', // This should NOT be read for text nodes
					prompt: 'write a poem',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				} as Record<string, unknown>
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-5', nodeType: 'text' })

			// Should read prompt, not textValue
			expect(store.state.nodeChatDialog.draft).toBe('write a poem')
		})

		it('returns empty string when all sources are empty', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-6',
					type: 'image',
					title: 'Empty Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-6', nodeType: 'image' })

			expect(store.state.nodeChatDialog.draft).toBe('')
		})
	})

	describe('setNodeChatDraft', () => {
		it('updates nodeChatDialog.draft', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-7',
					type: 'image',
					title: 'Test Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-7', nodeType: 'image' })

			store.commit('setNodeChatDraft', { text: 'new draft text' })

			expect(store.state.nodeChatDialog.draft).toBe('new draft text')
		})

		it('updates node.nodeChatDraft', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-8',
					type: 'image',
					title: 'Test Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-8', nodeType: 'image' })

			store.commit('setNodeChatDraft', { text: 'updated draft' })

			expect(store.state.nodesById['node-8'].nodeChatDraft).toBe('updated draft')
		})

		it('updates node.prompt field', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-9',
					type: 'image',
					title: 'Test Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-9', nodeType: 'image' })

			store.commit('setNodeChatDraft', { text: 'prompt value' })

			const node = store.state.nodesById['node-9'] as Record<string, unknown>
			expect(node.prompt).toBe('prompt value')
		})

		it('does NOT update textValue (separation of prompt and content)', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-10',
					type: 'text',
					title: 'Text Node',
					textValue: 'original content',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-10', nodeType: 'text' })

			store.commit('setNodeChatDraft', { text: 'new prompt' })

			// textValue should NOT be modified by setNodeChatDraft
			expect(store.state.nodesById['node-10'].textValue).toBe('original content')
		})
	})

	describe('closeNodeChatDialog', () => {
		it('hides the dialog but preserves nodeId/draft/refs for data safety (TOCTOU protection)', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-close',
					type: 'image',
					title: 'Test Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-close', nodeType: 'image' })
			store.commit('setNodeChatDraft', { text: 'some text' })

			store.commit('closeNodeChatDialog')

			expect(store.state.nodeChatDialog.visible).toBe(false)
			expect(store.state.nodeChatDialog.submitting).toBe(false)
			// close preserves nodeId/draft/params/refs so that reopening same node restores user input
			expect(store.state.nodeChatDialog.nodeId).toBe('node-close')
			expect(store.state.nodeChatDialog.draft).toBe('some text')
			// draft is also persisted to the node itself
			expect((store.state.nodesById['node-close'] as any).nodeChatDraft).toBe('some text')
		})
	})

	describe('setNodeChatSelectedRefs', () => {
		it('updates nodeChatDialog.selectedRefs', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-refs-1',
					type: 'image',
					title: 'Test Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-refs-1', nodeType: 'image' })

			const refs: WorkflowNodeChatSelectedRef[] = [
				{ kind: 'image', label: '参考图1', edgeId: 'edge-1' }
			]
			store.commit('setNodeChatSelectedRefs', { refs })

			expect(store.state.nodeChatDialog.selectedRefs).toEqual(refs)
		})

		it('persists refs to node.nodeChatSelectedRefs', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-refs-2',
					type: 'image',
					title: 'Test Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-refs-2', nodeType: 'image' })

			const refs: WorkflowNodeChatSelectedRef[] = [
				{ kind: 'image', label: '参考图1', edgeId: 'edge-1' },
				{ kind: 'video', label: '参考视频1', fromNodeId: 'node-video', fromAnchorId: 'video-out' }
			]
			store.commit('setNodeChatSelectedRefs', { refs })

			expect(store.state.nodesById['node-refs-2'].nodeChatSelectedRefs).toEqual(refs)
		})

		it('sets node.nodeChatSelectedRefs to undefined when refs array is empty', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-refs-3',
					type: 'image',
					title: 'Test Node',
					nodeChatSelectedRefs: [{ kind: 'image', label: '参考图1', edgeId: 'edge-1' }],
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-refs-3', nodeType: 'image' })

			store.commit('setNodeChatSelectedRefs', { refs: [] })

			expect(store.state.nodesById['node-refs-3'].nodeChatSelectedRefs).toBeUndefined()
		})

		it('supports multiple references of the same kind', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-refs-4',
					type: 'image',
					title: 'Test Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})
			store.commit('openNodeChatDialog', { nodeId: 'node-refs-4', nodeType: 'image' })

			const refs: WorkflowNodeChatSelectedRef[] = [
				{ kind: 'image', label: '参考图1', edgeId: 'edge-1' },
				{ kind: 'image', label: '参考图2', edgeId: 'edge-2' }
			]
			store.commit('setNodeChatSelectedRefs', { refs })

			expect(store.state.nodeChatDialog.selectedRefs).toHaveLength(2)
			expect(store.state.nodeChatDialog.selectedRefs[0].label).toBe('参考图1')
			expect(store.state.nodeChatDialog.selectedRefs[1].label).toBe('参考图2')
			expect(store.state.nodesById['node-refs-4'].nodeChatSelectedRefs).toHaveLength(2)
		})
	})

	describe('openNodeChatDialog restoring selectedRefs', () => {
		it('restores selectedRefs from node.nodeChatSelectedRefs when dialog opens', () => {
			const savedRefs: WorkflowNodeChatSelectedRef[] = [
				{ kind: 'image', label: '参考图1', edgeId: 'edge-saved-1' },
				{ kind: 'text', label: '参考文本1', fromNodeId: 'node-text', fromAnchorId: 'text-out' }
			]
			store.commit('upsertNode', {
				node: {
					id: 'node-restore-1',
					type: 'image',
					title: 'Test Node',
					nodeChatDraft: 'a prompt with refs',
					nodeChatSelectedRefs: savedRefs,
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-restore-1', nodeType: 'image' })

			expect(store.state.nodeChatDialog.draft).toBe('a prompt with refs')
			expect(store.state.nodeChatDialog.selectedRefs).toEqual(savedRefs)
		})

		it('initializes selectedRefs as empty array when node has no saved refs', () => {
			store.commit('upsertNode', {
				node: {
					id: 'node-restore-2',
					type: 'video',
					title: 'Video Node',
					worldX: 0,
					worldY: 0,
					width: 280,
					height: 180,
					inputs: [],
					outputs: [],
					createdAt: Date.now()
				}
			})

			store.commit('openNodeChatDialog', { nodeId: 'node-restore-2', nodeType: 'video' })

			expect(store.state.nodeChatDialog.selectedRefs).toEqual([])
		})
	})
})