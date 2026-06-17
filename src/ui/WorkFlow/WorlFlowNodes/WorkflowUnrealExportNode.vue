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
    @refresh="() => emit('refresh')"
    @delete="() => emit('delete')"
    @set-type="(type) => emit('set-type', type)"
    @resize="(payload) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-unreal-export" @pointerdown.stop>
        <div class="wf-unreal-export-status" :class="`is-${connectionTone}`">
          <div class="wf-unreal-export-status-title">{{ statusTitle }}</div>
          <div class="wf-unreal-export-status-copy">{{ statusCopy }}</div>
        </div>

        <div class="wf-unreal-export-actions">
          <button class="wf-unreal-export-btn" type="button" @click.stop="emit('await-unreal-connection')">
            {{ connectionButtonLabel }}
          </button>
          <button
            v-if="isConnected"
            class="wf-unreal-export-btn ghost"
            type="button"
            :disabled="!hasLightingInput"
            @click.stop="emit('export-unreal-lighting')"
          >
            导出灯光
          </button>
          <button
            v-if="isConnected"
            class="wf-unreal-export-btn ghost"
            type="button"
            :disabled="!hasLayoutInput"
            @click.stop="emit('export-unreal-scene')"
          >
            导出场景
          </button>
        </div>

        <div v-if="progressVisible" class="wf-unreal-export-progress">
          <div class="wf-unreal-export-progress-bar">
            <div class="wf-unreal-export-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
          </div>
          <div class="wf-unreal-export-progress-copy">{{ progressCopy }}</div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="wf-unreal-export-footer" @pointerdown.stop>
        <div class="wf-unreal-export-grid">
          <div>布局输入</div>
          <div>{{ hasLayoutInput ? '已连接' : '未连接' }}</div>
          <div>灯光输入</div>
          <div>{{ hasLightingInput ? '已连接' : '未连接' }}</div>
          <div>目标工程</div>
          <div>{{ projectNameDisplay }}</div>
          <div>会话</div>
          <div>{{ sessionDisplay }}</div>
          <div>保存路径</div>
          <div>{{ saveDirectoryDisplay }}</div>
          <div>资产路径</div>
          <div>{{ assetRootPathDisplay }}</div>
          <div v-if="lastLightingSummary">灯光导入</div>
          <div v-if="lastLightingSummary">{{ lastLightingSummary }}</div>
          <div v-if="lastSlotCountText">布局协议</div>
          <div v-if="lastSlotCountText">{{ lastLayoutProtocolVersionText }}</div>
          <div v-if="lastSlotCountText">插槽写入</div>
          <div v-if="lastSlotCountText">{{ lastSlotCountText }}</div>
          <div v-if="lastActorBaseClassText">Actor基类</div>
          <div v-if="lastActorBaseClassText">{{ lastActorBaseClassText }}</div>
        </div>
        <div class="wf-unreal-export-copy">{{ detailCopy }}</div>
      </div>
    </template>
  </WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import type { WorkflowUnrealExportNodeSettings } from '../../../aiworkflow/types'

type AnchorSpec = {
  id: string
  label?: string
  offsetY?: number
  mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

const props = defineProps<{
  nodeId: string
  title: string
  alias?: string
  nodeType: string
  subtitle?: string
  style?: Record<string, string>
  unrealExportSettings?: WorkflowUnrealExportNodeSettings | null
  linkedLayoutJsonText?: string
  linkedLightingJsonText?: string
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
  (e: 'refresh'): void
  (e: 'delete'): void
  (e: 'set-type', v: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy'): void
  (e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
  (e: 'await-unreal-connection'): void
  (e: 'export-unreal-lighting'): void
  (e: 'export-unreal-scene'): void
}>()

const settings = computed(() => props.unrealExportSettings ?? null)
const hasLayoutInput = computed(() => String(props.linkedLayoutJsonText ?? '').trim().length > 0)
const hasLightingInput = computed(() => String(props.linkedLightingJsonText ?? '').trim().length > 0)
const isConnected = computed(() => settings.value?.connectionStatus === 'connected')
const connectionTone = computed(() => {
  const status = String(settings.value?.connectionStatus ?? 'idle')
  if (status === 'connected') return 'connected'
  if (status === 'error') return 'error'
  if (status === 'waiting') return 'waiting'
  if (status === 'exporting') return 'exporting'
  return 'idle'
})
const statusTitle = computed(() => {
  if (connectionTone.value === 'connected') return '虚幻编辑器已连接'
  if (connectionTone.value === 'waiting') return '等待虚幻插件连接'
  if (connectionTone.value === 'exporting') return '导出任务已发送'
  if (connectionTone.value === 'error') return '连接失败'
  return '未建立连接'
})
const statusCopy = computed(() => String(settings.value?.statusText ?? settings.value?.message ?? '请先打开虚幻编辑器中的插件面板，再点击连接工作流。').trim())
const connectionButtonLabel = computed(() => (isConnected.value ? '已连接' : '等待连接'))
const projectNameDisplay = computed(() => String(settings.value?.connectedSession?.projectName ?? '').trim() || '未连接')
const sessionDisplay = computed(() => String(settings.value?.connectedSession?.sessionId ?? settings.value?.targetSessionId ?? '').trim() || '未分配')
const saveDirectoryDisplay = computed(() => String(settings.value?.connectedSession?.saveDirectory ?? '').trim() || '未设置')
const assetRootPathDisplay = computed(() => String(settings.value?.connectedSession?.assetRootPath ?? settings.value?.lastBlueprintAssetPath ?? '').trim() || '/Game/DwebWorkflowExports')
const progressPercent = computed(() => {
  const value = Number(settings.value?.lastExportProgress ?? 0)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
})
const progressVisible = computed(() => progressPercent.value > 0 && progressPercent.value < 100)
const progressCopy = computed(() => {
  const stage = String(settings.value?.lastExportStage ?? '').trim()
  return `${stage || '准备导入资产'} · ${progressPercent.value}%`
})
const lastActorBaseClassText = computed(() => String(settings.value?.lastActorBaseClass ?? '').trim())
const lastLightingSummary = computed(() => {
  const lightCount = Number(settings.value?.lastSpawnedLightCount)
  const actorLabel = String(settings.value?.lastLightingTargetActor ?? '').trim()
  if (!Number.isFinite(lightCount) && !actorLabel) return ''
  const parts = [
    Number.isFinite(lightCount) ? `${lightCount} lights` : '',
    actorLabel ? `目标Actor：${actorLabel}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
})
const lastLayoutProtocolVersionText = computed(() => {
  const value = Number(settings.value?.lastLayoutProtocolVersion)
  return Number.isFinite(value) ? `v${value}` : ''
})
const lastSlotCountText = computed(() => {
  const slotCount = Number(settings.value?.lastSlotCount)
  const appliedSlotCount = Number(settings.value?.lastAppliedSlotCount)
  const materialOverrideCount = Number(settings.value?.lastMaterialOverrideCount)
  if (!Number.isFinite(slotCount) && !Number.isFinite(appliedSlotCount)) return ''
  const parts = [
    Number.isFinite(slotCount) ? `${slotCount} slots` : '',
    Number.isFinite(appliedSlotCount) ? `${appliedSlotCount} applied` : '',
    Number.isFinite(materialOverrideCount) && materialOverrideCount > 0 ? `${materialOverrideCount} material overrides` : '',
  ].filter(Boolean)
  return parts.join(' · ')
})
const detailCopy = computed(() => {
  const exportJobId = String(settings.value?.lastExportJobId ?? '').trim()
  const exportStatus = String(settings.value?.lastExportStatus ?? '').trim()
  const exportMessage = String(settings.value?.lastExportMessage ?? '').trim()
  const blueprintAssetPath = String(settings.value?.lastBlueprintAssetPath ?? '').trim()
  const modelsAssetPath = String(settings.value?.lastModelsAssetPath ?? '').trim()
  if (exportJobId) {
    const pathSummary = blueprintAssetPath || modelsAssetPath
      ? ` · ${blueprintAssetPath || modelsAssetPath}`
      : ''
    return `最近任务 ${exportJobId}${exportStatus ? ` · ${exportStatus}` : ''}${exportMessage ? ` · ${exportMessage}` : ''}${pathSummary}`
  }
  if (!hasLayoutInput.value) return '请先把场景布局节点的“布局JSON”输出接入当前节点。'
  if (!hasLightingInput.value) return '当前没有灯光 JSON 输入，导出时会按纯布局场景处理。'
  return '连接建立后，当前节点会把布局、灯光和模型绑定信息打包成导出任务。'
})
</script>

<style scoped>
.wf-unreal-export {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wf-unreal-export-status {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.68);
}

.wf-unreal-export-status.is-connected {
  border-color: rgba(74, 222, 128, 0.45);
}

.wf-unreal-export-status.is-waiting,
.wf-unreal-export-status.is-exporting {
  border-color: rgba(251, 191, 36, 0.45);
}

.wf-unreal-export-status.is-error {
  border-color: rgba(248, 113, 113, 0.45);
}

.wf-unreal-export-status-title {
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}

.wf-unreal-export-status-copy {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.78);
}

.wf-unreal-export-actions {
  display: flex;
  gap: 10px;
}

.wf-unreal-export-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wf-unreal-export-progress-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.18);
}

.wf-unreal-export-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.95), rgba(34, 197, 94, 0.9));
}

.wf-unreal-export-progress-copy {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.76);
}

.wf-unreal-export-btn {
  appearance: none;
  border: 1px solid rgba(96, 165, 250, 0.35);
  background: rgba(59, 130, 246, 0.18);
  color: #dbeafe;
  border-radius: 0;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
}

.wf-unreal-export-btn.ghost {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.42);
  color: #e2e8f0;
}

.wf-unreal-export-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.wf-unreal-export-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wf-unreal-export-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.8);
}

.wf-unreal-export-copy {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.72);
}
</style>