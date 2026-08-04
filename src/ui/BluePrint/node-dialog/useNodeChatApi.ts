import { inject, provide, type InjectionKey } from 'vue'

export interface NodeChatApi {
	getState(nodeId: string): {
		visible: boolean
		draft: string
		params: Record<string, any>
		selectedRefs: any[]
		submitting: boolean
	}
	open(nodeId: string, nodeType: string): void
	close(nodeId: string): void
	saveDraft(nodeId: string, draft: string): void
	saveParams(nodeId: string, params: Record<string, any>): void
	saveSelectedRefs(nodeId: string, refs: any[]): void
	flush(
		nodeId: string,
		state: { draft?: string; params?: Record<string, any>; selectedRefs?: any[] }
	): void
	submit(nodeId: string, payload: any): void
	stop(nodeId: string): void
	removeParamRef(nodeId: string, refItem: any): void
}

export const NodeChatApiKey: InjectionKey<NodeChatApi> = Symbol('NodeChatApi')

export function provideNodeChatApi(api: NodeChatApi) {
	provide(NodeChatApiKey, api)
	return api
}

export function useNodeChatApi() {
	const api = inject(NodeChatApiKey, null)
	if (!api) {
		throw new Error('NodeChatApi not provided. Make sure BlueprintDomOverlay is an ancestor.')
	}
	return api
}
