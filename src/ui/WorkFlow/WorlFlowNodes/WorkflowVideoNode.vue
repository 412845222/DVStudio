<template>
  <WorkflowNodeBase
    :nodeId="nodeId"
    :title="title"
    :alias="alias"
    :nodeType="nodeType"
    :subtitle="subtitle"
    :style="style"
    :width="width"
    :height="height"
    :zoom="zoom"
    :worldX="worldX"
    :worldY="worldY"
    :inputs="inputs"
    :outputs="outputs"
    :selected="selected"
    :hoverInputAnchorId="hoverInputAnchorId"
    :hoverOutputAnchorId="hoverOutputAnchorId"
    @update:worldX="(v) => emit('update:worldX', v)"
    @update:worldY="(v) => emit('update:worldY', v)"
    @select="(id) => emit('select', id)"
    @start-link="(payload) => emit('start-link', payload)"
    @end-link="(payload) => emit('end-link', payload)"
    @copy="() => emit('copy')"
    @delete="() => emit('delete')"
    @set-type="(type) => emit('set-type', type)"
    @resize="(payload) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-media">
        <div v-if="resourceUrl" class="wf-media-preview">
          <video :src="resourceUrl" muted loop playsinline />
        </div>
        <div v-else class="wf-media-empty">
          <div class="wf-media-hint">未上传视频资源</div>
          <div class="wf-media-sub">点击按钮选择文件</div>
        </div>
        <div class="wf-media-actions" @pointerdown.stop>
          <button class="wf-media-btn" type="button" @click.stop="onUploadClick">
            {{ resourceUrl ? '更换资源' : '上传资源' }}
          </button>
          <button
            v-if="resourceUrl"
            class="wf-media-btn ghost"
            type="button"
            @click.stop="emit('clear-resource')"
          >
            清空
          </button>
        </div>
        <input
          ref="fileInput"
          class="wf-file-input"
          type="file"
          accept="video/*"
          @change="onFileChange"
        />
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'

type AnchorSpec = {
  id: string
  label?: string
  offsetY?: number
}

const props = defineProps<{
  nodeId: string
  title: string
  alias?: string
  nodeType: string
  subtitle?: string
  style?: Record<string, string>
  resourceUrl?: string | null
  resourceName?: string | null
  width: number
  height: number
  zoom: number
  worldX: number
  worldY: number
  inputs?: AnchorSpec[]
  outputs?: AnchorSpec[]
  selected?: boolean
  hoverInputAnchorId?: string | null
  hoverOutputAnchorId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:worldX', v: number): void
  (e: 'update:worldY', v: number): void
  (e: 'select', nodeId: string): void
  (e: 'start-link', payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }): void
  (e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
  (e: 'copy'): void
  (e: 'delete'): void
  (e: 'set-type', v: 'base' | 'image' | 'video' | 'story'): void
  (e: 'upload-resource', payload: { file: File; kind: 'image' | 'video' }): void
  (e: 'clear-resource'): void
  (e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const onUploadClick = () => {
  fileInput.value?.click()
}

const onFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  emit('upload-resource', { file, kind: 'video' })
  input.value = ''
}
</script>

<style scoped>
.wf-media {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.wf-media-preview {
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
}

.wf-media-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wf-media-empty {
  border: 1px dashed var(--vscode-border);
  border-radius: 6px;
  padding: 10px;
  text-align: center;
  color: var(--vscode-fg-muted);
  background: var(--dweb-defualt);
}

.wf-media-hint {
  font-size: 12px;
}

.wf-media-sub {
  font-size: 11px;
  margin-top: 4px;
}

.wf-media-actions {
  display: flex;
  gap: 8px;
}

.wf-media-btn {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}

.wf-media-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-media-btn.ghost {
  color: var(--vscode-fg-muted);
}

.wf-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
