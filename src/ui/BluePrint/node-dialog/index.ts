export { default as NodeChatDialog } from './NodeChatDialog.vue'
export { default as NodeChatInput } from './NodeChatInput.vue'
export { default as NodeChatParamPanel } from './NodeChatParamPanel.vue'
export * from './nodeChatConfig'

export type InputParamPreviewRef = {
  edgeId?: string
  fromNodeId?: string
  fromAnchorId?: string
  toAnchorId?: string
  kind: 'text' | 'image' | 'video' | 'model3d'
  name?: string
  label?: string
  text?: string
  previewUrl?: string
  meta?: string
}

export type InputTextConnectedRef = InputParamPreviewRef & {
  kind: 'text'
  text: string
}
