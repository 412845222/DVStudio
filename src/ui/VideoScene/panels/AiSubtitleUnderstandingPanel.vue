<template>
  <div class="vs-ai">
    <div class="vs-ai-left">
      <div class="vs-ai-head">
        <div class="vs-ai-title">AI 总结</div>
        <button
          v-if="props.layerId && cues.length"
          class="vs-btn"
          type="button"
          :disabled="busy"
          @click="rerunUnderstanding"
        >
          重新总结
        </button>
        <div class="vs-ai-meta">图层：{{ layerId || "未选择" }}</div>
        <div v-if="busy" class="vs-ai-status">
          <span class="vs-ai-spinner" aria-hidden="true" />
          <span class="vs-ai-status-text">{{ statusText }}</span>
        </div>
      </div>
      <div v-if="errorText" class="vs-ai-error">{{ errorText }}</div>
      <div class="vs-ai-mdview">
        <div v-if="!props.layerId" class="vs-ai-md-empty">请先选择字幕图层</div>
        <div v-else-if="!cues.length" class="vs-ai-md-empty">当前图层没有字幕段落</div>
        <div v-else-if="phase === 'checking'" class="vs-ai-md-empty">
          正在检查 AI 连接...
        </div>
        <div v-else-if="phase === 'summarizing'" class="vs-ai-md-empty">
          正在理解字幕并生成总结...
        </div>
        <template v-else>
          <section class="vs-ai-md-sec">
            <div class="vs-ai-md-sec-title">字幕整体理解</div>
            <div v-if="summary.understanding?.summary" class="vs-ai-understanding">
              <div class="vs-ai-understanding-text">
                {{ summary.understanding.summary }}
              </div>
              <div
                v-if="summary.understanding.points?.length"
                class="vs-ai-understanding-points"
              >
                <div
                  v-for="(pt, i) in summary.understanding.points"
                  :key="'pt-' + i"
                  class="vs-ai-understanding-point"
                >
                  - {{ pt }}
                </div>
              </div>
            </div>
            <div v-else class="vs-ai-md-empty">暂无总结内容</div>
          </section>

          <section class="vs-ai-md-sec">
            <div class="vs-ai-md-sec-title-row">
              <div class="vs-ai-md-sec-title">段落标题（进度条）</div>
              <button
                class="vs-btn"
                type="button"
                :disabled="!canGenerateProgressBar"
                @click="generateProgressBarLayer"
              >
                添加进度条
              </button>
            </div>
            <div v-if="segmentsItems.length" class="vs-ai-seg-list">
              <div
                v-for="(it, i) in segmentsItems"
                :key="'seg-' + i"
                class="vs-ai-seg-item"
              >
                <div class="vs-ai-seg-meta">
                  {{ i + 1 }}. cue {{ it.startCue }}-{{ it.endCue }}
                </div>
                <input
                  class="vs-ai-seg-input"
                  type="text"
                  :maxlength="12"
                  :placeholder="'4~8字标题'"
                  :value="String(it.title || '')"
                  @input="onSegmentTitleInput(i, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <div v-else class="vs-ai-md-empty">
              尚未生成段落标题（会在整体理解后自动生成）
            </div>
          </section>

          <section class="vs-ai-md-sec">
            <div class="vs-ai-md-sec-title-row">
              <div class="vs-ai-md-sec-title">配色与风格建议</div>
              <button
                class="vs-btn"
                type="button"
                :disabled="!canGenerateStyleAdvice"
                @click="generateStyleAdvice"
              >
                生成配色建议
              </button>
            </div>
            <div v-if="summary.style?.notes?.length" class="vs-ai-style">
              <div
                v-for="(n, i) in summary.style.notes"
                :key="String(i) + '-' + String(n)"
                class="vs-ai-style-note"
              >
                {{ n }}
              </div>
            </div>
            <div v-else class="vs-ai-md-empty">暂无风格建议</div>
            <div class="vs-ai-palette">
              <div class="vs-ai-palette-head">
                <div class="vs-ai-palette-title">配色预览</div>
                <button
                  class="vs-btn"
                  type="button"
                  :disabled="!canGeneratePalette"
                  @click="generatePalette"
                >
                  {{ paletteActionLabel }}
                </button>
              </div>
              <div v-if="paletteEntries.length" class="vs-ai-palette-grid">
                <div
                  v-for="([k, v], i) in paletteEntries"
                  :key="k + '-' + i"
                  class="vs-ai-palette-item"
                >
                  <span
                    class="vs-ai-palette-swatch"
                    :style="{ backgroundColor: String(v) }"
                  />
                  <span class="vs-ai-palette-key">{{ k }}</span>
                  <span class="vs-ai-palette-val">{{ v }}</span>
                </div>
              </div>
              <div v-else class="vs-ai-palette-hint">
                尚未生成配色，点击“生成配色”即可生成
              </div>
            </div>
          </section>

          <section class="vs-ai-md-sec">
            <div class="vs-ai-md-sec-title-row">
              <div class="vs-ai-md-sec-title">可复用高级组件描述</div>
              <button
                class="vs-btn"
                type="button"
                :disabled="!canGenerateTemplateSuggestions"
                @click="generateTemplateSuggestions"
              >
                生成组件描述
              </button>
            </div>
            <div v-if="!templateItems.length" class="vs-ai-md-empty">暂无模板建议</div>
            <div v-if="templateItems.length" class="vs-ai-template-list">
              <div v-for="t in templateItems" :key="t.key" class="vs-ai-template-item">
                <div class="vs-ai-template-main">
                  <div class="vs-ai-template-title">{{ t.name }}</div>
                  <div class="vs-ai-template-meta">
                    <span>templateId: {{ t.templateId }}</span>
                    <span v-if="t.category">{{ t.category }}</span>
                  </div>
                  <div v-if="t.spec?.description?.length" class="vs-ai-template-meta">
                    <span
                      v-for="(d, i) in t.spec.description"
                      :key="t.templateId + '-d-' + i"
                      >{{ d }}</span
                    >
                  </div>
                </div>
                <div class="vs-ai-template-actions">
                  <button
                    class="vs-btn"
                    type="button"
                    :disabled="localBusy"
                    @click="previewTemplate(t)"
                  >
                    生成预览
                  </button>
                  <button
                    class="vs-btn"
                    type="button"
                    :disabled="t.saved || localBusy"
                    @click="(e: any) => saveTemplateAsComponent(t, e)"
                  >
                    {{ t.saved ? "已保存" : "保存组件" }}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>

    <div class="vs-ai-right">
      <div class="ai-chat__title">
        <div class="ai-chat__title-left">
          <span class="ai-chat__title-text">对话</span>
          <span v-if="busy" class="ai-chat__title-status">{{ taskStatusLabel }}</span>
        </div>
        <div class="ai-chat__title-actions">
          <button
            class="ai-chat__icon"
            type="button"
            :title="deepMode ? '深度思考模式：开' : '深度思考模式：关'"
            @click="toggleDeepMode"
          >
            {{ deepMode ? "深" : "浅" }}
          </button>
          <span class="vs-ai-meta">{{ chatMeta }}</span>
        </div>
      </div>

      <div class="ai-chat__body">
        <div ref="listEl" class="ai-chat__list">
          <div v-if="!messages.length && !showRunningBubble" class="vs-ai-empty">
            还没有消息
          </div>
          <div v-for="m in messages" :key="m.id" class="ai-chat__msg" :class="[m.role]">
            <div class="ai-chat__bubble">
              <div class="ai-chat__role">{{ m.role === "user" ? "我" : "AI" }}</div>
              <div class="ai-chat__text">{{ m.text }}</div>
              <div
                v-if="m.role === 'assistant' && m.paletteEntries?.length"
                class="vs-ai-chat-palette"
              >
                <div class="vs-ai-chat-palette-head">
                  <div class="vs-ai-chat-palette-title">配色预览</div>
                  <button
                    class="vs-btn"
                    type="button"
                    :disabled="m.applied || localBusy"
                    @click="applyPaletteFromMessage(m)"
                  >
                    {{ m.applied ? "已应用" : "确认应用此配色" }}
                  </button>
                </div>
                <div class="vs-ai-palette-grid">
                  <div
                    v-for="([k, v], i) in m.paletteEntries"
                    :key="k + '-' + i"
                    class="vs-ai-palette-item"
                  >
                    <span
                      class="vs-ai-palette-swatch"
                      :style="{ backgroundColor: String(v) }"
                    />
                    <span class="vs-ai-palette-key">{{ k }}</span>
                    <span class="vs-ai-palette-val">{{ v }}</span>
                  </div>
                </div>
              </div>
              <div
                v-if="
                  m.role === 'assistant' &&
                  m.panelPatch &&
                  typeof m.panelPatch === 'object'
                "
                class="vs-ai-chat-palette"
              >
                <div class="vs-ai-chat-palette-head">
                  <div class="vs-ai-chat-palette-title">修改提案</div>
                  <button
                    class="vs-btn"
                    type="button"
                    :disabled="m.applied || localBusy"
                    @click="applyPanelPatchFromMessage(m)"
                  >
                    {{ m.applied ? "已应用" : "应用修改" }}
                  </button>
                </div>
                <div class="vs-ai-meta">
                  将更新：{{
                    m.panelPatchTarget === "both"
                      ? "风格建议 + 组件描述"
                      : m.panelPatchTarget === "style"
                      ? "风格建议"
                      : m.panelPatchTarget === "templates"
                      ? "组件描述"
                      : "（未知）"
                  }}
                </div>
              </div>
              <div v-if="isRunning(m) && taskStatusLabel" class="ai-chat__phase">
                {{ taskStatusLabel }}
              </div>
              <div v-if="isRunning(m)" class="ai-chat__typing" aria-label="AI 正在处理">
                <span class="ai-chat__dot" />
                <span class="ai-chat__dot" />
                <span class="ai-chat__dot" />
              </div>
            </div>
          </div>

          <div v-if="showRunningBubble" class="ai-chat__msg assistant">
            <div class="ai-chat__bubble">
              <div class="ai-chat__role">AI</div>
              <div v-if="taskStatusLabel" class="ai-chat__phase">
                {{ taskStatusLabel }}
              </div>
              <div class="ai-chat__typing" aria-label="AI 正在处理">
                <span class="ai-chat__dot" />
                <span class="ai-chat__dot" />
                <span class="ai-chat__dot" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="thoughtOpen" class="vs-ai-thought" aria-label="思考面板">
        <div class="vs-ai-thought-head">
          <div class="vs-ai-thought-title">思考 / 进度</div>
          <button
            class="vs-ai-thought-close"
            type="button"
            title="关闭"
            @click="closeThought"
          >
            ×
          </button>
        </div>
        <div class="vs-ai-thought-body">{{ thoughtText }}</div>
      </div>

      <form class="ai-chat__input" @submit.prevent="sendFromInput">
        <input
          v-model="draft"
          class="ai-chat__text-input"
          type="text"
          :placeholder="chatPlaceholder"
          :disabled="!chatEnabled"
        />
        <button class="ai-chat__send" type="submit" :disabled="!chatEnabled || !canSend">
          发送
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { componentTemplateApi, validateComponentTemplate } from '../../../core/components'
import type { ComponentTemplate, InstantiateTemplateResult } from '../../../core/components/types'
import { ComponentLibraryService } from '../../../network/ComponentLibraryService'
import { findLayer, findNode, nodeExistsInAnyLayer, rotatedRectCorners } from '../../../core/scene'
import type { VideoSceneLayer, VideoSceneTreeNode } from '../../../core/scene'
import { cloneJsonSafe } from '../../../core/shared/cloneJsonSafe'
import { stripSubtitleTextContentFromStageLayers } from '../../../core/subtitle/sanitizeStageSnapshot'
import { VideoSceneKey, type VideoSceneState } from '../../../store/videoscene'
import { TimelineStore } from '../../../store/timeline'
import { VideoStudioStore } from '../../../store/videostudio'
import { SubtitleAIService } from '../../../network/SubtitleAIService'
import type { AgentToUiMessage, AgentToUiTaskStatusMessage, AgentToUiErrorMessage, AgentToUiSubtitleSummaryDeltaMessage, AgentToUiTextMessage, AgentToUiChatMessage, AgentToUiComponentTemplateMessage } from '../../../core/agentToUI'
import { isRecord as isRecordGuard, isArray as isArrayGuard, isString as isStringGuard, isNumber as isNumberGuard } from '../../../types/utils'
import { DwebCanvasGLKey } from '../VideoSceneRuntime'
import { flyThumbnailPng } from '../parts/flyThumbnail'
import {
	applySubtitleSummaryDelta,
	createEmptySubtitleSummaryState,
	type SubtitleSummaryState,
	type SubtitleTemplateSuggestion,
	type SubtitleOutlineItem,
	type SubtitleUnderstanding,
	type SubtitleSegments,
	type SubtitleStyle,
	type SubtitlePlanItem,
} from '../subtitleAI/subtitleSummaryState'
import type { SubtitleCue, SubtitleCueRange } from '../../../core/timeline/types'

defineOptions({ name: 'AiSubtitleUnderstandingPanel' })

const props = defineProps<{ layerId: string | null }>()

const store = useStore<VideoSceneState>(VideoSceneKey)

const dwebCanvasRef = inject(DwebCanvasGLKey, null)

type ChatMessage = {
	id: string
	role: 'user' | 'assistant'
	text: string
	paletteEntries?: Array<[string, string]>
	styleData?: { palette?: Record<string, string> }
	panelPatch?: { style?: unknown; templates?: unknown }
	panelPatchTarget?: 'style' | 'templates' | 'both' | 'none'
	applied?: boolean
}

type SegmentItem = SubtitleOutlineItem & { title?: string }

type LooseTemplateNode = {
	localId?: string
	type?: string
	name?: string
	parentLocalId?: string
	transform?: Record<string, unknown>
	props?: Record<string, unknown>
	[key: string]: unknown
}

type RepairTemplateParam = {
	key?: string
	name?: string
	label?: string
	type?: string
	default?: unknown
	[key: string]: unknown
}

type RepairTemplateNode = {
	localId?: string
	type?: string
	name?: string
	parentLocalId?: string
	transform?: Record<string, unknown>
	props?: Record<string, unknown>
	[key: string]: unknown
}

type RepairTemplate = {
	schemaVersion?: number
	templateId?: string
	name?: string
	rootLocalId?: string
	params?: RepairTemplateParam[]
	nodes?: RepairTemplateNode[]
	[key: string]: unknown
}

type LooseComponentTemplate = {
	schemaVersion?: unknown
	templateId?: string
	name?: string
	category?: string
	description?: unknown
	params?: unknown[]
	nodes?: LooseTemplateNode[]
	rootLocalId?: string
	bindings?: Record<string, unknown>
	[key: string]: unknown
}

type LooseSavedComponent = {
	id?: unknown
	createdAt?: unknown
	templateId?: unknown
	name?: unknown
	template?: unknown
	savedAt?: unknown
	thumbAssetId?: unknown
	thumbDataUrl?: unknown
	thumbUrl?: unknown
}

type ProgressBarNodeChild = {
	id: string
	name: string
	category: 'user'
	userType: 'rect' | 'text'
	transform: Record<string, number>
	props: Record<string, unknown>
}

type LooseSceneNode = {
	id: string
	name: string
	category: 'user'
	userType: 'rect' | 'text'
	transform: Record<string, number>
	props: Record<string, unknown>
	children?: LooseSceneNode[]
}

type TemplateParam = {
	key?: string
	name?: string
	label?: string
	type?: string
	default?: unknown
	[key: string]: unknown
}

type SummaryCacheStorage = Record<string, SummaryCacheEntry>

const isRecord = (v: unknown): v is Record<string, unknown> => isRecordGuard(v)
const isArray = isArrayGuard
const isString = isStringGuard

const summary = ref<SubtitleSummaryState>(createEmptySubtitleSummaryState())

const paletteEntries = computed(() => {
	const p = summary.value.style?.palette
	if (!p || typeof p !== 'object') return [] as Array<[string, string]>
	return Object.entries(p)
		.filter(([k, v]) => typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim())
		.map(([k, v]) => [k, v] as [string, string])
})

const cues = computed<SubtitleCue[]>(() => (props.layerId ? (TimelineStore.state.subtitleCuesByLayer?.[props.layerId] ?? []) : []))
const cueRanges = computed<SubtitleCueRange[]>(() => (props.layerId ? (TimelineStore.state.subtitleCueRangesByLayer?.[props.layerId] ?? []) : []))

const segmentsItems = computed<SegmentItem[]>(() => {
	const items = summary.value.segments?.items
	return Array.isArray(items) ? items.map((it): SegmentItem => ({
		title: isString(it?.title) ? it.title : '',
		startCue: isNumberGuard(it?.startCue) ? it.startCue : 0,
		endCue: isNumberGuard(it?.endCue) ? it.endCue : 0,
		startTimeMs: isNumberGuard(it?.startTimeMs) ? it.startTimeMs : null,
		endTimeMs: isNumberGuard(it?.endTimeMs) ? it.endTimeMs : null,
	})) : []
})

type Phase = 'idle' | 'checking' | 'summarizing' | 'ready' | 'chatting' | 'error'
const phase = ref<Phase>('idle')
const statusText = ref<string>('')
const errorText = ref<string>('')
const summaryReady = ref(false)

const localBusy = ref(false)
const localBusyLabel = ref<string>('')

const busy = computed(() => phase.value === 'checking' || phase.value === 'summarizing' || phase.value === 'chatting' || localBusy.value)
// Do not block all actions just because an error message is shown.
// Some errors are just prerequisite hints (e.g. "先生成风格建议") and should not lock the panel.
const chatEnabled = computed(() => summaryReady.value && phase.value !== 'chatting' && !localBusy.value)

const canGeneratePalette = computed(() => summaryReady.value && phase.value !== 'chatting' && !localBusy.value)

const paletteActionLabel = computed(() => (paletteEntries.value.length ? '重新生成' : '生成配色'))

const chatMeta = computed(() => {
	if (!props.layerId) return '未选择图层'
	if (!cues.value.length) return '无字幕'
	if (!summaryReady.value) return '等待字幕总结完成后可对话'
	if (phase.value === 'chatting') return 'AI 回复中...'
	return '就绪'
})

const chatPlaceholder = computed(() => (chatEnabled.value ? '输入消息（将请求后端 AI）' : '等待字幕总结完成...'))

const messages = ref<ChatMessage[]>([])
const draft = ref<string>('')
const canSend = computed(() => !!draft.value.trim())

const DEEP_MODE_KEY = 'dvs.subtitleAi.deepMode'
const deepMode = ref(false)

const loadDeepMode = () => {
	try {
		deepMode.value = window.localStorage.getItem(DEEP_MODE_KEY) === '1'
	} catch {
		deepMode.value = false
	}
}

const persistDeepMode = () => {
	try {
		window.localStorage.setItem(DEEP_MODE_KEY, deepMode.value ? '1' : '0')
	} catch {
		// ignore
	}
}

const toggleDeepMode = () => {
	deepMode.value = !deepMode.value
	persistDeepMode()
}

loadDeepMode()

const activeAssistantId = ref<string | null>(null)
const progressAssistantId = ref<string | null>(null)

const summaryChatIntro = ref<string>('')
const lastSummaryNarrative = ref<string>('')

const taskPhase = ref<string>('')
const taskPhaseMessage = ref<string>('')

const thoughtLines = ref<string[]>([])
const thoughtText = computed(() => thoughtLines.value.join('\n'))
const thoughtOpen = ref(false)
const thoughtDismissed = ref(false)

const closeThought = () => {
	thoughtOpen.value = false
	thoughtDismissed.value = true
}

const appendThoughtLine = (text: string) => {
	const t = String(text || '').trim()
	if (!t) return
	const last = thoughtLines.value.length ? thoughtLines.value[thoughtLines.value.length - 1] : ''
	if (last === t) return
	thoughtLines.value = [...thoughtLines.value, t].slice(-80)
	if (!thoughtDismissed.value) thoughtOpen.value = true
}

let lastProgressChatLine = ''
const pushProgressToChat = async (text: string) => {
	const t = String(text || '').trim()
	if (!t) return
	if (t === lastProgressChatLine) return
	lastProgressChatLine = t
	messages.value.push({
		id: `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		role: 'assistant',
		text: `【进度】${t}`,
	})
	await scrollToBottom()
}

const taskStatusLabel = computed(() => {
	// Prefer explicit human message (from backend). Otherwise map phase -> Chinese label.
	const m = String(taskPhaseMessage.value || '').trim()
	if (m) return m
	const p = String(taskPhase.value || '').trim()
	if (!p) return ''
	const map: Record<string, string> = {
		connect: '连接…',
		role_confirm: '确定技能角色…',
		self_check: '自检…',
		self_check_done: '自检完成',
		submit: '提交…',
		outline_parse: '解析大纲…',
		outline_done: '输出大纲…',
		style_gen: '生成风格文字建议…',
		style_out: '输出风格文字建议…',
		template_gen: '生成可复用高级组件建议…',
		template_desc_gen: '细化高级组件描述…',
		template_out: '输出可复用高级组件建议…',
		palette_gen: '生成配色…',
		palette_done: '配色已生成',
		done: '完成',
		started: '已开始…',
		streaming: '连接模型…',
		writing: '生成内容…',
	}
	return map[p] || p
})

const canGenerateStyleAdvice = computed(() => {
	const u = summary.value?.understanding
	const hasSummary = !!String(u?.summary || '').trim()
	const hasPoints = Array.isArray(u?.points) && u.points.length > 0
	const ok = hasSummary || hasPoints
	return summaryReady.value && ok && !busy.value && !localBusy.value
})

const canGenerateTemplateSuggestions = computed(() => {
	const u = summary.value?.understanding
	const hasSummary = !!String(u?.summary || '').trim()
	const hasPoints = Array.isArray(u?.points) && u.points.length > 0
	const ok = hasSummary || hasPoints
	return summaryReady.value && ok && !busy.value && !localBusy.value
})

const service = new SubtitleAIService()

const SUMMARY_CACHE_KEY = 'dvs.subtitleSummaryCache.v1'

type SummaryCacheEntry = {
	layerId: string
	cuesHash: string
	summary: SubtitleSummaryState
	cachedAt: string
}

const computeCuesHash = (cuesList: SubtitleCue[]) => {
	const s = cuesList
		.map((c) => {
			const t = typeof c?.text === 'string' ? c.text : ''
			return `${typeof c?.startMs === 'number' ? c.startMs : ''}|${typeof c?.endMs === 'number' ? c.endMs : ''}|${t}`
		})
		.join('\n')
	let h = 0x811c9dc5
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return (h >>> 0).toString(16)
}

const loadSummaryCache = (layerId: string): SummaryCacheEntry | null => {
	try {
		const raw = localStorage.getItem(SUMMARY_CACHE_KEY)
		if (!raw) return null
		const parsed: unknown = JSON.parse(raw)
		if (!isRecord(parsed)) return null
		const hit = parsed[layerId]
		if (!isRecord(hit)) return null
		if (!isString(hit.layerId) || hit.layerId !== layerId) return null
		if (!isString(hit.cuesHash) || !hit.cuesHash) return null
		if (!isRecord(hit.summary)) return null
		return hit as SummaryCacheEntry
	} catch {
		return null
	}
}

const saveSummaryCache = (layerId: string) => {
	try {
		const cuesHash = computeCuesHash(cues.value)
		const entry: SummaryCacheEntry = { layerId, cuesHash, summary: summary.value, cachedAt: new Date().toISOString() }
		const raw = localStorage.getItem(SUMMARY_CACHE_KEY)
		let parsed: Record<string, unknown> = {}
		if (raw) {
			const parsedRaw: unknown = JSON.parse(raw)
			if (isRecord(parsedRaw)) parsed = parsedRaw
		}
		const next: SummaryCacheStorage = { ...parsed as SummaryCacheStorage, [layerId]: entry }
		localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(next))
	} catch {
		// ignore
	}
}

const clearSummaryCache = (layerId: string) => {
	try {
		const raw = localStorage.getItem(SUMMARY_CACHE_KEY)
		if (!raw) return
		const parsed: unknown = JSON.parse(raw)
		if (!isRecord(parsed)) return
		if (!(layerId in parsed)) return
		const next: Record<string, unknown> = { ...parsed }
		delete next[layerId]
		localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(next))
	} catch {
		// ignore
	}
}

let understandAborter: AbortController | null = null
let chatAborter: AbortController | null = null
let paletteAborter: AbortController | null = null
let styleAborter: AbortController | null = null
let templatesAborter: AbortController | null = null

const listEl = ref<HTMLDivElement | null>(null)
const scrollToBottom = async () => {
	await nextTick()
	const el = listEl.value
	if (!el) return
	el.scrollTop = el.scrollHeight
}

let typingTimer: number | null = null
let typingQueue = ''
let typingAssistantId: string | null = null

const stopTyping = () => {
	if (typingTimer !== null) {
		window.clearInterval(typingTimer)
		typingTimer = null
	}
	typingQueue = ''
	typingAssistantId = null
}

const ensureTyping = (assistantId: string) => {
	if (typingAssistantId && typingAssistantId !== assistantId) stopTyping()
	typingAssistantId = assistantId
	if (typingTimer !== null) return
	typingTimer = window.setInterval(() => {
		if (!typingQueue) return
		const ch = typingQueue[0]
		typingQueue = typingQueue.slice(1)
		const idx = messages.value.findIndex((x) => x.id === assistantId)
		if (idx >= 0) messages.value[idx].text += ch
		void scrollToBottom()
	}, 22)
}

const buildSummaryNarrative = (s: SubtitleSummaryState): string => {
	const lines: string[] = []
	const intro = String(summaryChatIntro.value || '').trim()
	if (intro) lines.push(intro)

	const u = s.understanding
	const hasUnderstanding = !!String(u?.summary || '').trim() || (Array.isArray(u?.points) && u.points.length)
	if (hasUnderstanding) {
		lines.push('')
		lines.push('【整体理解】')
		if (String(u?.summary || '').trim()) lines.push(String(u.summary).trim())
		if (Array.isArray(u?.points) && u.points.length) {
			lines.push('')
			lines.push('【要点】')
			for (const p of u.points) {
				if (typeof p === 'string' && p.trim()) lines.push(`- ${p.trim()}`)
			}
		}
	}

	const outlineItems = Array.isArray(s.outline?.items) ? s.outline.items : []
	if (outlineItems.length) {
		lines.push('')
		lines.push('【大纲】')
		outlineItems.forEach((it, i) => {
			const title = isString(it?.title) ? it.title.trim() : ''
			const sc = it?.startCue
			const ec = it?.endCue
			const range = `${typeof sc === 'number' ? sc : '?'}-${typeof ec === 'number' ? ec : '?'}`
			lines.push(`${i + 1}. ${title || '（未命名）'}（cue ${range}）`)
		})
	}

	const segs = Array.isArray(s.segments?.items) ? s.segments.items : []
	if (segs.length) {
		lines.push('')
		lines.push('【段落标题】')
		segs.forEach((it, i) => {
			const title = isString(it?.title) ? it.title.trim() : ''
			const sc = it?.startCue
			const ec = it?.endCue
			const range = `${typeof sc === 'number' ? sc : '?'}-${typeof ec === 'number' ? ec : '?'}`
			lines.push(`${i + 1}. ${title || '（未命名）'}（cue ${range}）`)
		})
	}

	const st = s.style
	const notes = Array.isArray(st?.notes) ? st.notes.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []
	const pal = st?.palette && isRecord(st.palette) ? Object.entries(st.palette).filter((entry): entry is [string, string] => {
		const [k, v] = entry
		return typeof k === 'string' && !!k.trim() && typeof v === 'string' && !!v.trim()
	}) : []
	if (notes.length || pal.length) {
		lines.push('')
		lines.push('【风格】')
		for (const n of notes) lines.push(`- ${n}`)
		if (pal.length) {
			lines.push('')
			lines.push('【配色】')
			for (const [k, v] of pal) lines.push(`- ${k}: ${v}`)
		}
	}

	const templates = Array.isArray(s.templates) ? s.templates : []
	if (templates.length) {
		lines.push('')
		lines.push('【组件建议】')
		for (const t of templates) {
			const name = isString(t?.name) ? String(t.name).trim() : ''
			const tid = isString(t?.templateId) ? String(t.templateId).trim() : ''
			lines.push(`- ${name || tid || '（未命名）'}${tid ? `（${tid}）` : ''}`)
			const desc = Array.isArray(t?.description) ? t.description : []
			for (const d of desc) if (typeof d === 'string' && d.trim()) lines.push(`  - ${d.trim()}`)
		}
	}

	const plans = Array.isArray(s.plans) ? s.plans : []
	if (plans.length) {
		lines.push('')
		lines.push('【计划】')
		plans.forEach((p, i) => {
			const title = isString(p?.title) ? String(p.title).trim() : ''
			const ref = isString(p?.templateRef) ? String(p.templateRef).trim() : ''
			const sc = p?.start?.cueIndex
			const ec = p?.end?.cueIndex
			const range = `${typeof sc === 'number' ? sc : '?'}-${typeof ec === 'number' ? ec : '?'}`
			lines.push(`${i + 1}. ${title || '（未命名）'} → ${ref || '（未指定模板）'}（cue ${range}）`)
		})
	}

	return lines.join('\n').trim() + (lines.length ? '\n' : '')
}

const onSegmentTitleInput = (idx: number, titleRaw: string) => {
	const nextTitle = String(titleRaw ?? '').trim()
	const base = segmentsItems.value
	if (!base.length) return
	const nextItems: SegmentItem[] = base.map((it, i) => {
		if (i !== idx) return it
		return { ...it, title: nextTitle }
	})
	summary.value = applySubtitleSummaryDelta(summary.value, { section: 'segments', data: { items: nextItems } })
}

const canGenerateProgressBar = computed(() => {
	if (busy.value) return false
	if (!props.layerId) return false
	if (!cues.value.length) return false
	return segmentsItems.value.length > 0
})

const buildLayersForStageSnapshot = () => {
	let next: VideoSceneLayer[] = cloneJsonSafe(store.state.layers) as VideoSceneLayer[]
	const kinds = TimelineStore.state.layerKindById ?? {}
	for (const [layerId, kind] of Object.entries(kinds)) {
		if (kind !== 'subtitle') continue
		try {
			next = stripSubtitleTextContentFromStageLayers(next, layerId)
		} catch {
			// ignore
		}
	}
	return next
}

const generateProgressBarLayer = async () => {
	if (!canGenerateProgressBar.value) return
	const items = segmentsItems.value
	if (!items.length) return

	const stageW = Math.max(1, Math.round(VideoStudioStore.state.stage.width || 1920))
	const stageH = Math.max(1, Math.round(VideoStudioStore.state.stage.height || 1080))
	const frameCount = Math.max(1, Math.floor(TimelineStore.state.frameCount || 1))
	const endFrame = Math.max(0, frameCount - 1)

	localBusy.value = true
	localBusyLabel.value = '添加进度条'
	statusText.value = '添加进度条…'
	try {
		const layerId = await createTimelineAndStageLayer('进度条', { activate: false })
		try {
			await TimelineStore.dispatch('setLayerKind', { layerId, kind: 'progress' })
		} catch {
			// ignore
		}

		const paletteRec = summary.value.style?.palette
		const palette = isRecord(paletteRec) ? paletteRec : {}
		const bg = isString(palette.neutral) ? palette.neutral : '#222222'
		const fg = isString(palette.primary) ? palette.primary : '#3aa1ff'
		const text = isString(palette.text) ? palette.text : '#ffffff'

		// IMPORTANT: stage/world coordinates are center-origin (0,0 at stage center), and y grows downward.
		// Root must be a rect (no group/base node). It spans full stage width.
		const marginTop = Math.round(Math.max(28, stageH * 0.06))
		const barW = Math.max(80, Math.round(stageW))
		const barH = Math.max(24, Math.round(stageH * 0.06))
		const barX = 0
		const barY = Math.round(-stageH / 2 + marginTop + barH / 2)
		const barLeftLocalX = Math.round(-barW / 2)

		const rootId = `progress-${Date.now()}`
		const playedId = `${rootId}-played`

		// Compute segment time bounds from cues/timeMs.
		const cuesArr = cues.value
		const startMs = cuesArr.length > 0 && typeof cuesArr[0]?.startMs === 'number' ? cuesArr[0].startMs : 0
		const lastCue = cuesArr.length > 0 ? cuesArr[cuesArr.length - 1] : null
		const endMs = lastCue && typeof lastCue.endMs === 'number' ? lastCue.endMs : Math.max(1, startMs + 1)
		const durMs = Math.max(1, endMs - startMs)
		const getItemStartMs = (it: SegmentItem): number | null => {
			if (typeof it.startTimeMs === 'number') return it.startTimeMs
			const sc = it.startCue
			if (sc != null && cuesArr[sc] && typeof cuesArr[sc].startMs === 'number') return cuesArr[sc].startMs
			return null
		}
		const getItemEndMs = (it: SegmentItem): number | null => {
			if (typeof it.endTimeMs === 'number') return it.endTimeMs
			const ec = it.endCue
			if (ec != null && cuesArr[ec] && typeof cuesArr[ec].endMs === 'number') return cuesArr[ec].endMs
			return null
		}
		const toRatio01 = (ms: number) => Math.max(0, Math.min(1, (ms - startMs) / durMs))
		const computeFrameFromMs = (ms: number): number => {
			const ratio = toRatio01(ms)
			return Math.max(0, Math.min(endFrame, Math.round(ratio * endFrame)))
		}

		const segmentIds: string[] = []
		const titleIds: string[] = []
		const markerIds: string[] = []
		const segmentRectChildren: ProgressBarNodeChild[] = []
		const titleChildren: ProgressBarNodeChild[] = []
		const markerChildren: ProgressBarNodeChild[] = []
		const segmentsForSpec: Array<{ startFrame: number; endFrame: number; title: string }> = []
		const playedKeyframes: Array<{ frame: number; width: number }> = []
		let lastEndPx = 0
		const markerSize = 6
		const baseFontSize = Math.max(12, Math.min(28, Math.round(barH * 0.42)))
		for (let i = 0; i < items.length; i++) {
			const it = items[i]
			const title = isString(it?.title) ? String(it.title).trim() : ''
			const sMs = getItemStartMs(it)
			if (sMs == null) continue
			const eMsRaw = getItemEndMs(it)
			const nextItem = i + 1 < items.length ? items[i + 1] : null
			const nextStartMs = nextItem ? getItemStartMs(nextItem) : null
			const eMs =
				typeof eMsRaw === 'number'
					? eMsRaw
					: typeof nextStartMs === 'number'
						? nextStartMs
						: endMs
			const startRatio = toRatio01(sMs)
			const endRatio = i === items.length - 1 ? 1 : toRatio01(Math.max(sMs, eMs))
			let startPx = Math.max(0, Math.min(barW, Math.round(startRatio * barW)))
			let endPx = Math.max(0, Math.min(barW, Math.round(endRatio * barW)))
			startPx = Math.max(startPx, lastEndPx)
			endPx = Math.max(endPx, startPx + 1)
			if (i === items.length - 1) endPx = barW
			lastEndPx = endPx

			const segW = Math.max(1, endPx - startPx)
			const segCenterLocalX = Math.round(barLeftLocalX + startPx + segW / 2)
			const segId = `${rootId}-seg-${i}`
			const tId = `${rootId}-seg-title-${i}`
			segmentIds.push(segId)
			titleIds.push(tId)

			segmentRectChildren.push({
				id: segId,
				name: `Segment ${i + 1}`,
				category: 'user',
				userType: 'rect',
				transform: { x: segCenterLocalX, y: 0, width: Math.round(segW), height: barH, rotation: 0, opacity: 1 },
				props: {
					fillColor: fg,
					fillOpacity: 0.18,
					borderColor: fg,
					borderOpacity: 0.35,
					borderWidth: 1,
					cornerRadius: 0,
				},
			})
			titleChildren.push({
				id: tId,
				name: `Segment Title ${i + 1}`,
				category: 'user',
				userType: 'text',
				transform: { x: segCenterLocalX, y: 0, width: Math.round(segW), height: barH, rotation: 0, opacity: 1 },
				props: {
					textContent: title || `段落${i + 1}`,
					textAlign: 'center',
					fontSize: baseFontSize,
					fontColor: text,
					fontStyle: 'normal',
				},
			})

			// marker at segment start (except first)
			if (i > 0) {
				const mx = Math.round(barLeftLocalX + startPx)
				const mid = `${rootId}-marker-${i}`
				markerIds.push(mid)
				markerChildren.push({
					id: mid,
					name: `Marker ${i + 1}`,
					category: 'user',
					userType: 'rect',
					transform: { x: mx, y: 0, width: markerSize, height: markerSize, rotation: 0, opacity: 1 },
					props: {
						fillColor: fg,
						fillOpacity: 1,
						borderColor: fg,
						borderOpacity: 0.85,
						borderWidth: 1,
						cornerRadius: 999,
					},
				})
			}

			segmentsForSpec.push({
				startFrame: computeFrameFromMs(sMs),
				endFrame: computeFrameFromMs(Math.max(sMs, eMs)),
				title: title || `段落${i + 1}`,
			})
			playedKeyframes.push({ frame: computeFrameFromMs(sMs), width: startPx })
		}

		const playedOverlayChild: ProgressBarNodeChild = {
			id: playedId,
			name: 'Played Overlay',
			category: 'user',
			userType: 'rect',
			transform: { x: barLeftLocalX, y: 0, width: 0, height: barH, rotation: 0, opacity: 1, pivotX: 0, pivotY: 0.5 },
			props: {
				fillColor: fg,
				fillOpacity: 0.28,
				borderColor: fg,
				borderOpacity: 0,
				borderWidth: 0,
				cornerRadius: 0,
			},
		}
		const root: LooseSceneNode = {
			id: rootId,
			name: 'ProgressBar',
			category: 'user',
			userType: 'rect',
			transform: { x: barX, y: barY, width: barW, height: barH, rotation: 0, opacity: 1 },
			props: {
				fillColor: bg,
				fillOpacity: 0.22,
				borderColor: fg,
				borderOpacity: 0.45,
				borderWidth: 2,
				cornerRadius: 0,
			},
			children: [
				...segmentRectChildren,
				playedOverlayChild,
				...markerChildren,
				...titleChildren,
			],
		}

		await store.dispatch('addNodeTree', { node: root, layerId })
		statusText.value = '已添加进度条图层'

		try {
			await TimelineStore.dispatch('setProgressBarSpec', {
				layerId,
				spec: {
					style: {
						backgroundColor: bg,
						borderColor: fg,
						textColor: text,
						marker: { shape: 'circle', size: 6, color: fg, borderColor: fg },
						playedOverlayColor: fg,
						playedOverlayBorderColor: fg,
					},
					segments: segmentsForSpec,
					nodeIds: { rootId, playedOverlayId: playedId, segmentIds, titleIds, markerIds },
				},
			})
		} catch {
			// ignore
		}

		// keyframes for played overlay: ensure every segment start is a keyframe.
		// With pivotX=0, we only animate width (x stays on the left edge).
		const keyframesMap = new Map<number, number>()
		keyframesMap.set(0, 0)
		for (const k of playedKeyframes) {
			const f = Math.max(0, Math.min(endFrame, Math.floor(Number(k.frame))))
			const w = Math.max(0, Math.min(barW, Math.round(Number(k.width))))
			if (!Number.isFinite(f) || !Number.isFinite(w)) continue
			keyframesMap.set(f, Math.max(keyframesMap.get(f) ?? 0, w))
		}
		keyframesMap.set(endFrame, barW)
		const frames = Array.from(keyframesMap.keys()).sort((a, b) => a - b)
		for (const f of frames) {
			await TimelineStore.dispatch('addKeyframeRange', { layerId, startFrame: f, endFrame: f })
			await TimelineStore.dispatch('setNodeKeyframeSnapshotRange', {
				layerId,
				startFrame: f,
				endFrame: f,
				nodesById: {
					[playedId]: { transform: { x: barLeftLocalX, width: keyframesMap.get(f) ?? 0 } },
				},
			})
		}
		for (let i = 0; i + 1 < frames.length; i++) {
			const a = frames[i]
			const b = frames[i + 1]
			if (!(a < b)) continue
			await TimelineStore.dispatch('enableEasingSegment', { layerId, startFrame: a, endFrame: b })
			await TimelineStore.dispatch('setEasingCurve', {
				segmentKey: `${layerId}:${a}:${b}`,
				curve: { x1: 0, y1: 0, x2: 1, y2: 1, preset: 'linear' },
			})
		}

		const layersForSnapshot = buildLayersForStageSnapshot()
		await TimelineStore.dispatch('setStageKeyframeSnapshotRange', { startFrame: 0, endFrame: 0, layers: layersForSnapshot as any })
		await TimelineStore.dispatch('setStageKeyframeSnapshotRange', { startFrame: endFrame, endFrame: endFrame, layers: layersForSnapshot as any })

		await store.dispatch('setSelectedNode', { nodeId: rootId })
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		errorText.value = msg
		messages.value.push({ id: `e-${Date.now()}`, role: 'assistant', text: `生成进度条失败：${msg}` })
	} finally {
		localBusy.value = false
		localBusyLabel.value = ''
		statusText.value = '就绪'
	}
}

const syncSummaryNarrative = (assistantId: string) => {
	const next = buildSummaryNarrative(summary.value)
	const prev = lastSummaryNarrative.value
	lastSummaryNarrative.value = next
	const idx = messages.value.findIndex((x) => x.id === assistantId)
	if (idx < 0) return
	if (!prev) {
		messages.value[idx].text = ''
		pushStreamText(assistantId, next)
		return
	}
	if (next.startsWith(prev)) {
		pushStreamText(assistantId, next.slice(prev.length))
		return
	}
	stopTyping()
	messages.value[idx].text = next
	void scrollToBottom()
}


const safeGetString = (obj: unknown, key: string): string => {
	if (!isRecord(obj)) return ''
	const v = obj[key]
	return typeof v === 'string' ? v : ''
}

const safeGetArray = <T>(obj: unknown, key: string, pred: (x: unknown) => x is T): T[] => {
	if (!isRecord(obj)) return []
	const v = obj[key]
	return Array.isArray(v) ? v.filter(pred) : []
}

type PanelPatchTarget = 'style' | 'templates' | 'both' | 'none'

const handleAgentMsg = (
	m: AgentToUiMessage,
	opts: { target: 'summary' | 'chat'; assistantId?: string; applyToSummary?: boolean }
) => {
	if (m.type === 'agentToUi/taskStatus') {
		const { payload } = m as unknown as { payload: { phase?: string; message?: string } }
		const msg = payload.message
		const ph = payload.phase
		if (typeof ph === 'string' && ph.trim()) taskPhase.value = ph.trim()
		if (typeof msg === 'string' && msg.trim()) {
			taskPhaseMessage.value = msg.trim()
			statusText.value = msg.trim()
		}
		if (opts.target === 'summary' && ph === 'understanding_done') {
			if (!summaryReady.value) summaryReady.value = true
			if (phase.value === 'summarizing') phase.value = 'ready'
			statusText.value = '字幕整体理解完成'
			summaryChatIntro.value = '字幕整体理解已生成（段落标题生成中…）。你可以先继续提问，或先生成配色/组件建议。'
			if (typeof progressAssistantId.value === 'string' && progressAssistantId.value) syncSummaryNarrative(progressAssistantId.value)
		}
		{
			const text = typeof msg === 'string' && msg.trim() ? msg.trim() : String(ph ?? '').trim()
			if (text) {
				appendThoughtLine(text)
				void pushProgressToChat(text)
			}
		}
		return
	}
	if (m.type === 'agentToUi/error') {
		const { payload } = m as AgentToUiErrorMessage
		const msg = payload.message
		errorText.value = typeof msg === 'string' && msg.trim() ? msg.trim() : 'AI 请求失败'
		phase.value = 'error'
		return
	}
	if (m.type === 'agentToUi/subtitleSummaryDelta') {
		const { payload } = m as unknown as { payload: { section: string; data: unknown } }
		const section = payload.section
		const data: unknown = payload.data
		if (typeof section === 'string' && section.trim()) {
			const applyToSummary = opts.applyToSummary !== false
			if (applyToSummary) summary.value = applySubtitleSummaryDelta(summary.value, { section, data })
			if (opts.target === 'summary' && section === 'understanding') {
				const s = safeGetString(data, 'summary').trim()
				if (s && phase.value === 'summarizing') {
					if (!summaryReady.value) summaryReady.value = true
					phase.value = 'ready'
					statusText.value = '字幕整体理解完成'
					summaryChatIntro.value = '字幕整体理解已生成（段落标题生成中…）。你可以先继续提问，或先生成配色/组件建议。'
				}
			}
			if (opts.target === 'summary' && typeof progressAssistantId.value === 'string' && progressAssistantId.value) {
				syncSummaryNarrative(progressAssistantId.value)
			}
			if (opts.target === 'chat' && typeof opts.assistantId === 'string' && opts.assistantId) {
				if (section === 'understanding') {
					const s = safeGetString(data, 'summary').trim()
					const pts = safeGetArray(data, 'points', (x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
					let out = ''
					if (s) out += `【字幕整体理解】\n${s}\n`
					if (pts.length) out += `\n【要点】\n${pts.map((x) => `- ${x}`).join('\n')}\n`
					if (out) appendAssistantText(opts.assistantId, out + '\n')
				}
				if (section === 'style') {
					const notes = safeGetArray(data, 'notes', (x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
					if (notes.length) {
						appendAssistantText(opts.assistantId, `【配色与风格建议】\n${notes.map((x) => `- ${x}`).join('\n')}\n\n`)
					}
				}
				if (section === 'templates') {
					const list: unknown[] = Array.isArray(data) ? data : []
					if (list.length) {
						const lines: string[] = ['【可复用高级组件描述】']
						for (const t of list.slice(0, 8)) {
							const name = safeGetString(t, 'name').trim()
							const tid = safeGetString(t, 'templateId').trim()
							lines.push(`- ${name || tid || '（未命名）'}${tid ? `（${tid}）` : ''}`)
							const desc = safeGetArray(t, 'description', (x): x is string => typeof x === 'string' && !!x.trim())
							for (const d of desc.slice(0, 4)) if (d.trim()) lines.push(`  - ${d.trim()}`)
						}
						appendAssistantText(opts.assistantId, lines.join('\n') + '\n\n')
					}
				}
			}
			if (opts.target === 'chat' && section === 'style' && isRecord(data)) {
				const paletteRaw: unknown = data.palette
				if (isRecord(paletteRaw)) {
					const entries = Object.entries(paletteRaw)
						.filter((entry): entry is [string, string] => {
							const [k, v] = entry
							return typeof k === 'string' && !!k.trim() && typeof v === 'string' && !!v.trim()
						})
						.map(([k, v]) => [k, v] as [string, string])
					if (entries.length) {
						const tipText = '我生成了一套新的配色方案，请确认是否应用。'
						const tryFillId = typeof opts.assistantId === 'string' ? opts.assistantId : ''
						const idx = tryFillId ? messages.value.findIndex((x) => x.id === tryFillId) : -1
						const palette: Record<string, string> = Object.fromEntries(entries)
						if (idx >= 0) {
							const mm = messages.value[idx]
							mm.text = tipText
							mm.paletteEntries = entries
							mm.styleData = { palette }
							void scrollToBottom()
						} else {
							messages.value.push({
								id: `a-${Date.now()}-${Math.random().toString(16).slice(2)}`,
								role: 'assistant',
								text: tipText,
								paletteEntries: entries,
								styleData: { palette },
							})
							void scrollToBottom()
						}
					}
				}
			}
		}
		return
	}
	if (m.type === 'agentToUi/text') {
		const { payload } = m as AgentToUiTextMessage
		const delta = payload.text
		if (typeof delta !== 'string' || !delta) return
		const readable = extractReadableText(delta)
		if (!readable) return
		const targetId =
			opts.target === 'chat' && typeof opts.assistantId === 'string' && opts.assistantId
				? opts.assistantId
				: opts.target === 'summary' && typeof progressAssistantId.value === 'string' && progressAssistantId.value
					? progressAssistantId.value
					: ''
		if (targetId) pushStreamText(targetId, readable)
		return
	}
	if (m.type === 'agentToUi/chatMessage' && (opts.target === 'chat' || opts.target === 'summary')) {
		const { payload, meta } = m as AgentToUiChatMessage & { meta?: Record<string, unknown> }
		const c = payload.content
		if (typeof c !== 'string' || !c.trim()) return
		const requiresApply = meta?.requiresApply === true
		const panelPatch: unknown = requiresApply ? meta?.panelPatch : null
		const panelPatchTargetRaw = String(meta?.panelPatchTarget || '').trim()
		const panelPatchTarget: PanelPatchTarget =
			panelPatchTargetRaw === 'style' || panelPatchTargetRaw === 'templates' || panelPatchTargetRaw === 'both' || panelPatchTargetRaw === 'none'
				? panelPatchTargetRaw
				: 'none'
		const safeContent = extractReadableText(c)
		if (!safeContent) return
		const tryFillId =
			opts.target === 'chat' && typeof opts.assistantId === 'string'
				? opts.assistantId
				: opts.target === 'summary' && typeof progressAssistantId.value === 'string'
					? progressAssistantId.value
					: ''
		const idx = tryFillId ? messages.value.findIndex((x) => x.id === tryFillId) : -1
		if (idx >= 0) {
			const mm = messages.value[idx]
			if (!String(mm.text || '').trim()) pushStreamText(mm.id, safeContent)
			if (panelPatch && typeof panelPatch === 'object') {
				mm.panelPatch = panelPatch as { style?: unknown; templates?: unknown }
				mm.panelPatchTarget = panelPatchTarget
			}
			void scrollToBottom()
			return
		}
		const id = `a-${Date.now()}-${Math.random().toString(16).slice(2)}`
		messages.value.push({
			id,
			role: 'assistant',
			text: '',
			panelPatch: panelPatch && typeof panelPatch === 'object' ? (panelPatch as { style?: unknown; templates?: unknown }) : undefined,
			panelPatchTarget,
		})
		pushStreamText(id, safeContent)
		return
	}
}

const tryFormatJsonCodeBlock = (raw: string) => {
	const s = String(raw || '').trim()
	if (!s) return ''
	try {
		const obj = JSON.parse(s)
		return '```json\n' + JSON.stringify(obj, null, 2) + '\n```'
	} catch {
		// still show as code block for debugging
		return '```json\n' + s + '\n```'
	}
}
const extractReadableTextFromAgentJson = (obj: any): string | null => {
	const t = obj?.type
	const p = obj?.payload
	if (t === 'agentToUi/chatMessage' && typeof p?.content === 'string') return p.content
	if (t === 'agentToUi/chat' && typeof p?.message === 'string') return p.message
	if (t === 'agentToUi/chat' && typeof p?.content === 'string') return p.content
	if (t === 'agentToUi/text' && typeof p?.text === 'string') return p.text
	// Some backends/models may embed an envelope under payload.
	if (isRecord(p) && typeof (p as any).text === 'string') {
		const inner = String((p as any).text).trim()
		if (inner.startsWith('{') && inner.endsWith('}')) {
			try {
				const innerObj = JSON.parse(inner)
				return extractReadableTextFromAgentJson(innerObj)
			} catch {
				// ignore
			}
		}
	}
	return null
}

const extractReadableText = (raw: string): string => {
	const text = String(raw ?? '')
	const trimmed = text.trim()
	if (!trimmed) return ''

	const tryParse = (s: string): any | null => {
		try {
			return JSON.parse(s)
		} catch {
			return null
		}
	}

	// Fast path: exact JSON object/array.
	// If it is JSON but not a known envelope, hide it to prevent leaking raw JSON into the UI.
	if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
		const obj = tryParse(trimmed)
		if (obj) return extractReadableTextFromAgentJson(obj) ?? ''
	}

	// Embedded JSON object within other text.
	const first = trimmed.indexOf('{')
	const last = trimmed.lastIndexOf('}')
	if (first >= 0 && last > first) {
		const candidate = trimmed.slice(first, last + 1)
		const obj = tryParse(candidate)
		if (obj) {
			const extracted = extractReadableTextFromAgentJson(obj)
			if (typeof extracted === 'string') return extracted
		}
	}

	return text
}

const pushStreamText = (assistantId: string, text: string) => {
	if (!text) return
	text = extractReadableText(text)
	if (!text) return
	typingQueue += text
	ensureTyping(assistantId)
}

const toSafeKey = (s: string) =>
	String(s || '')
		.trim()
		.replace(/\s+/g, '_')
		.replace(/[^a-zA-Z0-9_:\-]/g, '_')

const repairComponentTemplate = (input: unknown, fallbackId: string) => {
	const t: any = isRecord(input) ? { ...input } : {}
	if (t.schemaVersion !== 1) t.schemaVersion = 1
	if (typeof t.templateId !== 'string' || !t.templateId.trim()) t.templateId = toSafeKey(fallbackId || `tpl_${Date.now()}`)
	if (typeof t.name !== 'string' || !t.name.trim()) t.name = t.templateId
	// Strong constraint: a single unique root.
	t.rootLocalId = 'root'

	// params: drop invalid keys; try to derive key from name/label
	const rawParams = Array.isArray(t.params) ? t.params : []
	const nextParams: any[] = []
	const used = new Set<string>()
	for (const p of rawParams) {
		if (!isRecord(p)) continue
		let key = typeof p.key === 'string' ? p.key.trim() : ''
		if (!key) key = typeof (p as any).name === 'string' ? String((p as any).name).trim() : ''
		if (!key) key = typeof (p as any).label === 'string' ? String((p as any).label).trim() : ''
		key = toSafeKey(key)
		if (!key) continue
		if (used.has(key)) continue
		used.add(key)

		// validateComponentTemplate requires param.type in: string|number|boolean|color|asset:image
		const rawType = typeof (p as any).type === 'string' ? String((p as any).type).trim() : ''
		const typeMap: Record<string, string> = {
			text: 'string',
			str: 'string',
			string: 'string',
			number: 'number',
			int: 'number',
			float: 'number',
			bool: 'boolean',
			boolean: 'boolean',
			color: 'color',
			hex: 'color',
			'image': 'asset:image',
			'asset:image': 'asset:image',
		}
		const mappedType = rawType ? (typeMap[rawType.toLowerCase()] || rawType) : ''
		const okTypes = new Set(['string', 'number', 'boolean', 'color', 'asset:image'])
		const finalType = okTypes.has(mappedType) ? mappedType : 'string'
		nextParams.push({ ...p, key, type: finalType })
	}
	t.params = nextParams

	// nodes: ensure props is object; transform if provided must be object
	const rawNodes = Array.isArray(t.nodes) ? t.nodes : []
	const nextNodes: any[] = []
	for (const n of rawNodes) {
		if (!isRecord(n)) continue
		const nn: any = { ...n }
		if (!isRecord(nn.props)) nn.props = {}
		if (nn.transform !== undefined && !isRecord(nn.transform)) nn.transform = {}
		if (typeof nn.localId !== 'string' || !nn.localId.trim()) nn.localId = `n_${nextNodes.length}`
		if (typeof nn.type !== 'string' || !nn.type.trim()) nn.type = 'rect'
		if (nn.type === 'group') nn.type = 'rect'
		nextNodes.push(nn)
	}
	if (!nextNodes.length) nextNodes.push({ localId: 'root', type: 'rect', props: {}, transform: {} })

	// De-duplicate localId to guarantee a single unique root and a valid template.
	// If duplicates exist, keep the first and rename later ones.
	const usedIds = new Set<string>()
	for (const n of nextNodes) {
		let id = String(n?.localId || '').trim()
		if (!id) id = `n_${usedIds.size}`
		if (!usedIds.has(id)) {
			n.localId = id
			usedIds.add(id)
			continue
		}
		let i = 2
		while (usedIds.has(`${id}__${i}`)) i++
		n.localId = `${id}__${i}`
		usedIds.add(n.localId)
	}
	t.nodes = nextNodes

	// Enforce root node existence + shape.
	const rootLocalId = 'root'
	let root = nextNodes.find((n) => String(n?.localId || '').trim() === rootLocalId)
	if (!root) {
		root = { localId: rootLocalId, type: 'rect', props: {}, transform: {} }
		nextNodes.unshift(root)
	}
	root.localId = rootLocalId
	root.type = 'rect'
	if (!isRecord(root.props)) root.props = {}
	if (root.transform !== undefined && !isRecord(root.transform)) root.transform = {}
	if (!isRecord(root.transform)) root.transform = {}
	if (root.transform.width === undefined) root.transform.width = 720
	if (root.transform.height === undefined) root.transform.height = 420
	delete root.parentLocalId

	// Re-parent any top-level nodes to root; also fix invalid parentLocalId.
	const localIds = new Set(nextNodes.map((n) => String(n?.localId || '').trim()).filter((x) => !!x))
	for (const n of nextNodes) {
		const id = String(n?.localId || '').trim()
		if (!id) continue
		if (id === rootLocalId) continue
		const p = n.parentLocalId
		const parentId = typeof p === 'string' ? p.trim() : ''
		if (!parentId) {
			n.parentLocalId = rootLocalId
			continue
		}
		if (parentId === id) {
			n.parentLocalId = rootLocalId
			continue
		}
		if (!localIds.has(parentId)) {
			n.parentLocalId = rootLocalId
		}
	}

	return t
}

const selfCheckTemplateForSave = (tpl: any) => {
	const errors: string[] = []
	if (!tpl || typeof tpl !== 'object') {
		errors.push('template 不是对象')
		return { ok: false, errors }
	}
	const rootLocalId = String((tpl as any).rootLocalId || '').trim()
	if (rootLocalId !== 'root') errors.push('rootLocalId 必须为 "root"')
	const nodes = Array.isArray((tpl as any).nodes) ? ((tpl as any).nodes as any[]) : []
	if (!nodes.length) errors.push('nodes 不能为空')
	const localIds = new Set<string>()
	for (const n of nodes) {
		const id = String(n?.localId || '').trim()
		if (!id) {
			errors.push('存在空 localId')
			continue
		}
		if (localIds.has(id)) errors.push(`localId 重复: ${id}`)
		localIds.add(id)
	}
	const root = nodes.find((n) => String(n?.localId || '').trim() === 'root')
	if (!root) errors.push('nodes 中必须存在 localId="root" 的根节点')
	else {
		const rt = String(root?.type || '').trim()
		if (rt !== 'rect') errors.push('root 节点 type 必须为 rect')
		const tr = root?.transform
		if (!tr || typeof tr !== 'object') errors.push('root.transform 必须存在')
		else {
			if ((tr as any).width === undefined) errors.push('root.transform.width 必须存在')
			if ((tr as any).height === undefined) errors.push('root.transform.height 必须存在')
		}
		if (root?.parentLocalId !== undefined) errors.push('root 不能有 parentLocalId')
	}
	for (const n of nodes) {
		const id = String(n?.localId || '').trim()
		if (!id || id === 'root') continue
		const p = String(n?.parentLocalId || '').trim()
		if (!p) errors.push(`节点 ${id} 缺少 parentLocalId`)
		else if (!localIds.has(p)) errors.push(`节点 ${id} parentLocalId 不存在: ${p}`)
	}
	// Save metadata is injected on client-side when saving (id/createdAt).
	return { ok: errors.length === 0, errors }
}

const previewAborter = ref<AbortController | null>(null)
const previewRunId = ref(0)

const normalizeToHex6 = (input: string): string | null => {
	const s0 = String(input || '').trim()
	if (!s0) return null
	if (/^#[0-9a-fA-F]{6}$/.test(s0)) return s0.toUpperCase()
	if (/^#[0-9a-fA-F]{3}$/.test(s0)) {
		const r = s0[1]
		const g = s0[2]
		const b = s0[3]
		return (`#${r}${r}${g}${g}${b}${b}`).toUpperCase()
	}
	const m = s0.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i)
	if (m) {
		const toHex2 = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase()
		return `#${toHex2(parseInt(m[1], 10))}${toHex2(parseInt(m[2], 10))}${toHex2(parseInt(m[3], 10))}`
	}
	// Try resolving named colors / CSS vars in browser.
	try {
		const el = document.createElement('span')
		el.style.color = s0
		document.body.appendChild(el)
		const c = getComputedStyle(el).color
		document.body.removeChild(el)
		const mm = c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i)
		if (!mm) return null
		const toHex2 = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase()
		return `#${toHex2(parseInt(mm[1], 10))}${toHex2(parseInt(mm[2], 10))}${toHex2(parseInt(mm[3], 10))}`
	} catch {
		return null
	}
}

const buildPreviewContextPack = (activeLayerId: string) => {
	const layer = findLayer(store.state, activeLayerId)
	return {
		activeLayerId,
		layers: store.state.layers.map((l: any) => ({ id: l.id, name: l.name })),
		selectedNodeIds: [],
		selectedNodes: [],
		activeLayer: layer ? { id: layer.id, name: (layer as any).name, nodeTree: layer.nodeTree } : null,
		lastStageOps: [],
		subtitleSummary: {
			style: summary.value.style,
			outline: summary.value.outline,
		},
	}
}

const buildPreviewPromptInput = (t: TemplateItem) => {
	const desc = Array.isArray((t.spec as any)?.description) ? ((t.spec as any).description as any[]) : []
	const descLines = desc
		.map((x) => (typeof x === 'string' ? x.trim() : ''))
		.filter((x) => !!x)
		.slice(0, 12)
	const fallbackDesc = (() => {
		const out: string[] = []
		const cat = String(t.category || '').trim()
		const sum = String(summary.value.understanding?.summary || '').trim()
		out.push(`结构：用一个容器矩形(root)+标题文本+正文/要点文本+分割线组成${cat ? '，偏' + cat : ''}`)
		out.push('布局：标题在上方，内容在下方；可选左侧色条或右侧图片占位')
		if (sum) out.push(`主题：围绕“${sum.slice(0, 40)}”选择主色与强调色`)
		out.push('配色：若提供 palette，则只使用给定 palette（background/text/primary/accent/neutral）绑定到 fill/border/font/line')
		out.push('滤镜：边框/线条/标题字体至少一处添加 glow（可辅以轻微 blur）')
		return out
	})()
	const finalDesc = descLines.length ? descLines : fallbackDesc
	const paletteMap = summary.value.style?.palette && typeof summary.value.style.palette === 'object' ? summary.value.style.palette : {}
	const paletteWhitelist = (() => {
		const ok = new Set<string>()
		for (const [, v] of paletteEntries.value) {
			const hex = normalizeToHex6(String(v || ''))
			if (hex) ok.add(hex)
		}
		return Array.from(ok)
	})()
	const hasPalette = paletteWhitelist.length > 0
	return {
		name: t.name,
		templateId: t.templateId,
		category: t.category || '',
		description: finalDesc,
		// Backend contract: `palette` must be a string[] whitelist (#RRGGBB).
		// If empty, omit the hard constraint to avoid “unsatisfiable prompt” failures.
		palette: hasPalette ? paletteWhitelist : undefined,
		paletteMap,
		paletteLocked: hasPalette,
		requireGlow: true,
	}
}

const handlePreviewAgentMsg = async (
	m: AgentToUiMessage,
	opts: { assistantId: string; layerId: string; templateId: string; templateName?: string; sampleTitle?: string; sampleText?: string }
) => {
	if (m.type === 'agentToUi/taskStatus') {
		const ph = String((m as any)?.payload?.phase || '').trim()
		const msg = String((m as any)?.payload?.message || '').trim()
		taskPhase.value = ph
		if (msg) {
			statusText.value = msg
			taskPhaseMessage.value = msg
			appendThoughtLine(msg)
			if (!thoughtDismissed.value) thoughtOpen.value = true
		}
		{
			const text = msg || ph
			if (text) void pushProgressToChat(text)
		}
		return
	}
	if (m.type === 'agentToUi/error') {
		const msg = (m as any)?.payload?.message
		throw new Error(typeof msg === 'string' && msg.trim() ? msg.trim() : 'AI 请求失败')
	}
	if (m.type === 'agentToUi/text') {
		const delta = (m as any)?.payload?.text
		if (typeof delta !== 'string' || !delta) return
		const readable = extractReadableText(delta)
		if (!readable) return
		if (opts.assistantId) appendAssistantText(opts.assistantId, readable)
		return
	}
	if (m.type === 'agentToUi/chatMessage') {
		const c = (m as any)?.payload?.content
		if (typeof c !== 'string' || !c.trim()) return
		const safeContent = extractReadableText(c)
		if (!safeContent) return
		if (opts.assistantId) appendAssistantText(opts.assistantId, safeContent + '\n')
		return
	}
	if (m.type === 'agentToUi/componentTemplate') {
		// Chat bubble status: self-check stage (sync to chat box)
		taskPhase.value = 'self_check'
		statusText.value = '自检：检查唯一 root 与可保存要求…'
		const checkMsgId = opts.assistantId || pushAssistantMsg('自检中：检查唯一root根组件、模板结构可保存…')
		if (opts.assistantId) appendAssistantText(checkMsgId, '自检中：检查唯一root根组件、模板结构可保存…')

		const tpl = (m as any)?.payload?.template
		const repaired = repairComponentTemplate(tpl, opts.templateId)
		const check = selfCheckTemplateForSave(repaired)
		if (!check.ok) {
			appendAssistantText(checkMsgId, `\n自检失败：${check.errors.join('；')}`)
			throw new Error(`自检失败：${check.errors.join('; ')}`)
		}
		appendAssistantText(checkMsgId, '\n自检通过：唯一root且结构可保存')
		taskPhase.value = 'self_check_done'
		statusText.value = '自检通过，正在实例化预览…'

		const validated = validateComponentTemplate(repaired)
		if (!validated.ok) throw new Error(`ComponentTemplate invalid: ${validated.errors.join('; ')}`)
		generatedTemplateById.value = { ...generatedTemplateById.value, [opts.templateId]: validated.value }

		// Instantiate into preview layer.
		const params = buildDefaultTemplateParams(validated.value, {
			title: String(opts.templateName || validated.value?.name || opts.templateId || '').trim(),
			subtitle: String(opts.sampleTitle || '').trim(),
			body: String(opts.sampleText || '').trim(),
			text: String(opts.sampleText || '').trim(),
		})
		const rootId = await instantiateIntoLayerWithParams(opts.layerId, validated.value, params)
		previewRootIdByTemplateId.value = { ...previewRootIdByTemplateId.value, [opts.templateId]: rootId }
		const f = Math.max(0, Math.floor(TimelineStore.state.currentFrame ?? 0))
		await setOpacityKeyframes(opts.layerId, rootId, [{ frame: f, opacity: 1 }])
		// Prevent preview nodes from being wiped by stage snapshots (flash-then-disappear).
		try {
			const layersForSnapshot = buildLayersForStageSnapshot()
			await TimelineStore.dispatch('setStageKeyframeSnapshotRange', { startFrame: f, endFrame: f, layers: layersForSnapshot as any })
		} catch {
			// ignore snapshot failures (preview can still work without stage snapshots enabled)
		}
		return
	}
	// Strong constraint: preview must be produced via a single componentTemplate instantiation.
	// Ignore incremental node operations to avoid scattered/multi-root outputs.
	if (m.type === 'agentToUi/insertNode') return
	if (m.type === 'agentToUi/patchNode') return
	if (m.type === 'agentToUi/deleteNode') return
}

const startUnderstanding = async () => {
	understandAborter?.abort()
	understandAborter = new AbortController()
	chatAborter?.abort()
	chatAborter = null

	summaryReady.value = false
	errorText.value = ''
	statusText.value = ''
	taskPhase.value = ''

	const layerId = props.layerId
	if (!layerId) {
		phase.value = 'idle'
		return
	}
	if (!cues.value.length) {
		phase.value = 'idle'
		return
	}

	phase.value = 'checking'
	statusText.value = '检查后端连接...'
	messages.value = []
	stopTyping()
	lastSummaryNarrative.value = ''
	summaryChatIntro.value = '我正在检查后端连接…'
	thoughtLines.value = []
	thoughtDismissed.value = false
	thoughtOpen.value = false
	{
		const id = pushAssistantMsg('')
		progressAssistantId.value = id
		activeAssistantId.value = id
		syncSummaryNarrative(id)
	}

	try {
		const ping = await service.ping()
		if (!ping.ok) {
			phase.value = 'error'
			errorText.value = '后端 AI 未就绪：缺少模型配置'
			return
		}
	} catch (e) {
		phase.value = 'error'
		errorText.value = e instanceof Error ? e.message : String(e)
		return
	}

	phase.value = 'summarizing'
	statusText.value = '生成字幕整体理解...'
	taskPhase.value = ''
	summary.value = createEmptySubtitleSummaryState()
	draft.value = ''
	summaryChatIntro.value = `我正在读取字幕并生成“字幕整体理解”（共 ${(cues.value as any[])?.length || 0} 段）…`
	if (typeof progressAssistantId.value === 'string' && progressAssistantId.value) syncSummaryNarrative(progressAssistantId.value)

	try {
		for await (const ev of service.streamUnderstand({
			layerId,
			cues: cues.value as unknown[],
			cueRanges: cueRanges.value as unknown[],
			scope: 'overall',
			signal: understandAborter.signal,
		})) {
			if (ev.type === 'msg') {
				handleAgentMsg(ev.message, { target: 'summary' })
				continue
			}
			if (ev.type === 'error') {
				phase.value = 'error'
				errorText.value = ev.error.message
				return
			}
			if (ev.type === 'done') {
				break
			}
		}

		summaryReady.value = true
		phase.value = 'ready'
		statusText.value = '字幕整体理解完成'
		summaryChatIntro.value = '字幕整体理解已生成。你可以在右侧继续提问，或在左侧逐步生成配色/组件建议。'
		if (typeof progressAssistantId.value === 'string' && progressAssistantId.value) syncSummaryNarrative(progressAssistantId.value)
		saveSummaryCache(layerId)
	} catch (e) {
		if (understandAborter.signal.aborted) return
		phase.value = 'error'
		errorText.value = e instanceof Error ? e.message : String(e)
	}
	activeAssistantId.value = null
	stopTyping()
}

const generateStyleAdvice = async () => {
	styleAborter?.abort()
	styleAborter = new AbortController()
	const layerId = props.layerId
	if (!layerId) return
	if (!canGenerateStyleAdvice.value) return

	localBusy.value = true
	localBusyLabel.value = '生成配色建议'
	statusText.value = '生成配色与风格建议…'

	messages.value.push({ id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: 'user', text: '生成配色与风格建议' })
	await scrollToBottom()
	const assistantId = pushAssistantMsg('')
	await scrollToBottom()
	thoughtLines.value = []
	thoughtDismissed.value = false
	thoughtOpen.value = false

	try {
		for await (const ev of service.streamStyleAdvice({
			layerId,
			understanding: (summary.value as any)?.understanding ?? {},
			signal: styleAborter.signal,
		})) {
			if (ev.type === 'msg') {
				handleAgentMsg(ev.message, { target: 'chat', assistantId, applyToSummary: true })
				continue
			}
			if (ev.type === 'error') throw new Error(ev.error.message)
			if (ev.type === 'done') break
		}
		statusText.value = '配色与风格建议已生成'
	} catch (e) {
		if (styleAborter.signal.aborted) return
		messages.value.push({ id: `e-${Date.now()}`, role: 'assistant', text: e instanceof Error ? e.message : String(e) })
	} finally {
		localBusy.value = false
		localBusyLabel.value = ''
		statusText.value = '就绪'
		activeAssistantId.value = null
		await scrollToBottom()
		if (props.layerId) saveSummaryCache(props.layerId)
	}
}

const generateTemplateSuggestions = async () => {
	templatesAborter?.abort()
	templatesAborter = new AbortController()
	const layerId = props.layerId
	if (!layerId) return
	if (!canGenerateTemplateSuggestions.value) return

	localBusy.value = true
	localBusyLabel.value = '生成组件描述'
	statusText.value = '生成可复用高级组件描述…'

	messages.value.push({ id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: 'user', text: '生成可复用高级组件描述' })
	await scrollToBottom()
	const assistantId = pushAssistantMsg('')
	await scrollToBottom()
	thoughtLines.value = []
	thoughtDismissed.value = false
	thoughtOpen.value = false

	try {
		for await (const ev of service.streamTemplateSuggestions({
			layerId,
			understanding: (summary.value as any)?.understanding ?? {},
			signal: templatesAborter.signal,
		})) {
			if (ev.type === 'msg') {
				handleAgentMsg(ev.message, { target: 'chat', assistantId, applyToSummary: true })
				continue
			}
			if (ev.type === 'error') throw new Error(ev.error.message)
			if (ev.type === 'done') break
		}
		statusText.value = '组件描述已生成'
	} catch (e) {
		if (templatesAborter.signal.aborted) return
		messages.value.push({ id: `e-${Date.now()}`, role: 'assistant', text: e instanceof Error ? e.message : String(e) })
	} finally {
		localBusy.value = false
		localBusyLabel.value = ''
		statusText.value = '就绪'
		activeAssistantId.value = null
		await scrollToBottom()
		if (props.layerId) saveSummaryCache(props.layerId)
	}
}

const sendText = async (text: string, opts?: { clearDraft?: boolean }) => {
	if (!chatEnabled.value) return
	const t = String(text || '').trim()
	if (!t) return
	if (phase.value === 'chatting') return

	if (opts?.clearDraft !== false) draft.value = ''

	messages.value.push({ id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: 'user', text: t })
	await scrollToBottom()

	const layerId = props.layerId
	if (!layerId) return
	chatAborter?.abort()
	chatAborter = new AbortController()
	phase.value = 'chatting'
	statusText.value = 'AI 回复中...'
	taskPhase.value = 'started'
	taskPhaseMessage.value = ''
	thoughtLines.value = []
	thoughtOpen.value = false
	thoughtDismissed.value = false
	activeAssistantId.value = null

	const requestMessages = messages.value
		.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
		.map((m) => ({ role: m.role, content: m.text }))

	const assistantId = `a-${Date.now()}-${Math.random().toString(16).slice(2)}`
	activeAssistantId.value = assistantId
	messages.value.push({ id: assistantId, role: 'assistant', text: '' })
	await scrollToBottom()

	try {
		for await (const ev of service.streamPanelChat({
			layerId,
			summary: summary.value,
			messages: requestMessages,
			deepMode: deepMode.value,
			signal: chatAborter.signal,
		})) {
			if (ev.type === 'msg') {
				handleAgentMsg(ev.message, { target: 'chat', assistantId })
				continue
			}
			if (ev.type === 'error') {
				messages.value.push({
					id: `e-${Date.now()}`,
					role: 'assistant',
					text: `请求失败：${ev.error.message}`,
				})
				break
			}
			if (ev.type === 'done') break
		}
	} catch (e) {
		if (chatAborter?.signal.aborted) return
		messages.value.push({
			id: `e-${Date.now()}`,
			role: 'assistant',
			text: e instanceof Error ? e.message : String(e),
		})
	} finally {
		if (!chatAborter?.signal.aborted) {
			phase.value = 'ready'
			statusText.value = '就绪'
			taskPhase.value = 'done'
			taskPhaseMessage.value = ''
			activeAssistantId.value = null
		}
		await scrollToBottom()
	}
}

const applyPaletteFromMessage = (m: ChatMessage) => {
	if (!m.styleData || m.applied) return
	localBusy.value = true
	statusText.value = '应用配色…'
	try {
		const next = { ...summary.value.style }
		if (m.styleData.palette && typeof m.styleData.palette === 'object') (next as any).palette = m.styleData.palette
		summary.value = { ...summary.value, style: next as any }
		m.applied = true
		if (props.layerId) saveSummaryCache(props.layerId)
	} finally {
		localBusy.value = false
		statusText.value = '就绪'
	}
}

const applyPanelPatchFromMessage = async (m: ChatMessage) => {
	if (m.applied) return
	const patch = m.panelPatch
	if (!patch || typeof patch !== 'object') return

	localBusy.value = true
	localBusyLabel.value = '应用修改'
	statusText.value = '应用修改…'
	try {
		if ((patch as any).style && typeof (patch as any).style === 'object') {
			summary.value = applySubtitleSummaryDelta(summary.value, { section: 'style', data: (patch as any).style })
		}
		if (Array.isArray((patch as any).templates)) {
			summary.value = applySubtitleSummaryDelta(summary.value, { section: 'templates', data: (patch as any).templates })
		}
		m.applied = true
		if (props.layerId) saveSummaryCache(props.layerId)
		{
			const t = m.panelPatchTarget
			const what = t === 'both' ? '风格建议与组件描述' : t === 'style' ? '风格建议' : t === 'templates' ? '组件描述' : '修改'
			messages.value.push({
				id: `a-${Date.now()}-${Math.random().toString(16).slice(2)}`,
				role: 'assistant',
				text: `已应用${what}到左侧面板。`,
			})
		}
	} finally {
		localBusy.value = false
		localBusyLabel.value = ''
		statusText.value = '就绪'
		await scrollToBottom()
	}
}

const isRunning = (m: ChatMessage) => {
	return m.role === 'assistant' && !!activeAssistantId.value && m.id === activeAssistantId.value
}

const showRunningBubble = computed(() => (phase.value === 'checking' || phase.value === 'summarizing' || localBusy.value) && messages.value.length === 0)

const sendFromInput = async () => {
	await sendText(draft.value, { clearDraft: true })
}

const generatePalette = async () => {
	paletteAborter?.abort()
	paletteAborter = new AbortController()

	const layerId = props.layerId
	if (!layerId) return
	if (!summaryReady.value) return
	const notes = Array.isArray((summary.value as any)?.style?.notes) ? ((summary.value as any).style.notes as any[]) : []
	if (!notes.length) {
		// Non-blocking prerequisite hint: do NOT lock the whole panel.
		errorText.value = ''
		statusText.value = '请先生成“配色与风格建议”，再生成配色预览'
		messages.value.push({
			id: `a-${Date.now()}-${Math.random().toString(16).slice(2)}`,
			role: 'assistant',
			text: '请先生成“配色与风格建议”，再生成配色预览。',
		})
		await scrollToBottom()
		return
	}

	localBusy.value = true
	localBusyLabel.value = '生成配色'
	statusText.value = '生成配色…'
	progressAssistantId.value = null
	messages.value.push({ id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: 'user', text: '生成配色预览' })
	await scrollToBottom()
	const assistantId = pushAssistantMsg('')
	await scrollToBottom()
	thoughtLines.value = []
	thoughtDismissed.value = false
	thoughtOpen.value = false

	try {
		const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
		const nonceHint = `nonce=${nonce}（请以此作为随机种子，让每次生成的配色都不同）`
		for await (const ev of service.streamPalette({
			layerId,
			summary: { understanding: (summary.value as any)?.understanding ?? {}, style: (summary.value as any)?.style ?? {} },
			text: nonceHint,
			signal: paletteAborter.signal,
		})) {
			if (ev.type === 'msg') {
				handleAgentMsg(ev.message, { target: 'chat', assistantId, applyToSummary: true })
				continue
			}
			if (ev.type === 'error') {
				phase.value = 'error'
				errorText.value = ev.error.message
				return
			}
			if (ev.type === 'done') break
		}
		statusText.value = '配色已生成（可在聊天中确认应用）'
	} catch (e) {
		if (paletteAborter.signal.aborted) return
		phase.value = 'error'
		errorText.value = e instanceof Error ? e.message : String(e)
	} finally {
		localBusy.value = false
		localBusyLabel.value = ''
		statusText.value = '就绪'
		activeAssistantId.value = null
		if (props.layerId) saveSummaryCache(props.layerId)
	}
}

type TemplateItem = {
	key: string
	templateId: string
	name: string
	category?: string
	spec: SubtitleTemplateSuggestion
	saved: boolean
}

const savedComponentMap = ref<Record<string, boolean>>({})
const generatedTemplateById = ref<Record<string, any>>({})
const previewLayerByTemplateId = ref<Record<string, string>>({})
const previewRootIdByTemplateId = ref<Record<string, string>>({})

type SavedComponent = {
	id: string
	createdAt: string
	templateId: string
	name: string
	template: any
	savedAt: string
	thumbAssetId?: string
	thumbDataUrl?: string
	thumbUrl?: string
}

const COMPONENT_LIBRARY_KEY = 'dvs.componentLibrary.v1'
const componentService = new ComponentLibraryService()

const loadComponentLibrary = (): SavedComponent[] => {
	try {
		const raw = localStorage.getItem(COMPONENT_LIBRARY_KEY)
		const parsed = raw ? JSON.parse(raw) : []
		if (!Array.isArray(parsed)) return []
		return parsed
			.filter((x) => x && typeof x === 'object')
			.map((x: any) => ({
				id:
					typeof x.id === 'string' && x.id.trim()
						? x.id
						: `${typeof x.templateId === 'string' ? x.templateId : ''}::${typeof x.savedAt === 'string' ? x.savedAt : ''}`,
				createdAt: typeof x.createdAt === 'string' ? x.createdAt : (typeof x.savedAt === 'string' ? x.savedAt : new Date().toISOString()),
				templateId: typeof x.templateId === 'string' ? x.templateId : '',
				name: typeof x.name === 'string' ? x.name : '',
				template: x.template,
				savedAt: typeof x.savedAt === 'string' ? x.savedAt : new Date().toISOString(),
				thumbAssetId: typeof x.thumbAssetId === 'string' ? x.thumbAssetId : undefined,
				thumbDataUrl: typeof x.thumbDataUrl === 'string' ? x.thumbDataUrl : undefined,
				thumbUrl: typeof x.thumbUrl === 'string' ? x.thumbUrl : undefined,
			}))
			.filter((x: SavedComponent) => x.id && x.templateId && x.name)
	} catch {
		return []
	}
}

const persistComponentToLocalStorage = (saved: SavedComponent) => {
	try {
		const list = loadComponentLibrary()
		const next = list.filter((x) => x.id !== saved.id)
		next.unshift(saved)
		localStorage.setItem(COMPONENT_LIBRARY_KEY, JSON.stringify(next))
	} catch {
		// ignore
	}
}

const templateItems = computed((): TemplateItem[] => {
	const list = Array.isArray(summary.value.templates) ? summary.value.templates : []
	return list
		.map((spec, idx) => {
		const templateId = String((spec as any)?.templateId || '').trim() || `template-${idx + 1}`
		const name = String((spec as any)?.name || templateId)
		const key = `${templateId}__${idx}`
		const rawDesc = Array.isArray((spec as any)?.description) ? ((spec as any).description as any[]) : []
		const cleanedDesc = rawDesc
			.map((x) => (typeof x === 'string' ? x.trim() : ''))
			.filter((x) => !!x)
			.slice(0, 12)
		const patchedSpec = { ...(spec as any), description: cleanedDesc }
		return {
			key,
			templateId,
			name,
			category: typeof (spec as any)?.category === 'string' ? (spec as any).category : undefined,
			spec: patchedSpec as any,
			saved: !!savedComponentMap.value[key],
		}
		})
		// Drop templates with completely empty description to avoid unstable preview prompts.
		.filter((t) => Array.isArray((t.spec as any)?.description) && ((t.spec as any).description as any[]).length > 0)
})

const closePreviewLayerForTemplate = (templateId: string) => {
	const previewLayerId = previewLayerByTemplateId.value[templateId]
	if (previewLayerId) {
		try {
			TimelineStore.dispatch('removeLayer', { layerId: previewLayerId })
			store.dispatch('removeLayer', { layerId: previewLayerId })
		} catch {
			// ignore
		}
		const next = { ...previewLayerByTemplateId.value }
		delete next[templateId]
		previewLayerByTemplateId.value = next
	}
	if (previewRootIdByTemplateId.value[templateId]) {
		const next = { ...previewRootIdByTemplateId.value }
		delete next[templateId]
		previewRootIdByTemplateId.value = next
	}

	if (props.layerId) {
		try {
			store.dispatch('setActiveLayer', { layerId: props.layerId })
			TimelineStore.dispatch('selectLayer', { layerId: props.layerId })
		} catch {
			// ignore
		}
	}
}

const rerunUnderstanding = async () => {
	const layerId = props.layerId
	if (!layerId) return
	clearSummaryCache(layerId)
	await startUnderstanding()
}

const saveTemplateAsComponent = async (t: TemplateItem, ev?: MouseEvent) => {
	if (!t.templateId) return
	if (!generatedTemplateById.value[t.templateId]) {
		errorText.value = `请先为组件生成预览：${t.templateId}`
		return
	}
	const template = generatedTemplateById.value[t.templateId]
	const existing = loadComponentLibrary()
	const existingNames = existing.map((x) => x.name)
	const existingTemplateIds = new Set(existing.map((x) => x.templateId))

	const makeUniqueName = (baseName: string) => {
		const desired = String(baseName || 'Component').trim() || 'Component'
		if (!existingNames.includes(desired)) return desired
		let i = 2
		while (existingNames.includes(`${desired} ${i}`)) i++
		return `${desired} ${i}`
	}
	const makeUniqueTemplateId = (baseId: string) => {
		const desired = safeIdPart(String(baseId || 'tpl').trim() || 'tpl')
		if (!existingTemplateIds.has(desired)) return desired
		let i = 2
		while (existingTemplateIds.has(`${desired}__${i}`)) i++
		return `${desired}__${i}`
	}

	const createdAt = new Date().toISOString()
	const id = `cmp_${Date.now()}_${Math.random().toString(16).slice(2)}`
	const uniqueName = makeUniqueName(t.name || t.templateId)
	const baseTplId = typeof template?.templateId === 'string' && template.templateId.trim() ? template.templateId : t.templateId
	const uniqueTemplateId = makeUniqueTemplateId(baseTplId)
	const savedTemplate = { ...(template as any), templateId: uniqueTemplateId, name: uniqueName }

	// Best-effort thumbnail capture from current WebGL canvas (component area, not whole stage).
	let thumbAssetId: string | undefined
	let thumbDataUrl: string | undefined
	try {
		const layerId = previewLayerByTemplateId.value[t.templateId]
		const rootId = previewRootIdByTemplateId.value[t.templateId] || safeIdPart(`${t.templateId}:root`)
		const dwebCanvas = dwebCanvasRef?.value ?? null
		if (layerId && rootId && dwebCanvas) {
			const layer = findLayer(store.state, layerId)
			const root = layer ? findNode(layer.nodeTree ?? [], rootId) : null
			const tr: any = (root as any)?.transform
			if (tr && typeof tr.x === 'number' && typeof tr.y === 'number' && typeof tr.width === 'number' && typeof tr.height === 'number') {
				const corners = rotatedRectCorners(
					{ x: tr.x, y: tr.y },
					{ width: Math.max(1, tr.width), height: Math.max(1, tr.height) },
					Number(tr.rotation ?? 0)
				)
				const pts = [corners.tl, corners.tr, corners.bl, corners.br].map((p) => dwebCanvas.worldToScreen(p))
				const xs = pts.map((p) => p.x)
				const ys = pts.map((p) => p.y)
				const minX = Math.min(...xs)
				const maxX = Math.max(...xs)
				const minY = Math.min(...ys)
				const maxY = Math.max(...ys)
				const shot = await dwebCanvas.capturePngFromScreenRect(
					{ x: minX, y: minY, width: maxX - minX, height: maxY - minY },
					{ maxSidePx: 240, padPx: 10 }
				)
				if (shot?.dataUrl) {
					thumbAssetId = `thumb:${t.templateId}:${Date.now().toString(36)}`
					thumbDataUrl = shot.dataUrl
					store.commit('upsertImageAsset', { id: thumbAssetId, url: thumbDataUrl, name: t.name })
					const fromEl = (ev?.currentTarget as HTMLElement | null) ?? null
					const fromRect = fromEl?.getBoundingClientRect?.()
					const toEl = document.querySelector('[data-dvs="component-library-btn"]') as HTMLElement | null
					const toRect = toEl?.getBoundingClientRect?.()
					if (fromRect && toRect) {
						void flyThumbnailPng({
							dataUrl: thumbDataUrl,
							from: { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
							to: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
							initialSize: { width: 160, height: 100 },
							ms: 360,
						})
					}
				}
			}
		}
	} catch {
		// ignore
	}

	try {
		messages.value.push({
			id: `a-${Date.now()}-${Math.random().toString(16).slice(2)}`,
			role: 'assistant',
			text: `已保存组件：${uniqueName}（templateId: ${uniqueTemplateId}）`,
		})
		await scrollToBottom()
	} catch {
		// ignore
	}

	const saved: SavedComponent = {
		id,
		createdAt,
		templateId: uniqueTemplateId,
		name: uniqueName,
		template: savedTemplate,
		savedAt: new Date().toISOString(),
		thumbAssetId,
		thumbDataUrl,
	}
	let finalSaved = saved
	try {
		const res = await componentService.upsertComponent({
			templateId: saved.templateId,
			name: saved.name,
			template: saved.template,
			thumbAssetId: saved.thumbAssetId,
			thumbDataUrl: saved.thumbDataUrl,
			clientId: saved.id,
			createdAt: saved.createdAt,
		})
		finalSaved = {
			...saved,
			id: res.item.id || saved.id,
			createdAt: res.item.createdAt || saved.createdAt,
			savedAt: res.item.savedAt || saved.savedAt,
			thumbUrl: res.item.thumbUrl,
		}
	} catch {
		// fallback to local storage only
	}
	persistComponentToLocalStorage(finalSaved)
	savedComponentMap.value = { ...savedComponentMap.value, [t.key]: true }
	closePreviewLayerForTemplate(t.templateId)
	statusText.value = '已保存到组件库（可在组件库查看与使用）'
}

const safeIdPart = (s: string) => String(s).replace(/[^a-zA-Z0-9:_\-]/g, '_')

const createTimelineAndStageLayer = async (name: string, opts?: { activate?: boolean }) => {
	await TimelineStore.dispatch('addLayer')
	const layer = TimelineStore.state.layers[TimelineStore.state.layers.length - 1]
	if (!layer) throw new Error('创建时间轴图层失败')
	// rename timeline layer
	try {
		await TimelineStore.dispatch('renameLayer', { layerId: layer.id, name })
	} catch {
		// ignore if not supported
	}
	await store.dispatch('addLayer', { layerId: layer.id, name })
	if (opts?.activate !== false) await store.dispatch('setActiveLayer', { layerId: layer.id })
	return layer.id
}

const instantiateIntoLayer = async (layerId: string, template: any) => {
	const instantiated = componentTemplateApi.instantiateTemplate(template as any, {}, {
		getNodeId: ({ templateId, localId }) => {
			const base = safeIdPart(`${templateId}:${localId}`)
			let id = base
			let i = 1
			while (nodeExistsInAnyLayer(store.state.layers, id)) id = `${base}__${i++}`
			return id
		},
	})
	await store.dispatch('addNodeTree', { node: instantiated.root, layerId })
	return instantiated.root?.id as string
}

const instantiateIntoLayerWithParams = async (layerId: string, template: any, params: Record<string, any>) => {
	const instantiated = componentTemplateApi.instantiateTemplate(template as any, params ?? {}, {
		getNodeId: ({ templateId, localId }) => {
			const base = safeIdPart(`${templateId}:${localId}`)
			let id = base
			let i = 1
			while (nodeExistsInAnyLayer(store.state.layers, id)) id = `${base}__${i++}`
			return id
		},
	})
	await store.dispatch('addNodeTree', { node: instantiated.root, layerId })
	return instantiated.root?.id as string
}

const collectSubtitleText = (startCue: number, endCue: number) => {
	const a = Math.max(0, Math.min(startCue, endCue))
	const b = Math.max(0, Math.max(startCue, endCue))
	const out: string[] = []
	for (let i = a; i <= b; i++) {
		const t = (cues.value as any[])[i]?.text
		if (typeof t === 'string' && t.trim()) out.push(t.trim())
	}
	return out.join(' ')
}

const normalizeParamKey = (k: unknown) => String(k ?? '').trim().replace(/\s+/g, '')

const buildDefaultTemplateParams = (
	template: any,
	opts: { title?: string; subtitle?: string; body?: string; text?: string }
) => {
	const params: Record<string, any> = {}
	const list = Array.isArray(template?.params) ? template.params : []
	const title = String(opts.title ?? '').trim()
	const subtitle = String(opts.subtitle ?? '').trim()
	const body = String(opts.body ?? '').trim()
	const text = String(opts.text ?? '').trim()
	for (const it of list) {
		const keyRaw = typeof it?.key === 'string' ? it.key : ''
		const key = keyRaw.trim()
		if (!key) continue
		const nk = normalizeParamKey(key).toLowerCase()
		if (params[key] !== undefined) continue

		if (nk === 'title' || nk.endsWith('.title') || nk.includes('title')) params[key] = title || subtitle || 'Title'
		else if (nk === 'subtitle' || nk.includes('sub')) params[key] = subtitle || ''
		else if (nk === 'body' || nk === 'text' || nk === 'content' || nk.includes('desc') || nk.includes('summary'))
			params[key] = body || text || ''
		else if (it?.default !== undefined) params[key] = it.default
	}
	return params
}

const pushAssistantMsg = (text: string) => {
	const assistantId = `a-${Date.now()}-${Math.random().toString(16).slice(2)}`
	messages.value.push({ id: assistantId, role: 'assistant', text: '' })
	activeAssistantId.value = assistantId
	if (text) pushStreamText(assistantId, text)
	return assistantId
}

const appendAssistantText = (assistantId: string, delta: string) => {
	pushStreamText(assistantId, delta)
}

const setOpacityKeyframes = async (layerId: string, nodeId: string, frames: Array<{ frame: number; opacity: number }>) => {
	for (const it of frames) {
		await TimelineStore.dispatch('addKeyframeRange', { layerId, startFrame: it.frame, endFrame: it.frame })
		await TimelineStore.dispatch('setNodeKeyframeSnapshotRange', {
			layerId,
			startFrame: it.frame,
			endFrame: it.frame,
			nodesById: {
				[nodeId]: { transform: { opacity: it.opacity } },
			},
		})
	}
}

const previewTemplate = async (t: TemplateItem) => {
	if (!summaryReady.value) return
	// Require a confirmed palette so preview templates do not introduce out-of-scheme colors.
	if (!paletteEntries.value.length) {
		errorText.value = '请先生成配色（并确认应用），再生成可复用组件预览'
		return
	}
	const runId = ++previewRunId.value
	messages.value.push({
		id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		role: 'user',
		text: `生成预览：${t.name}`,
	})
	await scrollToBottom()
	const assistantId = pushAssistantMsg('正在创建预览图层…\n')
	await scrollToBottom()
	localBusy.value = true
	localBusyLabel.value = `生成预览：${t.name}`
	statusText.value = '创建预览图层…'
	progressAssistantId.value = null
	try {
		const layerId = await createTimelineAndStageLayer(`预览：${t.name}`, { activate: false })
		appendAssistantText(assistantId, '【进度】预览图层已创建\n')
		previewLayerByTemplateId.value = { ...previewLayerByTemplateId.value, [t.templateId]: layerId }

		const outlineItems = Array.isArray((summary.value as any)?.outline?.items) ? (((summary.value as any).outline.items as any[]) ?? []) : []
		const firstOutline = outlineItems.length ? outlineItems[0] : null
		const sampleTitle = typeof firstOutline?.title === 'string' ? firstOutline.title : ''
		const sc = Number.isInteger(firstOutline?.startCue) ? (firstOutline.startCue as number) : 0
		const ec = Number.isInteger(firstOutline?.endCue) ? (firstOutline.endCue as number) : Math.min(sc + 2, Math.max(0, (cues.value as any[])?.length - 1))
		const sampleText = collectSubtitleText(sc, ec)

		statusText.value = '请求 AI 生成模板（专属 API / agentToUi-jsonl）…'
		appendAssistantText(assistantId, '【进度】请求 AI 生成模板…\n')
		previewAborter.value?.abort()
		const aborter = new AbortController()
		previewAborter.value = aborter
		const promptInput = buildPreviewPromptInput(t)
		// Debug: dump request summary (avoid logging huge node trees).
		if (import.meta.env.DEV) {
			try {
				const baseUrlOverride = (window as any)?.__DWEB_BACKEND_BASE_URL
				const baseUrlStorage = window.localStorage.getItem('dweb.backendBaseUrl')
				// eslint-disable-next-line no-console
				console.log('[template:stream request]', {
					promptPreset: 'subtitle_template_preview',
					paletteCount: Array.isArray((promptInput as any)?.palette) ? (promptInput as any).palette.length : 0,
					paletteLocked: (promptInput as any)?.paletteLocked,
					requireGlow: (promptInput as any)?.requireGlow,
				backendBaseUrl: baseUrlOverride || import.meta.env.VITE_BACKEND_BASE_URL || baseUrlStorage || '(same-origin/proxy)',
				})
			} catch {
				// ignore
			}
		}
		if (!Array.isArray((promptInput as any).description) || !(promptInput as any).description.length) {
			throw new Error('模板描述为空：请重新总结或先生成配色后再试')
		}

		let gotTemplate = false
		const seenMsgTypes: string[] = []
		for await (const ev of service.streamTemplate({
			promptPreset: 'subtitle_template_preview',
			promptInput,
			contextPack: buildPreviewContextPack(layerId),
			debug: true,
			signal: aborter.signal,
		})) {
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console
				console.log('[template:stream event]', ev)
			}
			if (ev.type === 'msg') {
				seenMsgTypes.push(String((ev.message as any)?.type || ''))
				if (ev.message.type === 'agentToUi/componentTemplate') gotTemplate = true
				// Extra debug to avoid false negatives when the message exists but gotTemplate isn't set.
				if (import.meta.env.DEV && ev.message.type === 'agentToUi/componentTemplate') {
					try {
						// eslint-disable-next-line no-console
						console.log('[template:stream GOT componentTemplate]', {
							templateId: (ev.message as any)?.payload?.template?.templateId,
							rootLocalId: (ev.message as any)?.payload?.template?.rootLocalId,
							nodeCount: Array.isArray((ev.message as any)?.payload?.template?.nodes)
								? (ev.message as any).payload.template.nodes.length
								: undefined,
						})
					} catch {
						// ignore
					}
				}
				await handlePreviewAgentMsg(ev.message, {
					assistantId,
					layerId,
					templateId: t.templateId,
					templateName: t.name,
					sampleTitle,
					sampleText,
				})
				continue
			}
			if (ev.type === 'error') throw new Error(ev.error.message)
			if (ev.type === 'done') break
		}
		if (!gotTemplate) {
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console
				console.log('[template:stream missing componentTemplate]', { seenMsgTypes })
			}
			throw new Error('AI 未返回 agentToUi/componentTemplate，无法确认/复用该模板')
		}
		statusText.value = '预览已生成'
		appendAssistantText(assistantId, '【完成】预览已生成\n')
	} catch (e) {
		// Avoid stale/parallel runs overwriting latest UI state.
		if (runId !== previewRunId.value) return
		const msg = e instanceof Error ? e.message : String(e)
		errorText.value = msg
		messages.value.push({ id: `e-${Date.now()}`, role: 'assistant', text: `预览生成失败：${msg}` })
	} finally {
		if (runId !== previewRunId.value) return
		localBusy.value = false
		localBusyLabel.value = ''
		statusText.value = '就绪'
		activeAssistantId.value = null
	}
}


watch(
	() => props.layerId,
	() => {
		const layerId = props.layerId
		if (!layerId) {
			phase.value = 'idle'
			return
		}
		const hit = loadSummaryCache(layerId)
		const h = hit && typeof hit.cuesHash === 'string' ? hit.cuesHash : ''
		const nowHash = computeCuesHash(cues.value as any[])
		if (hit && h && h === nowHash) {
			summary.value = hit.summary
			summaryReady.value = true
			phase.value = 'ready'
			errorText.value = ''
			statusText.value = '已从缓存载入（可点击重新总结）'
			return
		}
		void startUnderstanding()
	},
	{ immediate: true }
)

onBeforeUnmount(() => {
	understandAborter?.abort()
	chatAborter?.abort()
})
</script>

<style scoped>
.vs-ai {
  flex: 1 1 auto;
  display: flex;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 10px;
}

.vs-ai-left {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
}

.vs-ai-right {
  flex: 0 0 280px;
  min-width: 240px;
  max-width: 360px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  position: relative;
}

/* Chat styles aligned with AIChatDialog */
.ai-chat__title {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  background: var(--dweb-defualt-dark);
  border-bottom: 1px solid var(--vscode-border);
  cursor: default;
}

.vs-ai-md-sec-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-chat__title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ai-chat__title-text {
  font-size: 12px;
  font-weight: 600;
}

.ai-chat__title-status {
  font-size: 11px;
  color: var(--vscode-fg-muted);
  white-space: nowrap;
}

.ai-chat__title-actions {
  display: flex;
  gap: 6px;
}

.ai-chat__icon {
  width: 26px;
  height: 24px;
  border-radius: 0;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.ai-chat__icon:hover {
  border-color: var(--vscode-border-accent);
}

.ai-chat__body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ai-chat__list {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 2;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-chat__msg {
  display: flex;
}

.ai-chat__msg.user {
  justify-content: flex-end;
}

.ai-chat__msg.assistant {
  justify-content: flex-start;
}

.ai-chat__bubble {
  max-width: 90%;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  border-radius: 0;
  padding: 8px 10px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-chat__msg.user .ai-chat__bubble {
  border-color: var(--vscode-border-accent);
}

.ai-chat__msg.assistant .ai-chat__bubble {
  border-color: var(--vscode-border);
}

.ai-chat__role {
  font-size: 11px;
  color: var(--vscode-fg-muted);
  margin-bottom: 4px;
}

.ai-chat__text {
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-chat__phase {
  margin-top: 6px;
  font-size: 11px;
  color: var(--vscode-fg-muted);
}

.ai-chat__typing {
  height: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-chat__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vscode-fg-muted);
  opacity: 0.25;
  animation: ai-chat-dot 900ms infinite ease-in-out;
}

.ai-chat__dot:nth-child(2) {
  animation-delay: 150ms;
}

.ai-chat__dot:nth-child(3) {
  animation-delay: 300ms;
}

@keyframes ai-chat-dot {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

.ai-chat__input {
  height: 44px;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-top: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
}

.ai-chat__text-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  border-radius: 0;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  padding: 0 10px;
  font-size: 12px;
}

.ai-chat__text-input:focus {
  outline: none;
  border-color: var(--vscode-border-accent);
}

.ai-chat__send {
  height: 28px;
  padding: 0 10px;
  border-radius: 0;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  cursor: pointer;
  font-size: 12px;
}

.ai-chat__send:hover {
  border-color: var(--vscode-border-accent);
}

.ai-chat__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vs-ai-thought {
  flex: 0 0 auto;
  border-top: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  padding: 8px;
  max-height: 160px;
  overflow: auto;
}

.vs-ai-thought-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.vs-ai-thought-title {
  font-size: 12px;
  opacity: 0.8;
}

.vs-ai-thought-close {
  width: 24px;
  height: 24px;
  border-radius: 0;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  cursor: pointer;
  line-height: 1;
}

.vs-ai-thought-close:hover {
  border-color: var(--vscode-border-accent);
}

.vs-ai-thought-body {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.35;
}
.vs-ai-head {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--vscode-border);
}

.vs-ai-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.vs-ai-status-text {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.vs-ai-spinner {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid var(--vscode-border);
  border-top-color: var(--vscode-border-accent);
  animation: vs-ai-spin 900ms linear infinite;
  flex: 0 0 auto;
}

@keyframes vs-ai-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.vs-ai-error {
  border-bottom: 1px solid var(--vscode-border);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--vscode-error);
}

.vs-ai-title {
  font-size: 12px;
  color: var(--vscode-fg);
}

.vs-ai-meta {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.vs-ai-mdview {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  color: var(--vscode-fg);
  font-size: 12px;
}

.vs-ai-md-empty {
  color: var(--vscode-fg-muted);
  font-size: 12px;
}

.vs-ai-md-sec {
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}

.vs-ai-md-sec-title {
  font-size: 12px;
  color: var(--vscode-fg);
  margin-bottom: 6px;
}

.vs-ai-understanding-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.vs-ai-understanding-points {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.vs-ai-understanding-point {
  color: var(--vscode-fg);
  white-space: pre-wrap;
}

.vs-ai-lib {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vs-ai-lib-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vs-ai-lib-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  background: transparent;
  padding: 6px 8px;
  cursor: pointer;
}

.vs-ai-lib-item.active {
  border-color: var(--vscode-border-accent);
}

.vs-ai-lib-thumb {
  width: 36px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
}

.vs-ai-lib-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--vscode-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vs-ai-lib-body {
  border-top: 1px solid var(--vscode-border);
  padding-top: 10px;
}

.vs-ai-lib-form-title {
  font-size: 12px;
  color: var(--vscode-fg);
  margin-bottom: 8px;
}

.vs-ai-lib-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vs-ai-lib-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vs-ai-lib-field-label {
  flex: 0 0 120px;
  min-width: 0;
  font-size: 12px;
  color: var(--vscode-fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vs-ai-lib-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  background: transparent;
  color: var(--vscode-fg);
  padding: 6px 8px;
  font-size: 12px;
}

.vs-ai-lib-checkbox {
  width: 16px;
  height: 16px;
}

.vs-ai-lib-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

@keyframes vs-ai-pulse {
  0% {
    border-color: var(--vscode-border);
  }
  50% {
    border-color: var(--vscode-border-accent);
  }
  100% {
    border-color: var(--vscode-border);
  }
}

.vs-ai-lib--pulse {
  animation: vs-ai-pulse 0.7s ease-in-out 1;
}

.vs-ai-md-html :deep(p),
.vs-ai-md-html :deep(ul),
.vs-ai-md-html :deep(ol) {
  margin: 0 0 8px;
}

.vs-ai-md-html :deep(code) {
  border: 1px solid var(--vscode-border);
  border-radius: 6px;
  padding: 0 4px;
}

.vs-ai-md-html :deep(a) {
  color: var(--vscode-border-accent);
}

.vs-ai-palette {
  margin-top: 10px;
  border-top: 1px solid var(--vscode-border);
  padding-top: 10px;
}

.vs-ai-palette-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vs-ai-palette-title {
  font-size: 12px;
  color: var(--vscode-fg);
}

.vs-ai-palette-head .vs-btn {
  margin-left: auto;
}

.vs-ai-palette-grid {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vs-ai-palette-item {
  display: grid;
  grid-template-columns: 14px 90px 1fr;
  align-items: center;
  gap: 8px;
}

.vs-ai-palette-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--vscode-border);
}

.vs-ai-palette-key {
  color: var(--vscode-fg);
}

.vs-ai-palette-val {
  color: var(--vscode-fg-muted);
}

.vs-ai-palette-hint {
  margin-top: 8px;
  color: var(--vscode-fg-muted);
  font-size: 12px;
}

.vs-ai-confirm {
  margin-top: 10px;
  border-top: 1px solid var(--vscode-border);
  padding-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.vs-ai-confirm-title {
  font-size: 12px;
  color: var(--vscode-fg);
}

.vs-ai-confirm-meta {
  font-size: 12px;
  color: var(--vscode-fg-muted);
}

.vs-ai-confirm .vs-btn {
  margin-left: auto;
}

.vs-ai-plan {
  margin-top: 10px;
  border-top: 1px solid var(--vscode-border);
  padding-top: 10px;
}

.vs-ai-plan-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.vs-ai-plan-title {
  font-size: 12px;
  color: var(--vscode-fg);
}

.vs-ai-plan-hint {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  margin-left: auto;
}

.vs-ai-plan-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vs-ai-plan-item {
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.vs-ai-plan-main {
  flex: 1 1 auto;
  min-width: 0;
}

.vs-ai-plan-item-title {
  font-size: 12px;
  color: var(--vscode-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vs-ai-plan-item-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--vscode-fg-muted);
  display: flex;
  gap: 10px;
}

.vs-ai-template-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vs-ai-template-item {
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.vs-ai-template-main {
  flex: 1 1 auto;
  min-width: 0;
}

.vs-ai-template-actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vs-ai-template-actions .vs-btn {
  white-space: nowrap;
}

.vs-ai-template-title {
  font-size: 12px;
  color: var(--vscode-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vs-ai-template-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--vscode-fg-muted);
  display: flex;
  gap: 10px;
}

.vs-ai-chat-palette {
  margin-top: 8px;
  border-top: 1px solid var(--vscode-border);
  padding-top: 8px;
}

.vs-ai-chat-palette-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vs-ai-chat-palette-title {
  font-size: 12px;
  color: var(--vscode-fg);
}

.vs-ai-chat-palette-head .vs-btn {
  margin-left: auto;
}

.vs-ai-empty {
  color: var(--vscode-fg-muted);
  font-size: 12px;
}

.vs-input {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  border-radius: 8px;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}

.vs-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-fg);
  cursor: pointer;
  font-size: 12px;
}

.vs-btn:hover {
  border-color: var(--vscode-border-accent);
}
</style>
