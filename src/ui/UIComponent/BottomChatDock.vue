<template>
	<div
		ref="dockRef"
		class="chat-dock"
		data-bp-ui-overlay="true"
		:class="{
			'history-expanded': historyExpanded,
			collapsed: !!collapsed,
			'right-drawer': isRightDrawer
		}"
		:style="dockStyle"
		@pointerdown.stop
		@wheel.stop
	>
		<button class="chat-collapsed-handle" type="button" @click="requestExpand">{{ t('aichat.dock.handleLabel') }}</button>

		<div class="chat-content" :aria-hidden="collapsed ? 'true' : 'false'">
			<div class="chat-history">
				<div class="chat-history-bar" @pointerdown.stop="onDockDragStart">
					<div class="chat-history-title">
						<select
							class="chat-dock-toolbar-select agent-session-select"
							:value="codexActiveSessionId"
							@change="onAgentSessionChange"
						>
							<option value="">{{ t('aichat.dock.newSession') }}</option>
							<option v-for="s in codexSessions" :key="s.id" :value="s.id">
								{{ s.title || t('aichat.dock.newSession') }}
							</option>
						</select>
						<button
							class="chat-history-new-btn"
							type="button"
							:title="t('aichat.dock.newSessionTitle')"
							@pointerdown.stop
							@click.stop="emit('codex-create-session')"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path
									d="M12 5v14M5 12h14"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									fill="none"
								/>
							</svg>
						</button>
						<button
							class="chat-history-delete-btn"
							type="button"
							:title="t('aichat.dock.deleteSessionTitle')"
							:disabled="!codexActiveSessionId || codexSessions?.length <= 1"
							@pointerdown.stop
							@click.stop="emit('codex-delete-session', codexActiveSessionId)"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path
									d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									fill="none"
								/>
							</svg>
						</button>
					</div>
					<button
						class="chat-history-minimize"
						type="button"
						:title="t('aichat.dock.close')"
						@pointerdown.stop
						@click.stop="requestCollapse"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M6 6l12 12M6 18L18 6"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								fill="none"
							/>
						</svg>
					</button>
				</div>
				<div
					ref="historyBodyRef"
					class="chat-history-body"
				>
					<div class="agent-panel">

						<div class="agent-content-area">
							<div class="agent-chat-area">
								<div v-if="!messages?.length" class="agent-empty-state">
									{{ t('aichat.dock.emptyMessage') }}
								</div>
								<div v-else class="chat-history-list agent-chat-list" ref="chatListRef">
									<div
										v-for="m in messages"
										:key="m.id"
										class="chat-msg"
										:class="
											m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system'
										"
									>
										<div class="chat-msg-bubble">
											<div class="chat-msg-role">
												{{ m.role === 'user' ? t('aichat.dock.roleUser') : m.role === 'assistant' ? t('aichat.dock.roleAgent') : t('aichat.dock.roleSystem') }}
											</div>
											<template v-if="m.role === 'assistant'">
												<ThinkingBlock
													v-if="m.thinkingContent"
													:content="m.thinkingContent || ''"
													:is-thinking="!m.content && (!m.toolCalls?.length || m.toolCalls.every(t => t.status === 'pending'))"
													:default-collapsed="!!m.content"
												/>
												<div v-if="m.toolCalls?.length" class="agent-tool-calls">
													<ToolCallCard
														v-for="(tc, index) in m.toolCalls"
														:key="tc.id"
														:tool-name="tc.name"
														:status="tc.status"
														:args="tc.args"
														:result="tc.result"
														:error="tc.error"
														:default-expanded="tc.status === 'running'"
														:auto-collapsed="tc.status === 'completed'"
													/>
													<template v-for="tc in m.toolCalls" :key="'loc-' + tc.id">
														<NodeLocationCard
															v-if="isCreateNodeToolResult(tc)"
															:node-id="getToolResultField(tc.result, 'nodeId')"
															:node-title="getToolResultField(tc.result, 'title')"
															:node-type="getToolResultField(tc.result, 'nodeType')"
															@locate="onLocateNode(getToolResultField(tc.result, 'nodeId'))"
														/>
													</template>
												</div>
												<UserChoicePanel
													v-if="m.userChoices?.length"
													:options="m.userChoices"
													:disabled="m.userChoiceSelected !== null"
													@select="(idx, text) => onUserChoiceSelect(m.id, idx, text)"
												/>
												<div v-if="m.content" class="chat-msg-content">{{ m.content }}</div>
											</template>
											<template v-else>
												<div class="chat-msg-content">{{ m.content }}</div>
											</template>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="chat-dock-body">
				<div class="agent-working-dir">
					<span>{{ t('aichat.dock.workingDir') }}</span>
					<span class="agent-working-dir-path">{{ agentWorkingDirectory }}</span>
				</div>

				<div class="chat-dock-status" aria-live="polite">
					<span class="chat-dock-status-text">{{ displayTaskStatus }}</span>
					<span v-if="showStatusPulse" class="chat-status-dots" aria-hidden="true">
						<span>.</span>
						<span>.</span>
						<span>.</span>
					</span>
				</div>

				<div v-if="contextUsage" class="chat-dock-context-usage">
					<div class="chat-dock-context-usage-bar">
						<div
							class="chat-dock-context-usage-fill"
							:style="{ width: `${contextUsage.usage}%` }"
							:class="{ warning: contextUsage.usage >= 80, truncated: contextUsage.truncated }"
						/>
					</div>
					<div class="chat-dock-context-usage-text">
						{{ formatTokens(contextUsage.tokenCount) }} / {{ formatTokens(contextUsage.budget) }}
						<span v-if="contextUsage.truncated" class="chat-dock-context-usage-truncated">{{ t('aichat.dock.truncated') }}</span>
					</div>
				</div>

				<textarea
					ref="inputRef"
					:value="modelValue"
					class="chat-dock-input"
					rows="2"
					:placeholder="t('aichat.dock.inputPlaceholder')"
					:disabled="sending"
					@focus="emit('focus-input')"
					@input="onInput"
					@keydown.enter.exact.prevent="onEnterSend"
					@keydown.enter.shift.exact.stop
					@keydown.exact="onInputKeyDown"
					@keydown.escape="onEscapeKeyDown"
				/>

				<div
					v-if="showSkillPicker"
					class="chat-dock-skill-picker"
					ref="skillPickerRef"
				>
					<div class="chat-dock-skill-picker-header">{{ t('aichat.dock.skillPickerTitle') }}</div>
					<div class="chat-dock-skill-picker-list">
						<div
							v-for="skill in availableSkills"
							:key="skill.id"
							class="chat-dock-skill-picker-item"
							:class="{ active: selectedSkillIndex === availableSkills.indexOf(skill) }"
							@click="onSkillSelect(skill)"
							@mouseenter="selectedSkillIndex = availableSkills.indexOf(skill)"
						>
							<div class="chat-dock-skill-picker-item-icon">{{ skill.icon }}</div>
							<div class="chat-dock-skill-picker-item-info">
								<div class="chat-dock-skill-picker-item-name">{{ skill.name }}</div>
								<div class="chat-dock-skill-picker-item-desc">{{ skill.description }}</div>
							</div>
						</div>
					</div>
				</div>

				<div class="chat-dock-footer">
					<div class="chat-dock-footer-left">
						<div class="chat-dock-toolbar-item chat-dock-toolbar-item-agent-backend">
							<select
								class="chat-dock-toolbar-select agent-backend-select"
								:value="agentBackend"
								@change="onAgentBackendChange"
							>
								<option value="dvsagent">DVSAgent</option>
								<option value="codex">Codex</option>
								<option value="copilot">Copilot</option>
							</select>
						</div>
						<div class="chat-dock-toolbar-item chat-dock-toolbar-item-model">
							<div class="chat-dock-toolbar-label">{{ t('aichat.dock.labelModel') }}</div>
							<select
								class="chat-dock-toolbar-select"
								:value="activeModelId"
								:disabled="sending || !modelOptions.length"
								@change="onAgentModelSelectionChange"
							>
								<option v-if="!modelOptions.length" value="">{{ t('aichat.dock.noModelAvailable') }}</option>
								<template v-if="agentBackend === 'dvsagent'">
									<optgroup
										v-for="group in dvsAgentModelGroups"
										:key="group.label"
										:label="group.label"
									>
										<option v-for="model in group.models" :key="model.id" :value="model.id">
											{{ model.label }}
										</option>
									</optgroup>
								</template>
								<template v-else>
									<option v-for="model in modelOptions" :key="model.id" :value="model.id">
										{{ model.label }}
									</option>
								</template>
							</select>
						</div>
						<div class="chat-dock-toolbar-item chat-dock-toolbar-item-thinking">
							<div class="chat-dock-toolbar-label">{{ t('aichat.dock.labelThinking') }}</div>
							<select
								class="chat-dock-toolbar-select thinking-select"
								:value="thinkingEffort"
								:disabled="sending || !supportsThinking"
								@change="onThinkingEffortChange"
							>
								<option v-if="!supportsThinking" value="disabled">{{ t('aichat.dock.thinkingNotSupported') }}</option>
								<option value="disabled">{{ t('aichat.dock.thinkingDisabled') }}</option>
								<option value="low">{{ t('aichat.dock.thinkingLow') }}</option>
								<option value="medium">{{ t('aichat.dock.thinkingMedium') }}</option>
								<option value="high">{{ t('aichat.dock.thinkingHigh') }}</option>
							</select>
						</div>
					</div>

					<button
						class="chat-dock-send"
						:class="{ stopping: isStoppingState }"
						type="button"
						:disabled="sendButtonDisabled"
						@click="onClickSend"
					>
						{{ sendButtonLabel }}
					</button>

					<button
						class="chat-dock-upload"
						type="button"
						:title="t('aichat.dock.uploadFile')"
						:disabled="sending"
						@click="onUploadClick"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M12 15v-6m0 0l-3 3m3-3l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								fill="none"
							/>
						</svg>
					</button>

					<input
						ref="fileInputRef"
						type="file"
						class="chat-dock-file-input"
						multiple
						accept="image/*,video/*"
						@change="onFileSelect"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import SeedanceVideoForm, { type SeedanceVideoFormConfig } from './SeedanceVideoForm.vue'
import MeshyImageForm, { type MeshyImageConfig } from './MeshyImageForm.vue'
import ThinkingBlock from '../AIChat/ThinkingBlock.vue'
import ToolCallCard from '../AIChat/ToolCallCard.vue'
import NodeLocationCard from '../AIChat/NodeLocationCard.vue'
import UserChoicePanel from '../AIChat/UserChoicePanel.vue'
import AgentToolsPanel from '../AIChat/AgentToolsPanel.vue'
import {
	CHAT_API_SOURCE_OPTIONS,
	CHAT_MODEL_CATALOG,
	getChatModelOptions,
	legacyModelFromNeedType,
	needTypeFromLegacyModel,
	type ChatApiSource,
	type ChatLegacyModelKey,
	type ChatModelCatalogItem,
	type ChatNeedType
} from '../../ai/models/chatModels'

const { t } = useI18n()

export type ToolCallInfo = {
	id: string
	name: string
	status: 'pending' | 'running' | 'completed' | 'error'
	args?: Record<string, unknown>
	result?: unknown
	error?: string
}

export type BottomChatMessage = {
	id: string
	role: 'user' | 'assistant' | 'system'
	content: string
	thinkingContent?: string
	toolCalls?: ToolCallInfo[]
	userChoices?: string[]
	userChoiceSelected?: number | null
}

export type NanoBananaConfig = {
	aspectRatio: string
	usePro?: boolean
	quantity?: 1 | 2 | 3 | 4
	imageModel?:
		| 'gemini-2.5-flash-image'
		| 'gemini-3.1-flash-image-preview'
		| 'gemini-3-pro-image-preview'
		| 'doubao-seedream-4-5-251128'
		| 'doubao-seedream-4-0-250828'
		| 'doubao-seedream-5-0-260128'
		| 'jimeng-image-3.0'
		| 'jimeng-image-4.0'
		| 'meshy'
	meshyImageAiModel?: string
	meshyAspectRatio?: string
	meshyPoseMode?: string
	meshyGenerateMultiView?: boolean
	meshyOutputImageCount?: number
	meshyNegativePrompt?: string
	meshySeed?: number
}

export type SeedanceConfig = SeedanceVideoFormConfig

export type NanoBananaRefAnchor = {
	id: string
	label: string
	connected?: boolean
	connectedFrom?: string
}

export type LocalExecSource = 'copilot-cli' | 'legacy-codex'

export type AgentBackendType = 'dvsagent' | 'codex' | 'copilot'
export type AgentConversationMode = 'agent' | 'ask' | 'plan'

export type LocalExecSessionItem = {
	id: string
	title: string
	status?: string
	modelName?: string
	source?: LocalExecSource
}

export type LocalExecFlowEvent = {
	id: string
	kind: string
	title: string
	detail?: string
	status?: 'pending' | 'completed' | 'failed'
	messageId?: string
	approvalRequestId?: string
	source?: LocalExecSource
	payload?: Record<string, unknown> | null
}

export type CodexSessionItem = LocalExecSessionItem
export type CodexFlowEvent = LocalExecFlowEvent

const props = defineProps<{
		modelValue: string
		messages?: BottomChatMessage[]
		sending?: boolean
		runState?: 'idle' | 'sending' | 'stopping' | 'error'
		collapsed?: boolean
		taskStatus?: string
		placement?: 'bottom' | 'right-drawer'
		agentBackend?: AgentBackendType
		agentMode?: AgentConversationMode
		localExecStreamMode?: 'real' | 'mock'
		agentWorkingDirectory?: string
		modelKey?: ChatLegacyModelKey
		nanoPreviewUrls?: string[]
		nanoPreviewFallbackUrls?: string[]
		nanoPreviewSourcePaths?: string[]
		nanoPreviewLoadingStates?: boolean[]
		nanoPreviewDownloadStatuses?: string[]
		nanoPreviewDownloadProgresses?: number[]
		nanoPreviewLocalReadyStates?: boolean[]
		nanoPreviewUrl?: string
		nanoStatus?: string
		nanoDetail?: string
		nanoBilling?: string
		nanoModelUsed?: string

		nanoAnchorNodeId?: string
		nanoRefAnchors?: NanoBananaRefAnchor[]
		nanoHoverAnchorId?: string | null
		codexSessions?: CodexSessionItem[]
		codexActiveSessionId?: string
		codexFlowEvents?: CodexFlowEvent[]
		thinkingEffort?: 'disabled' | 'low' | 'medium' | 'high'
		contextUsage?: { tokenCount: number; budget: number; usage: number; truncated?: boolean } | null
	}>()

const emit = defineEmits<{
	(e: 'update:modelValue', v: string): void
	(e: 'send'): void
	(e: 'stop'): void
	(e: 'request-expand'): void
	(e: 'request-collapse'): void
	(e: 'focus-input'): void
	(e: 'update:agentBackend', v: AgentBackendType): void
	(e: 'update:agentMode', v: AgentConversationMode): void
	(e: 'update:localExecStreamMode', v: 'real' | 'mock'): void
	(e: 'update:modelKey', v: ChatLegacyModelKey): void
	(e: 'update:activeModelId', v: string): void
	(e: 'nanobanana-generate', v: { prompt: string; config: NanoBananaConfig }): void
	(e: 'seedance-generate', v: { prompt: string; config: SeedanceConfig }): void
	(e: 'workflow-end-link', v: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'codex-create-session'): void
	(e: 'codex-select-session', sessionId: string): void
	(e: 'codex-delete-session', sessionId: string): void
	(e: 'codex-rename-session', v: { sessionId: string; title: string }): void
	(e: 'codex-approval', v: { messageId: string; decision: 'accept' | 'decline' }): void
	(e: 'user-choice-select', v: { messageId: string; choiceIndex: number; choiceText: string }): void
	(e: 'layout-changed'): void
	(e: 'update:thinkingEffort', v: 'disabled' | 'low' | 'medium' | 'high'): void
	(e: 'file-upload', files: Array<{ name: string; type: string; size: number; dataUrl?: string }>): void
	(e: 'locate-node', nodeId: string): void
	(
		e: 'safe-area-changed',
		rect: { width: number; height: number; right: number; top: number }
	): void
}>()

const historyExpanded = ref(false)
const historyBodyRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const skillPickerRef = ref<HTMLElement | null>(null)
const chatListRef = ref<HTMLElement | null>(null)
const pendingFocus = ref(false)

const showSkillPicker = ref(false)
const selectedSkillIndex = ref(0)

const availableSkills = computed(() => [
	{ id: 'scene-understand', name: t('aichat.dock.skillSceneUnderstand'), description: t('aichat.dock.skillSceneUnderstandDesc'), icon: '🖼️' },
	{ id: 'scene-lighting', name: t('aichat.dock.skillSceneLighting'), description: t('aichat.dock.skillSceneLightingDesc'), icon: '💡' },
	{ id: 'node-create', name: t('aichat.dock.skillNodeCreate'), description: t('aichat.dock.skillNodeCreateDesc'), icon: '➕' },
	{ id: 'node-config', name: t('aichat.dock.skillNodeConfig'), description: t('aichat.dock.skillNodeConfigDesc'), icon: '⚙️' },
	{ id: 'workflow-plan', name: t('aichat.dock.skillWorkflowPlan'), description: t('aichat.dock.skillWorkflowPlanDesc'), icon: '📋' },
])

const dockRef = ref<HTMLElement | null>(null)
const dockLeftPx = ref<number | null>(null)
let dragCleanup: (() => void) | null = null

function formatTokens(tokens: number): string {
	if (tokens >= 1000000) {
		return (tokens / 1000000).toFixed(1) + 'M'
	}
	if (tokens >= 1000) {
		return (tokens / 1000).toFixed(1) + 'K'
	}
	return String(tokens)
}

const clampDockLeft = (left: number) => {
	const w = window.innerWidth || 0
	const rect = dockRef.value?.getBoundingClientRect()
	const half = rect ? rect.width / 2 : 460
	const min = Math.max(half, 20)
	const max = Math.max(min, w - half)
	return Math.max(min, Math.min(max, left))
}

const dockPlacement = computed(() => (props.placement ?? 'bottom') as 'bottom' | 'right-drawer')
const isRightDrawer = computed(() => dockPlacement.value === 'right-drawer')

const dockStyle = computed(() => {
	if (isRightDrawer.value) return {} as Record<string, string>
	if (dockLeftPx.value == null) return {} as Record<string, string>
	return {
		left: `${dockLeftPx.value}px`,
		transform: 'translateX(-50%)'
	} as Record<string, string>
})

const MODEL_CATALOG = CHAT_MODEL_CATALOG
const apiSourceOptions = CHAT_API_SOURCE_OPTIONS

let layoutRaf = 0
const emitLayoutChanged = () => {
	if (layoutRaf) return
	layoutRaf = window.requestAnimationFrame(() => {
		layoutRaf = 0
		emit('layout-changed')
		if (dockPlacement.value === 'right-drawer' && dockRef.value) {
			if (props.collapsed) {
				emit('safe-area-changed', {
					width: 0,
					height: 0,
					right: 0,
					top: 0
				})
				return
			}
			const rect = dockRef.value.getBoundingClientRect()
			emit('safe-area-changed', {
				width: rect.width,
				height: rect.height,
				right: window.innerWidth - rect.right,
				top: rect.top
			})
		}
	})
}

const visibleApiSourceOptions = computed(() =>
	apiSourceOptions.filter((item) => item.value === 'local-exec')
)

const modelKey = computed(() => (props.modelKey ?? 'deepseek') as ChatLegacyModelKey)

const isAgentMode = computed(() => true)
const isRegularMode = computed(() => false)

const agentBackend = computed<AgentBackendType>(() => {
	const backend = String(props.agentBackend || '')
		.trim()
		.toLowerCase()
	if (backend === 'dvsagent' || backend === 'codex' || backend === 'copilot') {
		return backend as AgentBackendType
	}
	return 'dvsagent'
})

const agentWorkingDirectory = computed(() => {
	const text = String(props.agentWorkingDirectory || '').trim()
	if (text) return text
	return t('aichat.dock.currentProject')
})

const localExecStreamMode = computed<'real' | 'mock'>(() => {
	const mode = String(props.localExecStreamMode || '')
		.trim()
		.toLowerCase()
	return mode === 'mock' ? 'mock' : 'real'
})

const runState = computed<'idle' | 'sending' | 'stopping' | 'error'>(() => {
	const text = String(props.runState || '')
		.trim()
		.toLowerCase()
	if (text === 'sending' || text === 'stopping' || text === 'error') return text
	return 'idle'
})

const isStoppingState = computed(() => runState.value === 'stopping')
const isSendingState = computed(
	() => runState.value === 'sending' || (runState.value === 'idle' && !!props.sending)
)
const showStatusPulse = computed(() => isSendingState.value || isStoppingState.value)

const displayTaskStatus = computed(() => {
	const status = String(props.taskStatus || '').trim()
	if (status) return status
	if (isStoppingState.value) return t('aichat.dock.statusStopping')
	if (isSendingState.value) return t('aichat.dock.statusGenerating')
	if (runState.value === 'error') return t('aichat.dock.statusError')
	return t('aichat.dock.statusReady')
})

const sendButtonDisabled = computed(() => {
	if (isStoppingState.value) return true
	if (isSendingState.value) return false
	return !!props.sending
})

const sendButtonLabel = computed(() => {
	if (isStoppingState.value) return t('aichat.dock.buttonStopping')
	if (isSendingState.value) return t('aichat.dock.buttonStop')
	return t('aichat.dock.buttonSend')
})

const agentMode = computed<AgentConversationMode>(() => {
	const mode = String(props.agentMode || '')
		.trim()
		.toLowerCase()
	if (mode === 'ask' || mode === 'plan') return mode
	return 'agent'
})

const needType = ref<ChatNeedType>(needTypeFromLegacyModel(modelKey.value))
const apiSource = ref<ChatApiSource>('all')

const isVisualGenMode = computed(() => false)

const nanoConfig = ref<NanoBananaConfig>({
	aspectRatio: '1:1',
	usePro: false,
	quantity: 1,
	imageModel: 'gemini-2.5-flash-image'
})

const seedanceConfig = ref<SeedanceConfig>({
	model: 'doubao-seedance-2-0-260128',
	ratio: 'adaptive',
	resolution: '',
	refMode: 'auto',
	useFrames: false,
	duration: 5,
	frames: '',
	seed: '',
	templateId: '',
	cameraStrength: 'medium',
	generateAudio: false,
	watermark: false,
	cameraFixed: false,
	draft: false,
	returnLastFrame: false,
	serviceTier: '',
	executionExpiresAfter: ''
})

const meshyImageConfig = ref<MeshyImageConfig>({
	prompt: '',
	negativePrompt: '',
	aiModel: 'nano-banana',
	outputImageCount: 1,
	generateMultiView: false,
	aspectRatio: '1:1',
	poseMode: '',
	seed: 0
})

const onSeedanceConfigChange = (nextConfig: SeedanceConfig) => {
	seedanceConfig.value = { ...nextConfig }
}

const onMeshyImageConfigChange = (nextConfig: MeshyImageConfig) => {
	meshyImageConfig.value = { ...nextConfig }
}

const textModel = ref('auto')

const modelOptions = computed(() => {
	if (props.agentBackend === 'dvsagent') {
		const allTextModels = CHAT_MODEL_CATALOG.filter(
			(m) => m.needType === 'text' && m.apiSource !== 'local-exec'
		)
		return allTextModels
	}
	return getChatModelOptions('text', 'local-exec')
})

const dvsAgentModelGroups = computed(() => {
	const groups: Array<{ label: string; models: ChatModelCatalogItem[] }> = []
	const sourceToLabel: Record<string, string> = {
		deepseek: t('aichat.dock.sourceDeepSeek'),
		bytedance: t('aichat.dock.sourceByteDance'),
		gemini: t('aichat.dock.sourceGemini'),
		'local-exec': t('aichat.dock.sourceCopilotCli')
	}
	const sources = ['deepseek', 'bytedance', 'gemini']
	for (const src of sources) {
		const models = modelOptions.value.filter((m) => m.apiSource === src)
		if (models.length) {
			const sorted = [...models].sort((a, b) => {
				if (a.recommended && !b.recommended) return -1
				if (!a.recommended && b.recommended) return 1
				return a.label.localeCompare(b.label)
			})
			groups.push({ label: sourceToLabel[src] || src, models: sorted })
		}
	}
	return groups
})

const activeModelId = computed(() => String(textModel.value || '').trim())

const activeModelOption = computed(() => {
	const id = activeModelId.value
	return modelOptions.value.find((m) => m.id === id) ?? null
})

const thinkingEffort = computed<'disabled' | 'low' | 'medium' | 'high'>(() => {
	const effort = String(props.thinkingEffort || '').trim().toLowerCase()
	if (effort === 'disabled' || effort === 'low' || effort === 'high') {
		return effort
	}
	return 'medium'
})

const supportsThinking = computed(() => {
	if (agentBackend.value !== 'dvsagent') return false
	const modelId = activeModelId.value.toLowerCase()
	if (!modelId.includes('doubao-seed')) return false
	const noThinking = ['seedream', 'seedance', 'seed-translation', 'seed-code', 'seed-character']
	return !noThinking.some((m) => modelId.includes(m))
})

watch(
	() => activeModelId.value,
	(v) => {
		emit('update:activeModelId', String(v || '').trim())
	},
	{ immediate: true }
)

watch(
	() => supportsThinking.value,
	(supports) => {
		if (!supports) {
			emit('update:thinkingEffort', 'disabled')
		}
	},
	{ immediate: true }
)

const getDefaultModelId = () => {
	const list = modelOptions.value
	if (!list.length) return ''
	if (agentBackend.value === 'dvsagent') {
		const doubaoEvolving = list.find((m) => m.id === 'doubao-seed-evolving')
		if (doubaoEvolving) return doubaoEvolving.id
		const recommended = list.find((m) => m.recommended && m.apiSource === 'bytedance')
		if (recommended) return recommended.id
	}
	return list[0].id
}

watch(
	() => agentBackend.value,
	() => {
		const list = modelOptions.value
		if (!list.length) return
		if (!list.some((m) => m.id === activeModelId.value)) {
			textModel.value = getDefaultModelId()
		}
	},
	{ immediate: true }
)

const applyModelSelection = (modelId: string) => {
	const id = String(modelId || '').trim()
	if (!id) return
	textModel.value = id
}

const normalizeModelSelection = () => {
	needType.value = 'text'
	if (apiSource.value !== 'local-exec') apiSource.value = 'local-exec'
	const list = modelOptions.value
	if (!list.length) return
	if (!list.some((m) => m.id === activeModelId.value)) {
		textModel.value = getDefaultModelId()
	}
}

const normalizedNanoQuantity = computed(() => {
	if (modelKey.value === 'seedance') return 1
	const n = Number(nanoConfig.value.quantity ?? 1)
	if (!Number.isFinite(n)) return 1
	return Math.max(1, Math.min(4, Math.floor(n)))
})

const nanoPreviewUrls = computed(() => {
	const list = Array.isArray(props.nanoPreviewUrls)
		? props.nanoPreviewUrls.map((v) => String(v ?? '').trim())
		: []
	if (list.length) return list
	const single = String(props.nanoPreviewUrl ?? '').trim()
	return single ? [single] : []
})

const nanoPreviewSlots = computed(() => {
	const count = normalizedNanoQuantity.value
	const urls = nanoPreviewUrls.value
	const fallbackUrls = Array.isArray(props.nanoPreviewFallbackUrls)
		? props.nanoPreviewFallbackUrls.map((v) => String(v ?? '').trim())
		: []
	const sourcePaths = Array.isArray(props.nanoPreviewSourcePaths)
		? props.nanoPreviewSourcePaths.map((v) => String(v ?? '').trim())
		: []
	const loadingStates = Array.isArray(props.nanoPreviewLoadingStates)
		? props.nanoPreviewLoadingStates.map((v) => !!v)
		: []
	const downloadStatuses = Array.isArray(props.nanoPreviewDownloadStatuses)
		? props.nanoPreviewDownloadStatuses.map((v) => String(v ?? '').trim())
		: []
	const downloadProgresses = Array.isArray(props.nanoPreviewDownloadProgresses)
		? props.nanoPreviewDownloadProgresses.map((v) => {
				const n = Number(v ?? 0)
				return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0
			})
		: []
	const localReadyStates = Array.isArray(props.nanoPreviewLocalReadyStates)
		? props.nanoPreviewLocalReadyStates.map((v) => !!v)
		: []
	return Array.from({ length: count }, (_, idx) => ({
		url: urls[idx] || '',
		fallbackUrl: fallbackUrls[idx] || '',
		sourcePath: sourcePaths[idx] || '',
		loading: !!loadingStates[idx],
		downloadStatus: downloadStatuses[idx] || '',
		downloadProgress: downloadProgresses[idx] || 0,
		localReady: modelKey.value === 'seedance' ? !!localReadyStates[idx] : true
	}))
})

const nanoProSelected = computed(
	() => String(nanoConfig.value.imageModel || '').trim() === 'gemini-3-pro-image-preview'
)

const nanoInterfaceLabel = computed(() => {
	if (modelKey.value === 'seedance') return 'Seedance'
	const model = String(nanoConfig.value.imageModel || '').trim()
	if (model === 'gemini-3-pro-image-preview') return 'NanoBanana Pro'
	if (model === 'gemini-3.1-flash-image-preview') return 'NanoBanana 2'
	if (model === 'gemini-2.5-flash-image') return 'NanoBanana'
	if (model === 'doubao-seedream-4-5-251128') return 'Seedream 4.5'
	if (model === 'doubao-seedream-4-0-250828') return 'Seedream 4.0'
	if (model === 'jimeng-image-3.0') return t('aichat.dock.modelJimengImage3')
	if (model === 'jimeng-image-4.0') return t('aichat.dock.modelJimengImage4')
	return 'Seedream 5.0'
})

const nanoModelTag = computed(() => {
	if (modelKey.value === 'seedance') {
		const model = String(props.nanoModelUsed || '').trim()
		if (!model) return ''
		return model
	}
	const model = String(props.nanoModelUsed || '').trim()
	if (!model) return ''
	if (model === 'gemini-3-pro-image-preview') return 'NanoBanana Pro'
	if (model === 'gemini-3.1-flash-image-preview') return 'NanoBanana 2'
	if (model === 'gemini-2.5-flash-image') return 'NanoBanana'
	if (model === 'doubao-seedream-4-5-251128') return 'Seedream 4.5'
	if (model === 'doubao-seedream-4-0-250828') return 'Seedream 4.0'
	if (model === 'doubao-seedream-5-0-260128') return 'Seedream 5.0'
	if (model === 'jimeng-image-3.0') return t('aichat.dock.modelJimengImage3')
	if (model === 'jimeng-image-4.0') return t('aichat.dock.modelJimengImage4')
	if (model === 'jimeng-video-3.0') return t('aichat.dock.modelJimengVideo3')
	if (model === 'jimeng-video-3.0-pro') return t('aichat.dock.modelJimengVideo3Pro')
	return model
})

const nanoStartAt = ref<number | null>(null)
const nanoElapsedSec = ref(0)
let nanoTimer: number | null = null

const nanoElapsedText = computed(() => {
	if (!nanoStartAt.value) return '—'
	const s = Math.max(0, Math.floor(nanoElapsedSec.value))
	const mm = Math.floor(s / 60)
	const ss = s % 60
	return mm > 0 ? `${mm}m${String(ss).padStart(2, '0')}s` : `${ss}s`
})

const nanoConnectedCount = computed(() => {
	const list = Array.isArray(props.nanoRefAnchors) ? props.nanoRefAnchors : []
	return list.filter((a) => !!a?.connected).length
})

const nanoEstimateText = computed(() => {
	const estimateUnit = t('aichat.dock.estimateUnit')
	if (modelKey.value === 'seedance') {
		const secBase = seedanceConfig.value.useFrames
			? Math.max(2, Math.floor((Number(seedanceConfig.value.frames || 121) || 121) / 24))
			: Math.max(2, Number(seedanceConfig.value.duration || 5) || 5)
		const sec = Math.max(8, secBase * 3)
		return `${sec}-${sec + 24}s${estimateUnit}`
	}
	const n = nanoConnectedCount.value
	const low = 8 + n * 2
	const high = 25 + n * 4
	return `${low}-${high}s${estimateUnit}`
})

const onDockDragStart = (ev: PointerEvent) => {
	if (isRightDrawer.value) return
	ev.stopPropagation()
	const target = ev.target as HTMLElement | null
	// Don't hijack clicks on interactive controls.
	if (target?.closest('button,select,input,textarea,a')) return
	if (!dockRef.value) return

	ev.preventDefault()

	const handle = ev.currentTarget as HTMLElement | null
	if (!handle) return

	try {
		handle.setPointerCapture(ev.pointerId)
	} catch {
		// ignore
	}

	if (dockLeftPx.value == null) {
		dockLeftPx.value = window.innerWidth / 2
	}
	const startX = ev.clientX
	const startLeft = dockLeftPx.value ?? window.innerWidth / 2

	const onMove = (e: PointerEvent) => {
		const dx = e.clientX - startX
		dockLeftPx.value = clampDockLeft(startLeft + dx)
		emitLayoutChanged()
	}
	const onUp = () => {
		try {
			handle.releasePointerCapture(ev.pointerId)
		} catch {
			// ignore
		}
		if (dragCleanup) dragCleanup()
		dragCleanup = null
	}

	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp, { once: true })
	window.addEventListener('pointercancel', onUp, { once: true })
	dragCleanup = () => {
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
	}
}

const toggleHistory = () => {
	historyExpanded.value = !historyExpanded.value
	void nextTick().then(() => emitLayoutChanged())
}

const scrollHistoryToBottom = async () => {
	await nextTick()
	const el = historyBodyRef.value
	if (!el) return
	el.scrollTop = el.scrollHeight
}

watch(
	() => props.messages?.length ?? 0,
	() => {
		void scrollHistoryToBottom()
	}
)

watch(
	() => props.modelKey,
	() => {
		normalizeModelSelection()
		void scrollHistoryToBottom()
		void nextTick().then(() => emitLayoutChanged())
	}
)

watch(
	() => [needType.value, apiSource.value] as const,
	() => {
		normalizeModelSelection()
	},
	{ immediate: true }
)

watch(
	() => !!props.collapsed,
	(v) => {
		void nextTick().then(() => emitLayoutChanged())
		if (v) return
		if (!pendingFocus.value) return
		pendingFocus.value = false
		void nextTick().then(() => inputRef.value?.focus())
	}
)

const requestExpand = () => {
	pendingFocus.value = true
	emit('request-expand')
	void nextTick().then(() => emitLayoutChanged())
}

const requestCollapse = () => {
	emit('request-collapse')
	void nextTick().then(() => emitLayoutChanged())
}

const onInput = (e: Event) => {
	const v = (e.target as HTMLTextAreaElement).value
	emit('update:modelValue', v)
}

const onNeedTypeChange = (e: Event) => {
	if (!isRegularMode.value) return
	const v = String((e.target as HTMLSelectElement).value || 'text')
	const nextNeedType = v === 'image' ? 'image' : v === 'video' ? 'video' : 'text'
	needType.value = nextNeedType
	const legacy = legacyModelFromNeedType(nextNeedType)
	emit('update:modelKey', legacy)
}

const onApiSourceChange = (e: Event) => {
	if (!isRegularMode.value) return
	const v = String((e.target as HTMLSelectElement).value || 'all')
	apiSource.value =
		v === 'deepseek'
			? 'deepseek'
			: v === 'gemini'
				? 'gemini'
				: v === 'bytedance'
					? 'bytedance'
					: 'all'
	normalizeModelSelection()
}

const onModelSelectionChange = (e: Event) => {
	if (!isRegularMode.value) return
	const id = String((e.target as HTMLSelectElement).value || '').trim()
	if (!id) return
	applyModelSelection(id)
	const selected = modelOptions.value.find((m) => m.id === id)
	if (selected && selected.legacyModelKey !== modelKey.value) {
		emit('update:modelKey', selected.legacyModelKey)
	}
}

const onAgentModelSelectionChange = (e: Event) => {
	const id = String((e.target as HTMLSelectElement).value || '').trim()
	if (!id) return
	textModel.value = id
	emit('update:modelKey', 'codex')
}

const onAgentBackendChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value || '')
		.trim()
		.toLowerCase()
	let backend: AgentBackendType = 'dvsagent'
	if (value === 'dvsagent' || value === 'codex' || value === 'copilot') {
		backend = value as AgentBackendType
	}
	emit('update:agentBackend', backend)
}

const onThinkingEffortChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value || '')
		.trim()
		.toLowerCase()
	let effort: 'disabled' | 'low' | 'medium' | 'high' = 'medium'
	if (value === 'disabled' || value === 'low' || value === 'high') {
		effort = value
	}
	emit('update:thinkingEffort', effort)
}

const onLocalExecStreamModeChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value || '')
		.trim()
		.toLowerCase()
	emit('update:localExecStreamMode', value === 'mock' ? 'mock' : 'real')
}

const onAgentModeChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value || '')
		.trim()
		.toLowerCase()
	emit('update:agentMode', value === 'ask' || value === 'plan' ? value : 'agent')
}

const emitGenerate = () => {
	const prompt = String(props.modelValue || '').trim()
	if (!prompt) return
	if (!activeModelOption.value) return
	if (modelKey.value === 'seedance') {
		emit('seedance-generate', {
			prompt,
			config: { ...seedanceConfig.value }
		})
		return
	}
	// Meshy 图片生成分支
	if (modelKey.value === 'meshy') {
		const quantity = normalizedNanoQuantity.value as 1 | 2 | 3 | 4
		emit('nanobanana-generate', {
			prompt,
			config: {
				...nanoConfig.value,
				imageModel: 'meshy',
				meshyImageAiModel: meshyImageConfig.value.aiModel || 'nano-banana',
				meshyAspectRatio: meshyImageConfig.value.aspectRatio || '1:1',
				meshyNegativePrompt: meshyImageConfig.value.negativePrompt || '',
				meshyPoseMode: meshyImageConfig.value.poseMode || '',
				meshyGenerateMultiView: meshyImageConfig.value.generateMultiView || false,
				meshyOutputImageCount: meshyImageConfig.value.outputImageCount || 1,
				meshySeed: meshyImageConfig.value.seed && meshyImageConfig.value.seed > 0 ? meshyImageConfig.value.seed : -1,
				quantity
			}
		})
		return
	}
	const selected = String(nanoConfig.value.imageModel || '').trim()
	const imageModel =
		selected === 'gemini-2.5-flash-image'
			? 'gemini-2.5-flash-image'
			: selected === 'gemini-3.1-flash-image-preview'
				? 'gemini-3.1-flash-image-preview'
				: selected === 'gemini-3-pro-image-preview'
					? 'gemini-3-pro-image-preview'
					: selected === 'doubao-seedream-4-5-251128'
						? 'doubao-seedream-4-5-251128'
						: selected === 'doubao-seedream-4-0-250828'
							? 'doubao-seedream-4-0-250828'
							: selected === 'jimeng-image-3.0'
								? 'jimeng-image-3.0'
								: selected === 'jimeng-image-4.0'
									? 'jimeng-image-4.0'
									: 'doubao-seedream-4-5-251128'
	const usePro = imageModel === 'gemini-3-pro-image-preview'
	const quantity = normalizedNanoQuantity.value as 1 | 2 | 3 | 4
	emit('nanobanana-generate', {
		prompt,
		config: { ...nanoConfig.value, imageModel, usePro, quantity }
	})
}

const onEnterSend = () => {
	if (isSendingState.value) {
		if (!isStoppingState.value) emit('stop')
		return
	}
	emit('send')
}

const onClickSend = () => {
	if (isSendingState.value) {
		if (!isStoppingState.value) emit('stop')
		return
	}
	emit('send')
}

const onInputKeyDown = (e: KeyboardEvent) => {
	if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
		if (props.modelValue.trim() === '') {
			e.preventDefault()
			showSkillPicker.value = true
			selectedSkillIndex.value = 0
		}
	}
}

const getToolResultField = (result: unknown, field: string): string => {
	if (!result || typeof result !== 'object') return ''
	return String((result as Record<string, unknown>)[field] ?? '')
}

const isCreateNodeToolResult = (tc: { name: string; status: string; result?: unknown }): boolean => {
	return tc.name === 'create_node' && tc.status === 'completed' && !!tc.result && typeof tc.result === 'object' && 'nodeId' in (tc.result as object)
}

const onLocateNode = (nodeId: string) => {
	emit('locate-node', nodeId)
}

watch(
	() => props.messages,
	() => {
		nextTick(() => {
			const el = historyBodyRef.value
			if (el) {
				el.scrollTo({
					top: el.scrollHeight,
					behavior: 'smooth'
				})
			}
		})
	},
	{ deep: true }
)

const onEscapeKeyDown = () => {
	if (showSkillPicker.value) {
		showSkillPicker.value = false
	}
}

const onSkillSelect = (skill: { id: string; name: string; description: string; icon: string }) => {
	const skillPrompt = `[${skill.name}] ${skill.description}\n\n`
	emit('update:modelValue', skillPrompt)
	showSkillPicker.value = false
	inputRef.value?.focus()
}

const onUploadClick = () => {
	fileInputRef.value?.click()
}

const onFileSelect = (event: Event) => {
	const target = event.target as HTMLInputElement
	const files = target.files
	if (!files || files.length === 0) return

	const uploadedFiles: Array<{ name: string; type: string; size: number; dataUrl?: string }> = []

	for (let i = 0; i < files.length; i++) {
		const file = files[i]
		const fileType = file.type.split('/')[0]

		if (fileType !== 'image' && fileType !== 'video') {
			continue
		}

		uploadedFiles.push({
			name: file.name,
			type: file.type,
			size: file.size
		})

		if (fileType === 'image') {
			const reader = new FileReader()
			reader.onload = (e) => {
				const idx = uploadedFiles.findIndex((f) => f.name === file.name)
				if (idx !== -1) {
					uploadedFiles[idx].dataUrl = String(e.target?.result || '')
				}
			}
			reader.readAsDataURL(file)
		}
	}

	if (uploadedFiles.length > 0) {
		emit('file-upload', uploadedFiles)
	}

	target.value = ''
}

const visualPanelTitle = computed(() =>
	modelKey.value === 'seedance' ? t('aichat.dock.seedanceGenerate') : t('aichat.dock.imageGenerate')
)

const onNanoPreviewDragStart = (
	e: DragEvent,
	inputUrl?: string,
	kind: 'image' | 'video' = 'image',
	fallbackUrl?: string,
	sourcePath?: string,
	localUrl?: string,
	remoteUrl?: string,
	downloadStatus?: string,
	localReady?: boolean
) => {
	const url = String(inputUrl || '').trim()
	const backupUrl = String(fallbackUrl || '').trim()
	const localSourcePath = String(sourcePath || '').trim()
	const localVideoUrl = String(localUrl || '').trim()
	const remoteVideoUrl = String(remoteUrl || '').trim()
	const statusText = String(downloadStatus || '').trim()
	const isLocalReady = !!localReady
	if (kind === 'video' && (!isLocalReady || !localVideoUrl)) {
		e.preventDefault()
		return
	}
	if (!url) return
	try {
		e.dataTransfer?.setData('application/x-dweb-nanobanana-preview', url)
		e.dataTransfer?.setData(
			'application/x-dweb-nanobanana-preview-meta',
			JSON.stringify({
				url,
				kind,
				fallbackUrl: backupUrl || undefined,
				sourcePath: localSourcePath || undefined,
				localUrl: localVideoUrl || undefined,
				remoteUrl: remoteVideoUrl || undefined,
				downloadStatus: statusText || undefined,
				localReady: isLocalReady
			})
		)
		e.dataTransfer?.setData('text/uri-list', url)
		e.dataTransfer?.setData('text/plain', url)
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
	} catch {
		// ignore
	}
}

const nanoAnchorNodeId = computed(() => String(props.nanoAnchorNodeId || '').trim())
const nanoRefAnchors = computed(
	() => (Array.isArray(props.nanoRefAnchors) ? props.nanoRefAnchors : []) as NanoBananaRefAnchor[]
)
const nanoHoverAnchorId = computed(() =>
	props.nanoHoverAnchorId == null ? null : String(props.nanoHoverAnchorId)
)

const codexSessions = computed(() =>
	Array.isArray(props.codexSessions) ? props.codexSessions : []
)
const codexFlowEvents = computed(() =>
	Array.isArray(props.codexFlowEvents) ? props.codexFlowEvents : []
)

const agentApprovalEvents = computed(() =>
	codexFlowEvents.value
		.filter((item) => {
			const kind = String(item?.kind || '').trim()
			return kind === 'approval' && !!String(item?.approvalRequestId || '').trim()
		})
		.slice(-3)
)

const agentToolCalls = computed(() => {
	if (!props.messages) return []
	const allTools: Array<{
		id: string
		name: string
		status: 'pending' | 'running' | 'completed' | 'error'
		args?: Record<string, unknown>
		result?: unknown
		error?: string
		hasDetails?: boolean
	}> = []
	for (const m of props.messages) {
		if (!m.toolCalls?.length) continue
		for (const tc of m.toolCalls) {
			const hasArgs = tc.args && Object.keys(tc.args).length > 0
			const hasResult = tc.result !== undefined && tc.result !== null
			const hasError = !!tc.error
			allTools.push({
				id: tc.id,
				name: tc.name,
				status: tc.status as any,
				args: tc.args,
				result: tc.result,
				error: tc.error,
				hasDetails: hasArgs || hasResult || hasError
			})
		}
	}
	return allTools.slice(-10)
})

const agentFlowDetail = (ev: CodexFlowEvent) => {
	const direct = String(ev.detail || '').trim()
	if (direct) return direct
	const payloadValue = (ev.payload || {}) as Record<string, unknown>
	if (ev.kind === 'command' && Array.isArray(payloadValue.command)) {
		return payloadValue.command
			.map((item: unknown) => String(item || ''))
			.join(' ')
			.trim()
	}
	if (ev.kind === 'fileChange' && Array.isArray(payloadValue.changes)) {
		return `${payloadValue.changes.length}${t('aichat.dock.fileChangeItems')}`
	}
	return ''
}
const codexActiveSessionId = computed(() => String(props.codexActiveSessionId || '').trim())

const onSelectCodexSession = (sessionId: string) => {
	const id = String(sessionId || '').trim()
	if (!id) return
	emit('codex-select-session', id)
}

const onAgentSessionChange = (e: Event) => {
	const id = String((e.target as HTMLSelectElement).value || '').trim()
	if (!id) return
	onSelectCodexSession(id)
}

const onRenameCodexSession = (sessionId: string, currentTitle: string) => {
	const id = String(sessionId || '').trim()
	if (!id) return
	const next = window.prompt(
		t('aichat.dock.renamePrompt'),
		String(currentTitle || '').trim() || t('aichat.dock.defaultSessionName')
	)
	if (next == null) return
	const title = String(next || '').trim()
	if (!title) return
	emit('codex-rename-session', { sessionId: id, title })
}

const onCodexApproval = (messageId: string, decision: 'accept' | 'decline') => {
	const id = String(messageId || '').trim()
	if (!id) return
	emit('codex-approval', { messageId: id, decision })
}

const onUserChoiceSelect = (messageId: string, choiceIndex: number, choiceText: string) => {
	const id = String(messageId || '').trim()
	if (!id) return
	emit('user-choice-select', { messageId: id, choiceIndex, choiceText })
}

const onRenameActiveAgentSession = () => {
	const sid = codexActiveSessionId.value
	if (!sid) return
	const item = codexSessions.value.find((s) => String(s.id || '').trim() === sid)
	onRenameCodexSession(sid, item?.title || t('aichat.dock.defaultSessionName'))
}

const onDeleteActiveAgentSession = () => {
	const sid = codexActiveSessionId.value
	if (!sid) return
	emit('codex-delete-session', sid)
}

const emitWorkflowEndLink = (anchorId: string, anchorIndex: number) => {
	const nodeId = nanoAnchorNodeId.value
	if (!nodeId) return
	emit('workflow-end-link', {
		nodeId,
		anchorId: String(anchorId || ''),
		anchorIndex: Number(anchorIndex) || 0
	})
}

watch(
	() => dockRef.value,
	(el) => {
		if (!el) return
		if (dockLeftPx.value == null) {
			dockLeftPx.value = clampDockLeft(window.innerWidth / 2)
		}
	},
	{ immediate: true }
)

const onWindowResize = () => {
	if (dockLeftPx.value == null) return
	dockLeftPx.value = clampDockLeft(dockLeftPx.value)
	emitLayoutChanged()
}

onMounted(() => {
	window.addEventListener('resize', onWindowResize, { passive: true })
	emitLayoutChanged()
})

onBeforeUnmount(() => {
	window.removeEventListener('resize', onWindowResize)
	if (dragCleanup) {
		dragCleanup()
		dragCleanup = null
	}
	if (layoutRaf) {
		window.cancelAnimationFrame(layoutRaf)
		layoutRaf = 0
	}
	if (nanoTimer != null) {
		window.clearInterval(nanoTimer)
		nanoTimer = null
	}
})

watch(
	() => [props.sending, props.modelKey] as const,
	([sending, mk], [prevSending]) => {
		const isNano = (mk ?? 'deepseek') === 'nanobanana' || (mk ?? 'deepseek') === 'seedance'
		if (!isNano) return
		if (sending && !prevSending) {
			nanoStartAt.value = Date.now()
			nanoElapsedSec.value = 0
			if (nanoTimer != null) window.clearInterval(nanoTimer)
			nanoTimer = window.setInterval(() => {
				if (!nanoStartAt.value) return
				nanoElapsedSec.value = (Date.now() - nanoStartAt.value) / 1000
			}, 250)
			return
		}
		if (!sending && prevSending) {
			if (nanoTimer != null) window.clearInterval(nanoTimer)
			nanoTimer = null
		}
	}
)
</script>

<style scoped>
.chat-dock {
	position: absolute;
	left: 50%;
	bottom: 16px;
	transform: translateX(-50%);
	width: min(920px, calc(100% - 48px));
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 22px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent),
		0 14px 36px rgba(0, 0, 0, 0.4);
	border-radius: 0;
	overflow: hidden;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
	user-select: text;
	display: flex;
	flex-direction: column;
	z-index: 101;
	backdrop-filter: blur(14px) saturate(140%);
	-webkit-backdrop-filter: blur(14px) saturate(140%);
}

.chat-dock:not(.collapsed)::before,
.chat-dock:not(.collapsed)::after {
	content: '';
	position: absolute;
	pointer-events: none;
	z-index: 10;
	width: 14px;
	height: 14px;
	border: 2px solid var(--wf-primary, #1f9d84);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.chat-dock:not(.collapsed)::before {
	top: -2px;
	left: -2px;
	border-right: none;
	border-bottom: none;
}

.chat-dock:not(.collapsed)::after {
	bottom: -2px;
	right: -2px;
	border-left: none;
	border-top: none;
}

.chat-dock:hover {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
}

.chat-dock.right-drawer {
	position: fixed;
	left: auto;
	right: 10px;
	top: var(--aiwf-safe-top, 0px);
	bottom: 10px;
	transform: translateX(0);
	width: min(720px, calc(100vw - 20px));
	height: calc(100vh - var(--aiwf-safe-top, 0px) - 10px);
	max-height: none;
	border-radius: 0;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		-12px 12px 36px rgba(0, 0, 0, 0.42),
		0 0 32px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
	flex-direction: column;
	z-index: 120;
}

.chat-dock.collapsed {
	border: none;
	box-shadow: none;
	width: auto;
	height: auto;
	background: transparent;
	overflow: visible;
	backdrop-filter: none;
	-webkit-backdrop-filter: none;
}

.chat-dock.right-drawer.collapsed {
	top: var(--aiwf-safe-top, 0px);
	right: 10px;
	bottom: 10px;
	width: min(520px, calc(100vw - 20px));
	height: calc(100vh - var(--aiwf-safe-top, 0px) - 10px);
	max-height: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	background: transparent;
	backdrop-filter: none;
	-webkit-backdrop-filter: none;
	pointer-events: none;
}

.chat-collapsed-handle {
	order: 2;
	width: 140px;
	height: 34px;
	display: grid;
	place-items: center;
	margin: 10px auto;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 90%, transparent);
	color: var(--wf-primary, #1f9d84);
	cursor: pointer;
	border-radius: 2px;
	transition:
		border-color 220ms ease,
		color 220ms ease,
		background-color 220ms ease,
		box-shadow 220ms ease,
		opacity 220ms ease;
	text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
}

.chat-dock.right-drawer.collapsed .chat-collapsed-handle {
	pointer-events: auto;
	margin: 0;
	position: absolute;
	right: calc(12px + var(--chat-collapsed-safe-right-offset, 0px));
	bottom: 16px;
	min-width: 140px;
	box-shadow: 0 0 16px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.chat-collapsed-handle:hover {
	border-color: var(--wf-primary, #1f9d84);
	color: var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
	box-shadow: 0 0 20px color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
}

.chat-dock:not(.collapsed) .chat-collapsed-handle {
	display: none;
}

.chat-content {
	order: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
	/* Avoid clipping on tall screens when history is maximized. */
	max-height: calc(100vh - 24px);
	opacity: 1;
	transform: translateY(0);
	overflow: hidden;
	transition:
		max-height 220ms ease,
		opacity 200ms ease,
		transform 220ms ease;
}

.chat-dock.right-drawer .chat-content {
	height: 100%;
	max-height: none;
	min-height: 0;
	transform: translateX(0);
	background: transparent;
	transition:
		opacity 220ms ease,
		transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.chat-dock.collapsed .chat-content {
	max-height: 0;
	opacity: 0;
	transform: translateY(10px);
	pointer-events: none;
}

.chat-dock.right-drawer.collapsed .chat-content {
	max-height: none;
	transform: translateX(100%);
	opacity: 0;
	pointer-events: none;
}

.chat-history {
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 90%, transparent);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	flex: 1;
	min-height: 220px;
	display: grid;
	grid-template-rows: auto 1fr;
	transition: height 220ms ease;
	position: relative;
}

.chat-history-body.nanobanana {
	padding: 0;
}

.nano-panel {
	display: grid;
	grid-template-columns: 140px 340px 1fr;
	gap: 0;
	min-height: 0;
}

.nano-anchor-col {
	border-right: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	padding: 10px 8px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-height: 0;
	overflow: hidden;
}

.nano-anchor-col-title {
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
	letter-spacing: 0.5px;
}

.nano-anchor-col-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	overflow: auto;
	min-height: 0;
	padding-right: 2px;
}

.nano-anchor-item {
	display: grid;
	grid-template-columns: 14px 1fr;
	align-items: center;
	gap: 8px;
}

.nano-anchor-item.hover .nano-ref-dot {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.nano-anchor-label {
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.nano-left {
	border-right: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-height: 0;
}

.nano-ref-dot {
	width: 12px;
	height: 12px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 45%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	box-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.nano-right {
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-height: 0;
}

.codex-panel {
	display: grid;
	grid-template-columns: 240px 1fr 300px;
	min-height: 0;
	height: 100%;
}

.codex-col {
	min-height: 0;
	display: flex;
	flex-direction: column;
}

.codex-sessions-col,
.codex-chat-col {
	border-right: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
}

.codex-col-head {
	padding: 10px;
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	display: flex;
	align-items: center;
	justify-content: space-between;
	letter-spacing: 0.5px;
}

.codex-sessions-list,
.codex-flow-list {
	padding: 8px;
	overflow: auto;
	min-height: 0;
}

.codex-session-item {
	width: 100%;
	text-align: left;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	padding: 6px;
	margin-bottom: 8px;
	border-radius: 2px;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.codex-session-main {
	display: block;
	width: 100%;
	border: none;
	background: transparent;
	color: inherit;
	text-align: left;
	padding: 2px;
}

.codex-session-actions {
	margin-top: 6px;
	display: flex;
	gap: 6px;
}

.codex-session-item.active {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.codex-session-title {
	font-size: 12px;
	font-weight: 600;
	color: var(--wf-primary, #1f9d84);
}

.codex-session-meta,
.codex-flow-meta {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	margin-top: 2px;
}

.codex-chat-list {
	padding-right: 8px;
}

.codex-flow-item {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	padding: 8px;
	margin-bottom: 8px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	border-radius: 2px;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease;
}

.codex-flow-item.completed {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.codex-flow-item.failed {
	border-color: color-mix(in srgb, #b34a4a 65%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, #b34a4a 35%, transparent);
}

.codex-flow-title {
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
}

.codex-approval-row {
	margin-top: 8px;
	display: flex;
	gap: 6px;
}

.codex-mini-btn {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	font-size: 11px;
	padding: 3px 8px;
	border-radius: 2px;
	cursor: pointer;
	transition:
		border-color 220ms ease,
		color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.codex-mini-btn:hover {
	border-color: var(--wf-primary, #1f9d84);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.codex-mini-btn.danger {
	border-color: color-mix(in srgb, #b34a4a 55%, transparent);
	color: color-mix(in srgb, #e88a8a 90%, transparent);
}

.codex-mini-btn.danger:hover {
	border-color: #b34a4a;
	color: #e88a8a;
	box-shadow: 0 0 8px color-mix(in srgb, #b34a4a 40%, transparent);
}

.codex-empty {
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	font-size: 12px;
	padding: 10px 4px;
}

@media (max-width: 1200px) {
	.codex-panel {
		grid-template-columns: 200px 1fr 240px;
	}
}

@media (max-width: 900px) {
	.codex-panel {
		grid-template-columns: 1fr;
	}

	.codex-sessions-col,
	.codex-chat-col {
		border-right: none;
		border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	}
}

.nano-field {
	display: grid;
	grid-template-columns: 88px 1fr;
	align-items: center;
	gap: 10px;
}

.nano-label {
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
}

.nano-input {
	width: 100%;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	padding: 6px 8px;
	outline: none;
	border-radius: 2px;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.nano-input:focus {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.nano-hint {
	grid-column: 2;
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	white-space: nowrap;
	min-height: 24px;
	padding: 3px 6px;
	border: 1px dashed color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 5%, transparent);
	font-size: 10px;
	line-height: 1.25;
	overflow: hidden;
	text-overflow: ellipsis;
	border-radius: 2px;
}

.nano-pro-btn {
	grid-column: 2;
	height: 30px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent);
	color: var(--wf-primary, #1f9d84);
	cursor: pointer;
	border-radius: 2px;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.nano-pro-btn:hover {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.nano-pro-btn:disabled {
	opacity: 0.7;
	cursor: not-allowed;
}

.nano-billing {
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.nano-detail {
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 90%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	padding: 8px;
	white-space: pre-wrap;
	line-height: 1.35;
	max-height: 92px;
	overflow: auto;
	border-radius: 2px;
}

.nano-preview {
	position: relative;
	flex: 1;
	min-height: 240px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 86%, transparent);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	display: grid;
	place-items: center;
	overflow: hidden;
	border-radius: 2px;
}

.nano-preview-grid {
	width: 100%;
	height: 100%;
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	padding: 8px;
	box-sizing: border-box;
}

.nano-preview-grid.count-1 {
	grid-template-columns: 1fr;
}

.nano-preview-item {
	position: relative;
	min-height: 0;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 90%, transparent);
	display: grid;
	place-items: center;
	overflow: hidden;
	border-radius: 2px;
}

.nano-preview-item.video-pending {
	cursor: progress;
}

.nano-preview-item.video-ready {
	cursor: grab;
}

.nano-preview-item img {
	width: 100%;
	height: 100%;
	object-fit: contain;
}

.nano-preview-video {
	width: 100%;
	height: 100%;
	object-fit: contain;
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.3);
}

.nano-preview-item img.loading {
	filter: blur(6px);
}

.nano-preview-item-loading {
	position: absolute;
	inset: 0;
	z-index: 2;
	pointer-events: none;
	background: rgb(from var(--dweb-defualt) r g b / 0.12);
	backdrop-filter: blur(16px) saturate(180%);
	-webkit-backdrop-filter: blur(16px) saturate(180%);
}

.nano-preview-item-loading::before,
.nano-preview-item-loading::after {
	content: '';
	position: absolute;
	inset: -30%;
	background-size: 200% 200%;
	filter: blur(18px);
	transform: translate3d(0, 0, 0);
	will-change: background-position, opacity, transform;
}

.nano-preview-item-loading::before {
	background-image: linear-gradient(
		135deg,
		rgb(from var(--dweb-blue) r g b / 0.85),
		rgb(from var(--dweb-purple-light) r g b / 0.75),
		rgb(from var(--dweb-blue) r g b / 0.85)
	);
	mix-blend-mode: screen;
	animation:
		nanoPreviewGlassMove 3.2s ease-in-out infinite,
		nanoPreviewGlassFadeA 4.8s ease-in-out infinite;
}

.nano-preview-item-loading::after {
	background-image: linear-gradient(
		135deg,
		rgb(from var(--dweb-pink) r g b / 0.8),
		rgb(from var(--dweb-orange) r g b / 0.78),
		rgb(from var(--dweb-pink) r g b / 0.8)
	);
	mix-blend-mode: screen;
	animation:
		nanoPreviewGlassMove 3.2s ease-in-out infinite reverse,
		nanoPreviewGlassFadeB 4.8s ease-in-out infinite;
}

@keyframes nanoPreviewGlassMove {
	0% {
		background-position: 0% 20%;
		transform: translate3d(-1.5%, -0.5%, 0) scale(1.02);
	}
	50% {
		background-position: 100% 80%;
		transform: translate3d(1.5%, 0.5%, 0) scale(1.06);
	}
	100% {
		background-position: 0% 20%;
		transform: translate3d(-1.5%, -0.5%, 0) scale(1.02);
	}
}

@keyframes nanoPreviewGlassFadeA {
	0%,
	45% {
		opacity: 0.75;
	}
	55%,
	100% {
		opacity: 0;
	}
}

@keyframes nanoPreviewGlassFadeB {
	0%,
	45% {
		opacity: 0;
	}
	55%,
	100% {
		opacity: 0.75;
	}
}

.nano-preview-empty {
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.nano-preview-status {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 3;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 8px;
	background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.72));
}

.nano-preview-status-text {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 11px;
	color: #f3f5f7;
}

.nano-preview-progress-track {
	width: 100%;
	height: 6px;
	border-radius: 2px;
	overflow: hidden;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.nano-preview-progress-fill {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(
		90deg,
		color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent),
		var(--wf-primary, #1f9d84)
	);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
}

.chat-dock.history-expanded .chat-history {
	min-height: 320px;
}

.chat-history-bar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px 10px;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	touch-action: none;
	user-select: none;
}

.chat-history-title {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
	flex: 1;
	min-width: 0;
}

.chat-history-title .agent-session-select {
	width: 100%;
	min-width: 200px;
	max-width: 300px;
}

.chat-history-new-btn {
	width: 28px;
	height: 28px;
	display: grid;
	place-items: center;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	border-radius: 2px;
	cursor: pointer;
	flex-shrink: 0;
	transition:
		border-color 220ms ease,
		color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.chat-history-new-btn:hover {
	border-color: var(--wf-primary, #1f9d84);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.chat-history-new-btn svg {
	width: 16px;
	height: 16px;
}

.chat-history-delete-btn {
	width: 28px;
	height: 28px;
	display: grid;
	place-items: center;
	border: 1px solid color-mix(in srgb, var(--wf-danger, #ef4444) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	border-radius: 2px;
	cursor: pointer;
	flex-shrink: 0;
	transition:
		border-color 220ms ease,
		color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.chat-history-delete-btn:hover:not(:disabled) {
	border-color: var(--wf-danger, #ef4444);
	color: var(--wf-danger, #ef4444);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-danger, #ef4444) 30%, transparent);
	background: color-mix(in srgb, var(--wf-danger, #ef4444) 10%, transparent);
}

.chat-history-delete-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.chat-history-delete-btn svg {
	width: 16px;
	height: 16px;
}

.chat-panel-tabs {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 2px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	border-radius: 2px;
}

.chat-panel-tab {
	border: 1px solid transparent;
	background: transparent;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 60%, transparent);
	padding: 3px 10px;
	font-size: 12px;
	cursor: pointer;
	border-radius: 2px;
	transition:
		border-color 220ms ease,
		background-color 220ms ease,
		color 220ms ease,
		box-shadow 220ms ease;
}

.chat-panel-tab:hover {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
	color: var(--wf-primary, #1f9d84);
}

.chat-panel-tab.active {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
}

.chat-history-minimize {
	width: 34px;
	height: 28px;
	display: grid;
	place-items: center;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	border-radius: 2px;
	cursor: pointer;
	transition:
		border-color 220ms ease,
		color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.chat-history-minimize:hover {
	border-color: var(--wf-primary, #1f9d84);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.chat-history-minimize svg {
	width: 18px;
	height: 18px;
}

.chat-history-body {
	overflow: auto;
	min-height: 0;
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.chat-history-empty {
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.chat-history-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.agent-panel {
	display: flex;
	flex-direction: column;
	min-height: 0;
	height: 100%;
}

.agent-session-bar {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 6px;
	padding: 8px;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	flex-shrink: 0;
	align-items: center;
}

.agent-content-area {
	display: flex;
	flex: 1;
	min-height: 0;
	width: 100%;
}

.agent-chat-area {
	flex: 1;
	min-width: 0;
	min-height: 0;
	display: flex;
	flex-direction: column;
	padding: 8px;
	border-right: 1px solid rgba(148, 163, 184, 0.08);
}

.agent-side-panel {
	width: 260px;
	flex-shrink: 0;
	overflow-y: auto;
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

@media (max-width: 600px) {
	.agent-side-panel {
		display: none;
	}
}

.agent-session-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.agent-session-label {
	font-size: 12px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
}

.agent-session-controls {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	align-items: center;
	white-space: nowrap;
	flex: 1;
}

.agent-session-select {
	width: 100%;
	min-width: 160px;
}

.agent-mode-select {
	min-width: 84px;
}

.agent-stream-mode-select {
	min-width: 92px;
}

.agent-session-controls .codex-mini-btn {
	min-width: 44px;
	padding: 3px 6px;
}

.agent-empty-state {
	flex: 1;
	min-height: 0;
	display: grid;
	place-items: center;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
	font-size: 18px;
	font-weight: 600;
	letter-spacing: 0.02em;
}

.agent-chat-list {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 10px;
	width: 100%;
	box-sizing: border-box;
}

.agent-tool-calls {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 8px 0;
}

.agent-runtime-card {
	margin: 0 10px 10px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	border-radius: 2px;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease;
}

.agent-runtime-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.agent-runtime-title {
	font-size: 12px;
	color: var(--wf-primary, #1f9d84);
	font-weight: 600;
	text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.agent-runtime-mode {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	padding: 2px 8px;
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 70%, transparent);
	border-radius: 2px;
}

.agent-runtime-mode.mock {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.agent-runtime-meta {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.agent-runtime-skills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.agent-skill-badge {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	font-size: 11px;
	padding: 2px 8px;
	border-radius: 2px;
}

.agent-skill-list {
	margin: 0 10px 10px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.agent-skill-card {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	padding: 8px;
	border-radius: 2px;
}

.agent-skill-card.completed {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.agent-skill-card.failed {
	border-color: #e57373;
	box-shadow: 0 0 8px color-mix(in srgb, #e57373 30%, transparent);
}

.agent-skill-title {
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
}

.agent-skill-meta {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	margin-top: 4px;
}

.agent-flow-list {
	max-height: 128px;
	overflow: auto;
	padding: 0 8px 8px;
	border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
}

.chat-msg {
	max-width: 92%;
	display: flex;
	flex-direction: column;
}

.chat-msg.user {
	align-self: flex-end;
}

.chat-msg.assistant {
	align-self: flex-start;
}

.chat-msg.system {
	align-self: center;
}

.chat-msg-bubble {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 85%, transparent);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	padding: 10px 12px;
	border-radius: 6px;
	max-width: 100%;
	box-sizing: border-box;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.chat-msg.user .chat-msg-bubble {
	border-color: var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
}

.chat-dock-status {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 16px;
	padding: 0 1px;
	margin-top: 0;
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.chat-dock-status-text {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.chat-status-dots {
	display: inline-flex;
	letter-spacing: 1px;
}

.chat-status-dots span {
	animation: chatStatusDotFade 1.2s infinite ease-in-out;
	color: var(--wf-primary, #1f9d84);
	text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.chat-status-dots span:nth-child(2) {
	animation-delay: 0.2s;
}

.chat-status-dots span:nth-child(3) {
	animation-delay: 0.4s;
}

.chat-dock-context-usage {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 2px 0;
	font-size: 11px;
}

.chat-dock-context-usage-bar {
	flex: 1;
	height: 4px;
	background: color-mix(in srgb, var(--wf-secondary-bg, #2a2a2a) 80%, transparent);
	border-radius: 2px;
	overflow: hidden;
}

.chat-dock-context-usage-fill {
	height: 100%;
	background: var(--wf-primary, #1f9d84);
	border-radius: 2px;
	transition: width 0.3s ease;
}

.chat-dock-context-usage-fill.warning {
	background: var(--wf-warning, #f59e0b);
}

.chat-dock-context-usage-fill.truncated {
	background: var(--wf-danger, #ef4444);
}

.chat-dock-context-usage-text {
	white-space: nowrap;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, transparent);
}

.chat-dock-context-usage-truncated {
	margin-left: 4px;
	padding: 1px 4px;
	background: color-mix(in srgb, var(--wf-danger, #ef4444) 20%, transparent);
	color: var(--wf-danger, #ef4444);
	border-radius: 2px;
	font-size: 10px;
}

.nano-title-tag {
	display: inline-flex;
	align-items: center;
	padding: 2px 6px;
	margin-left: 8px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	font-size: 11px;
	color: var(--wf-primary, #1f9d84);
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.chat-msg-role {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	margin-bottom: 4px;
}

.chat-msg-content {
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 12px;
	line-height: 1.45;
	color: var(--wf-text, #edf2f4);
}

.chat-msg.assistant .chat-msg-content {
	user-select: text;
}

.chat-dock-body {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	grid-template-rows: auto auto auto;
	flex-shrink: 0;
	gap: 6px;
	padding: 6px 8px;
	border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	position: relative;
}

.chat-dock-footer {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-width: 0;
}

.chat-dock-footer-left {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	flex: 1;
}

.chat-dock-toolbar-item {
	display: flex;
	align-items: center;
	gap: 4px;
}

.chat-dock-toolbar-item-model {
	min-width: 200px;
	flex: 1;
}

.chat-dock-toolbar-item-mini {
	min-width: 84px;
}

.chat-dock-toolbar-item-thinking {
	min-width: 96px;
	flex-shrink: 0;
}

.thinking-select {
	min-width: 72px;
}

.thinking-select:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.chat-dock-toolbar-label {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
}

.chat-dock-model-row {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	gap: 6px;
}

.chat-dock-footer .chat-dock-toolbar-item-model,
.chat-dock-footer .chat-dock-toolbar-item-mini {
	flex-shrink: 0;
}

.agent-working-dir {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 24px;
	padding: 3px 6px;
	border: 1px dashed color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	font-size: 10px;
	line-height: 1.25;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	border-radius: 2px;
}

.agent-working-dir > span:first-child {
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
}

.agent-working-dir-path {
	color: var(--wf-primary, #1f9d84);
	font-size: 11px;
	line-height: 1.2;
	max-width: 100%;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.chat-dock-toolbar-select {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	padding: 4px 8px;
	outline: none;
	border-radius: 2px;
	font-size: 11px;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease;
}

.chat-dock-toolbar-select:focus {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.chat-dock-input {
	resize: none;
	width: 100%;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-text, #edf2f4);
	padding: 8px 10px;
	outline: none;
	border-radius: 2px;
	font-size: 12px;
	line-height: 1.35;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease;
}

.chat-dock-input:focus {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
}

.chat-dock-send {
	border: 1px solid var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 14%, transparent);
	color: var(--wf-primary, #1f9d84);
	cursor: pointer;
	border-radius: 2px;
	padding: 0 12px;
	font-size: 11px;
	min-width: 72px;
	height: 28px;
	text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease,
		color 220ms ease;
}

.chat-dock-send.stopping {
	border-color: #e57373;
	background: color-mix(in srgb, #e57373 14%, transparent);
	color: #e57373;
	text-shadow: 0 0 4px color-mix(in srgb, #e57373 30%, transparent);
}

.chat-dock-send:hover {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.chat-dock-send:disabled,
.chat-dock-input:disabled {
	opacity: 0.7;
	cursor: not-allowed;
}

.chat-dock-upload {
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 88%, transparent);
	color: var(--wf-primary, #1f9d84);
	cursor: pointer;
	border-radius: 2px;
	padding: 0 8px;
	min-width: 32px;
	height: 28px;
	display: grid;
	place-items: center;
	transition:
		border-color 220ms ease,
		box-shadow 220ms ease,
		background-color 220ms ease,
		color 220ms ease;
}

.chat-dock-upload:hover:not(:disabled) {
	border-color: var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
}

.chat-dock-upload:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.chat-dock-upload svg {
	width: 16px;
	height: 16px;
}

.chat-dock-file-input {
	display: none;
}

.chat-dock-skill-picker {
	position: fixed;
	left: 50%;
	transform: translateX(-50%);
	bottom: calc(100% + 8px);
	min-width: 320px;
	max-width: min(560px, calc(100% - 32px));
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.98)) 95%, transparent);
	border-radius: 4px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	max-height: 300px;
	overflow: hidden;
	z-index: 1000;
}

.chat-dock-skill-picker-header {
	padding: 10px 12px;
	font-size: 12px;
	font-weight: 600;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
}

.chat-dock-skill-picker-list {
	padding: 4px;
	max-height: 250px;
	overflow-y: auto;
}

.chat-dock-skill-picker-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	cursor: pointer;
	border-radius: 3px;
	transition: background-color 180ms ease;
}

.chat-dock-skill-picker-item:hover,
.chat-dock-skill-picker-item.active {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.chat-dock-skill-picker-item-icon {
	font-size: 20px;
	width: 32px;
	height: 32px;
	display: grid;
	place-items: center;
}

.chat-dock-skill-picker-item-info {
	flex: 1;
	min-width: 0;
}

.chat-dock-skill-picker-item-name {
	font-size: 13px;
	font-weight: 500;
	color: var(--wf-text, #edf2f4);
}

.chat-dock-skill-picker-item-desc {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	margin-top: 2px;
}

@keyframes chatStatusDotFade {
	0%,
	80%,
	100% {
		opacity: 0.25;
		transform: translateY(0);
	}
	40% {
		opacity: 1;
		transform: translateY(-1px);
	}
}
</style>
