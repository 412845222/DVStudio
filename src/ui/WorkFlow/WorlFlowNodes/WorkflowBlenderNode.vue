<template>
	<WorkflowNodeBase
		ref="baseRef"
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
		:isPrimarySelected="isPrimarySelected"
		:isSecondarySelected="isSecondarySelected"
		:visualStatus="visualStatus"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		:nodeChatVisible="nodeChatVisible"
		:nodeChatNodeType="nodeChatNodeType"
		:nodeChatDraft="nodeChatDraft"
		:nodeChatSubmitting="nodeChatSubmitting"
		:nodeChatParams="nodeChatParams"
		:inputParamPreviewRefs="inputParamPreviewRefs"
		:nodeGenerationTask="nodeGenerationTask"
		:anchorCompatibility="anchorCompatibility"
		:isLinking="isLinking"
		:sizeCustomized="sizeCustomized"
		:autoHeight="autoHeight"
		@update:world-x="(v) => emit('update:worldX', v)"
		@update:world-y="(v) => emit('update:worldY', v)"
		@update:world-position="(p) => emit('update:worldPosition', p)"
		@select="(id) => emit('select', id)"
		@start-link="onStartLink"
		@end-link="onEndLink"
		@copy="() => emit('copy')"
		@refresh="() => emit('refresh')"
		@delete="() => emit('delete')"
		@set-type="onSetType"
		@resize="onResize"
		@open-node-library="() => emit('open-node-library')"
		@auto-resize="(h) => emit('auto-resize', h)"
		@node-chat-update-draft="(value) => emit('node-chat-update-draft', value)"
		@node-chat-update-params="(value) => emit('node-chat-update-params', value)"
		@node-chat-close="emit('node-chat-close')"
		@node-chat-submit="(payload) => emit('node-chat-submit', payload)"
		@node-chat-stop="emit('node-chat-stop')"
		@node-chat-remove-param-ref="(item) => emit('node-chat-remove-param-ref', item)"
	>
		<template #body>
			<div class="wf-blender-body" @pointerdown.stop>
				<!-- MCP 连接状态指示器 -->
				<div class="wf-blender-status-bar" @click.stop="onStatusClick" :title="hintText || ''">
					<span class="wf-blender-status-dot" :class="statusClass"></span>
					<span class="wf-blender-status-text">{{ statusText }}</span>
					<span v-if="toolsReady !== undefined" class="wf-blender-tools-indicator" :class="toolsReady ? 'is-ready' : 'is-not-ready'" :title="toolsReady ? '工具就绪' : '工具未就绪，点击挂载工具按钮'">
						{{ toolsReady ? '✓' : '⚠' }}
					</span>
					<span v-if="mcpError" class="wf-blender-status-error" :title="mcpError">!</span>
				</div>

				<!-- 操作提示 -->
				<div v-if="hintText" class="wf-blender-hint">
					{{ hintText }}
				</div>

				<!-- 工具就绪提示 -->
				<div v-if="isConnected && toolsReady !== undefined && !toolsReady" class="wf-blender-tools-warning">
					<span class="wf-blender-tools-warning-icon">⚠️</span>
					<span class="wf-blender-tools-warning-text">工具未就绪，点击底部"挂载工具"按钮完成工具注册</span>
				</div>

				<!-- 连接配置：Host/Port -->
				<div class="wf-blender-conn-config">
					<label class="wf-blender-conn-label">Host</label>
					<input
						class="wf-blender-conn-input"
						type="text"
						v-model="hostInput"
						@input="onHostPortChange"
						spellcheck="false"
					/>
					<label class="wf-blender-conn-label">Port</label>
					<input
						class="wf-blender-conn-input wf-blender-conn-port"
						type="number"
						v-model.number="portInput"
						@input="onHostPortChange"
						min="1"
						max="65535"
					/>
				</div>

				<!-- Blender可执行文件路径 -->
				<div class="wf-blender-path-config">
					<label class="wf-blender-conn-label">Blender</label>
					<input
						class="wf-blender-path-input"
						type="text"
						v-model="blenderPathInput"
						@input="onBlenderPathChange"
						placeholder="留空自动查找，或指定blender.exe路径"
						spellcheck="false"
					/>
					<button class="wf-blender-path-browse" @click.stop="onBrowseBlender" title="浏览选择blender.exe">...</button>
				</div>

				<!-- 节点内对话记录面板 -->
				<div class="wf-blender-chat-panel" ref="chatPanelRef" @pointerdown.stop>
					<div v-if="!chatMessages.length" class="wf-blender-chat-empty">
						<div class="wf-blender-chat-empty-title">🤖 Blender AI 助手</div>
						<div class="wf-blender-chat-empty-desc">连接Blender后，用自然语言描述你想在Blender中执行的操作，AI将自动调用blender_execute_code工具控制Blender。</div>
						<div class="wf-blender-chat-empty-example">例如："创建一个立方体"、"导入上游模型"、"给选中物体添加 subdivision 修改器"</div>
					</div>
					<div v-if="hasMoreMessages" class="wf-blender-load-more" @click.stop="onLoadMoreMessages">
						⬆ 加载更早消息（还有 {{ chatMessages.length - visibleMessages.length }} 条）
					</div>
					<div
						v-for="msg in visibleMessages"
						:key="msg.id"
						class="wf-blender-chat-msg"
						:class="[
							`wf-blender-chat-msg-${msg.role}`,
							{
								'is-error': msg.isError,
								'is-thinking': msg.isThinking,
								'is-running': msg.status === 'running',
								'is-completed': msg.status === 'completed',
								'is-tool-failed': msg.status === 'error'
							}
						]"
					>
						<!-- 工具调用卡片（可折叠） -->
						<template v-if="msg.role === 'tool_call'">
							<div
								class="wf-blender-tool-card"
								:class="{ 'is-collapsed': isMsgCollapsed(msg), 'is-running': msg.status === 'running', 'is-error': msg.status === 'error' }"
							>
								<div class="wf-blender-tool-header" style="cursor: pointer;" @click.stop="onToggleToolMsg(msg)">
									<span class="wf-blender-tool-status-icon">
										<span v-if="msg.status === 'running'" class="wf-blender-tool-spinner"></span>
										<span v-else-if="msg.status === 'error'">❌</span>
										<span v-else>✅</span>
									</span>
									<span class="wf-blender-tool-name">{{ formatToolName(msg.toolName) }}</span>
									<span class="wf-blender-tool-summary">{{ msg.content.replace(/^[🔧✅❌]\s*/, '').replace(/^执行Blender代码/, '').replace(/^Blender代码执行/, '') }}</span>
									<span class="wf-blender-tool-toggle" style="cursor: pointer; user-select: none;">{{ isMsgCollapsed(msg) ? '▼' : '▲' }}</span>
								</div>
								<div v-if="!isMsgCollapsed(msg)" class="wf-blender-tool-detail" @click.stop>
									<div v-if="msg.toolArgs && (msg.toolArgs as any).code" class="wf-blender-tool-code-section">
										<div class="wf-blender-tool-detail-label">📝 代码：</div>
										<pre class="wf-blender-tool-code"><code>{{ (msg.toolArgs as any).code }}</code></pre>
									</div>
									<div v-if="msg.toolError" class="wf-blender-tool-error-section">
										<div class="wf-blender-tool-detail-label">❌ 错误：</div>
										<pre class="wf-blender-tool-error">{{ msg.toolError }}</pre>
									</div>
									<div v-else-if="msg.toolResult" class="wf-blender-tool-result-section">
										<div class="wf-blender-tool-detail-label">📋 结果：</div>
										<pre class="wf-blender-tool-result">{{ formatToolResult(msg.toolResult) }}</pre>
									</div>
								</div>
							</div>
						</template>
						<!-- 命令执行卡片 -->
						<template v-else-if="msg.role === 'command'">
							<div
								class="wf-blender-command-card"
								:class="{ 'is-running': msg.status === 'running', 'is-error': msg.status === 'error' }"
							>
								<div class="wf-blender-tool-header">
									<span class="wf-blender-tool-status-icon">
										<span v-if="msg.status === 'running'" class="wf-blender-tool-spinner"></span>
										<span v-else-if="msg.status === 'error'">❌</span>
										<span v-else>✅</span>
									</span>
									<span class="wf-blender-tool-name wf-blender-command-name">命令执行</span>
									<span class="wf-blender-tool-summary">{{ msg.content }}</span>
								</div>
							</div>
						</template>
						<!-- 系统消息 -->
						<template v-else-if="msg.role === 'system'">
							<div class="wf-blender-chat-msg-system">
								<span class="wf-blender-chat-msg-content">{{ msg.content }}</span>
							</div>
						</template>
						<!-- 用户/AI消息 -->
						<template v-else>
							<div class="wf-blender-chat-msg-bubble" :class="{ 'is-streaming': msg.isStreaming }">
								<span class="wf-blender-chat-msg-role">{{ roleLabel(msg.role) }}</span>
								<!-- 思考内容折叠卡片 -->
								<div v-if="msg.thinkingContent || msg.isStreamingThinking" class="wf-blender-thinking-card" :class="{ 'is-streaming': msg.isStreamingThinking }">
									<div class="wf-blender-thinking-header" @click.stop="onToggleThinking(msg)">
										<span class="wf-blender-thinking-icon">💭</span>
										<span class="wf-blender-thinking-label">{{ msg.isStreamingThinking ? '思考中...' : '已思考' }}</span>
										<span class="wf-blender-tool-toggle" style="cursor: pointer; user-select: none;">{{ isThinkingCollapsed(msg) ? '▼' : '▲' }}</span>
									</div>
									<div v-if="!isThinkingCollapsed(msg)" class="wf-blender-thinking-content">
										<pre class="wf-blender-thinking-text">{{ msg.thinkingContent }}</pre>
									</div>
								</div>
								<span v-if="msg.isThinking && !msg.isStreamingThinking && !msg.thinkingContent" class="wf-blender-thinking-indicator">
									<span class="wf-blender-dot"></span>
									<span class="wf-blender-dot"></span>
									<span class="wf-blender-dot"></span>
								</span>
								<span v-else class="wf-blender-chat-msg-content">
									{{ msg.content }}
									<span v-if="msg.isStreaming" class="wf-blender-caret"></span>
								</span>
							</div>
						</template>
					</div>
				</div>

				<!-- 工作空间指示器 -->
				<div class="wf-blender-workspace-indicator" @pointerdown.stop>
					<span class="wf-blender-workspace-icon">📂</span>
					<span v-if="workspacePath" class="wf-blender-workspace-path" :title="workspacePath">{{ workspaceFolderName }}</span>
					<span v-else class="wf-blender-workspace-path wf-blender-workspace-path-placeholder">工作空间未初始化</span>
					<button
						v-if="workspacePath"
						class="wf-blender-workspace-open-btn"
						type="button"
						@click.stop="onOpenWorkspace"
						title="打开工作空间文件夹"
					>
						打开
					</button>
					<button
						v-else
						class="wf-blender-workspace-open-btn wf-blender-workspace-init-btn"
						type="button"
						@click.stop="onInitWorkspace"
						:disabled="isWorkspaceInitializing"
						title="初始化工作空间文件夹"
					>
						{{ isWorkspaceInitializing ? '初始化中...' : '初始化' }}
					</button>
				</div>

				<!-- Token 使用量指示器 -->
		<div v-if="chatContextUsage && chatMessages.length" class="wf-blender-token-indicator" @pointerdown.stop>
			<div class="wf-blender-token-bar-container" :title="`上下文: ${chatContextUsage.tokenCount} / ${chatContextUsage.budget} tokens (${chatContextUsage.usage}%)${chatContextUsage.truncated ? ' — 已自动压缩' : ''}`">
				<div
					class="wf-blender-token-bar-fill"
					:class="{
						'is-warn': chatContextUsage.usage >= 70 && chatContextUsage.usage < 90,
						'is-high': chatContextUsage.usage >= 90,
						'is-truncated': chatContextUsage.truncated
					}"
					:style="{ width: `${Math.min(100, chatContextUsage.usage)}%` }"
				></div>
			</div>
			<span class="wf-blender-token-label">
				{{ formatTokenCount(chatContextUsage.tokenCount) }}/{{ formatTokenCount(chatContextUsage.budget) }}{{ chatContextUsage.truncated ? ' 📦' : '' }}
			</span>
			<button
				class="wf-blender-token-compress-btn"
				type="button"
				@click.stop="onCompressContext"
				:title="`压缩上下文（当前 ${chatContextUsage.usage}%）`"
				:disabled="chatMessages.length <= 2"
			>
				🗜️
			</button>
		</div>

				<!-- 导入进度条 -->
				<div v-if="showImportProgress" class="wf-blender-import-progress" @pointerdown.stop>
					<div class="wf-blender-import-header">
						<span class="wf-blender-import-label">{{ importLabelText }}</span>
						<span class="wf-blender-import-percent">{{ importProgress }}%</span>
					</div>
					<div class="wf-blender-import-bar-container">
						<div
							class="wf-blender-import-bar-fill"
							:class="{ 'is-error': importStatus === 'error', 'is-done': importStatus === 'completed' }"
							:style="{ width: `${importProgress}%` }"
						></div>
					</div>
					<div v-if="importError" class="wf-blender-import-error">{{ importError }}</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-blender-footer" @pointerdown.stop>
				<div class="wf-blender-toolbar">
					<button
						class="wf-blender-btn"
						:class="{ 'is-connected': isConnected, 'is-disabled': isBusy }"
						type="button"
						:disabled="isBusy"
						@click.stop="onToggleConnect"
					>
						{{ connectBtnText }}
					</button>
					<button
						v-if="(isConnected || mcpStatus === 'checking') && toolsReady !== undefined && !toolsReady"
						class="wf-blender-btn tools"
						type="button"
						:disabled="isBusy"
						@click.stop="onMountTools"
					>
						{{ isBusy ? '挂载中...' : '挂载工具' }}
					</button>
					<button
						class="wf-blender-btn ghost"
						type="button"
						:disabled="isImporting"
						@click.stop="emit('blender-import')"
					>
						{{ t('nodes.blender.btn.import') }}
					</button>
					<button
						v-if="chatMessages.length"
						class="wf-blender-btn ghost"
						type="button"
						@click.stop="emit('blender-clear-chat')"
					>
						{{ t('nodes.blender.btn.clearChat') }}
					</button>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import type { WorkflowBlenderNodeSettings, WorkflowBlenderChatMessage, WorkflowNodeChatType, WorkflowNodeChatSubmitPayload, WorkflowNodeGenerationTask } from '../../../aiworkflow/types'
import type { InputParamPreviewRef } from '../../BluePrint/node-dialog'
import { useI18n } from '../../../i18n'

const { t } = useI18n()

const collapsedMap = ref<Map<string, boolean>>(new Map())
const thinkingCollapsedMap = ref<Map<string, boolean>>(new Map())

const INITIAL_VISIBLE_COUNT = 50
const LOAD_MORE_COUNT = 50
const visibleMessagesCount = ref(INITIAL_VISIBLE_COUNT)

const visibleMessages = computed(() => {
	const msgs = chatMessages.value
	const total = msgs.length
	if (total <= visibleMessagesCount.value) return msgs
	return msgs.slice(total - visibleMessagesCount.value)
})

const hasMoreMessages = computed(() => chatMessages.value.length > visibleMessagesCount.value)

const onLoadMoreMessages = () => {
	visibleMessagesCount.value = Math.min(visibleMessagesCount.value + LOAD_MORE_COUNT, chatMessages.value.length)
}

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow' | 'model3d'
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	blenderSettings?: WorkflowBlenderNodeSettings | null
	inputParamPreviewRefs?: InputParamPreviewRef[]
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	isPrimarySelected?: boolean
	isSecondarySelected?: boolean
	visualStatus?: 'idle' | 'running' | 'error'
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
	nodeChatVisible?: boolean
	nodeChatNodeType?: WorkflowNodeChatType | null
	nodeChatDraft?: string
	nodeChatSubmitting?: boolean
	nodeChatParams?: Record<string, unknown>
	nodeGenerationTask?: WorkflowNodeGenerationTask | null
	anchorCompatibility?: Record<string, boolean | null>
	isLinking?: boolean
	sizeCustomized?: boolean
	autoHeight?: boolean
}>()

const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'update:worldPosition', p: { worldX: number; worldY: number }): void
	(e: 'select', nodeId: string): void
	(e: 'start-link', payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'copy'): void
	(e: 'refresh'): void
	(e: 'delete'): void
	(e: 'set-type', v: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy' | 'blender'): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(e: 'open-node-library'): void
	(e: 'auto-resize', height: number): void
	(e: 'node-chat-update-draft', value: string): void
	(e: 'node-chat-update-params', value: Record<string, unknown>): void
	(e: 'node-chat-close'): void
	(e: 'node-chat-submit', payload: WorkflowNodeChatSubmitPayload): void
	(e: 'node-chat-stop'): void
	(e: 'node-chat-remove-param-ref', item: InputParamPreviewRef): void
	(e: 'blender-connect', payload: { host: string; port: number }): void
	(e: 'blender-disconnect'): void
	(e: 'blender-import'): void
	(e: 'blender-mount-tools'): void
	(e: 'blender-status-click', payload: { host: string; port: number }): void
	(e: 'blender-clear-chat'): void
	(e: 'blender-open-workspace'): void
		(e: 'blender-init-workspace'): void
		(e: 'update-blender-settings', payload: Partial<WorkflowBlenderNodeSettings>): void
		(e: 'blender-compress-context'): void
	}>()

const onStartLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }) => {
	emit('start-link', payload)
}
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => {
	emit('end-link', payload)
}
const onSetType = (type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy' | 'blender') => {
	emit('set-type', type)
}
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => {
	emit('resize', payload)
}

const chatPanelRef = ref<HTMLElement | null>(null)
const baseRef = ref<InstanceType<typeof WorkflowNodeBase> | null>(null)

const DEFAULT_HOST = 'localhost'
const DEFAULT_PORT = 9876

const hostInput = ref(props.blenderSettings?.mcpHost ?? DEFAULT_HOST)
const portInput = ref(props.blenderSettings?.mcpPort ?? DEFAULT_PORT)
const blenderPathInput = ref(props.blenderSettings?.blenderPath ?? '')

const mcpStatus = computed(() => props.blenderSettings?.mcpStatus ?? 'unchecked')
const mcpError = computed(() => props.blenderSettings?.mcpError ?? null)
const importStatus = computed(() => props.blenderSettings?.importStatus ?? 'idle')
const importProgress = computed(() => props.blenderSettings?.importProgress ?? 0)
const importError = computed(() => props.blenderSettings?.importError ?? null)
const chatMessages = computed<WorkflowBlenderChatMessage[]>(() => props.blenderSettings?.chatMessages ?? [])
const chatContextUsage = computed(() => props.blenderSettings?.chatContextUsage ?? null)
const toolsReady = computed(() => props.blenderSettings?.toolsReady)
const workspacePath = computed(() => {
	const wp = (props.blenderSettings as Record<string, unknown> | null | undefined)?.workspacePath
	return typeof wp === 'string' ? wp : ''
})
const workspaceFolderName = computed(() => {
	if (!workspacePath.value) return ''
	const parts = workspacePath.value.split(/[\\/]/)
	return parts[parts.length - 1] || 'agent'
})
const isWorkspaceInitializing = ref(false)

const onOpenWorkspace = () => {
	emit('blender-open-workspace')
}

const onInitWorkspace = () => {
	if (isWorkspaceInitializing.value) return
	isWorkspaceInitializing.value = true
	emit('blender-init-workspace')
	setTimeout(() => {
		isWorkspaceInitializing.value = false
	}, 5000)
}

watch(() => workspacePath.value, (path) => {
	if (path) {
		isWorkspaceInitializing.value = false
	}
})

onMounted(() => {
	if (!workspacePath.value) {
		isWorkspaceInitializing.value = true
		emit('blender-init-workspace')
		setTimeout(() => {
			isWorkspaceInitializing.value = false
		}, 5000)
	}
})

const isConnected = computed(() => mcpStatus.value === 'connected')
const isImporting = computed(() => importStatus.value === 'downloading' || importStatus.value === 'importing')
const isResponding = computed(() => props.blenderSettings?.isResponding ?? false)
const showImportProgress = computed(() => importStatus.value !== 'idle')

const statusClass = computed(() => `is-${mcpStatus.value}`)

const statusText = computed(() => {
	const map: Record<string, string> = {
		unchecked: t('nodes.blender.status.unchecked'),
		checking: t('nodes.blender.status.checking'),
		'no-blender': t('nodes.blender.status.no-blender'),
		'no-addon': t('nodes.blender.status.no-addon'),
		'blender-not-running': t('nodes.blender.status.blender-not-running'),
		'addon-not-started': t('nodes.blender.status.addon-not-started'),
		disconnected: t('nodes.blender.status.disconnected'),
		connecting: t('nodes.blender.status.connecting'),
		connected: t('nodes.blender.status.connected'),
		error: t('nodes.blender.status.error')
	}
	return map[mcpStatus.value] ?? t('nodes.blender.status.unchecked')
})

const hintText = computed(() => {
	const map: Record<string, string | null> = {
		'no-blender': t('nodes.blender.hint.no-blender'),
		'no-addon': t('nodes.blender.hint.no-addon'),
		'blender-not-running': t('nodes.blender.hint.blender-not-running'),
		'addon-not-started': t('nodes.blender.hint.addon-not-started'),
		error: mcpError.value || null
	}
	return map[mcpStatus.value] ?? null
})

const canConnect = computed(() => {
	return mcpStatus.value !== 'connected' && mcpStatus.value !== 'connecting' && mcpStatus.value !== 'checking'
})

const isBusy = computed(() => mcpStatus.value === 'connecting' || mcpStatus.value === 'checking')

const connectBtnText = computed(() => {
	if (isConnected.value) return t('nodes.blender.btn.disconnect')
	return t('nodes.blender.btn.connect')
})

const importLabelText = computed(() => {
	const map: Record<string, string> = {
		downloading: t('nodes.blender.import.downloading'),
		importing: t('nodes.blender.import.importing'),
		completed: t('nodes.blender.import.completed'),
		error: t('nodes.blender.import.error')
	}
	return map[importStatus.value] ?? t('nodes.blender.import.idle')
})

const onHostPortChange = () => {
	const port = Number(portInput.value)
	const validPort = Number.isInteger(port) && port >= 1 && port <= 65535
	emit('update-blender-settings', {
		mcpHost: hostInput.value || DEFAULT_HOST,
		mcpPort: validPort ? port : undefined
	})
}

const onBlenderPathChange = () => {
	emit('update-blender-settings', {
		blenderPath: blenderPathInput.value.trim() || null
	})
}

const onBrowseBlender = async () => {
	try {
		const bridge = (window as any).dweb?.aiworkflow
		if (!bridge?.selectMediaFiles) return
		const result = await bridge.selectMediaFiles({
			filters: [{ name: 'Blender (blender.exe)', extensions: ['exe'] }]
		})
		const filePath = Array.isArray(result?.filePaths) ? result.filePaths[0] : null
		if (filePath) {
			blenderPathInput.value = filePath
			onBlenderPathChange()
		}
	} catch (err) {
		console.warn('[BlenderNode] Browse dialog failed:', err)
	}
}

const onToggleConnect = () => {
	onHostPortChange()
	if (isConnected.value) {
		emit('blender-disconnect')
	} else {
		const port = Number(portInput.value)
		const validPort = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT
		emit('blender-connect', {
			host: hostInput.value || DEFAULT_HOST,
			port: validPort
		})
	}
}

const onCompressContext = () => {
	emit('blender-compress-context')
}

const onMountTools = () => {
	onHostPortChange()
	emit('blender-mount-tools')
}

const onStatusClick = () => {
	onHostPortChange()
	emit('blender-status-click', {
		host: hostInput.value || DEFAULT_HOST,
		port: Number(portInput.value) || DEFAULT_PORT
	})
}

const roleLabel = (role: string) => {
	const map: Record<string, string> = {
		user: '你',
		assistant: 'AI',
		system: '系统'
	}
	return map[role] ?? role
}

const formatTokenCount = (n: number) => {
	if (!n || n < 0) return '0'
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
	return String(Math.round(n))
}

const formatToolName = (name?: string) => {
	if (!name) return '工具'
	if (name === 'blender_execute_code' || name === 'execute_blender_code') {
		return '执行Blender代码'
	}
	return name.replace(/_/g, ' ')
}

const onToggleToolMsg = (msg: WorkflowBlenderChatMessage) => {
	const current = collapsedMap.value.get(msg.id) ?? msg.collapsed ?? true
	collapsedMap.value.set(msg.id, !current)
}

const isMsgCollapsed = (msg: WorkflowBlenderChatMessage): boolean => {
	return collapsedMap.value.get(msg.id) ?? msg.collapsed ?? true
}

const onToggleThinking = (msg: WorkflowBlenderChatMessage) => {
	const current = thinkingCollapsedMap.value.get(msg.id) ?? msg.thinkingCollapsed ?? true
	thinkingCollapsedMap.value.set(msg.id, !current)
}

const isThinkingCollapsed = (msg: WorkflowBlenderChatMessage): boolean => {
	return thinkingCollapsedMap.value.get(msg.id) ?? msg.thinkingCollapsed ?? true
}

const formatToolResult = (result: unknown): string => {
	if (!result) return ''
	if (typeof result === 'string') {
		try {
			const parsed = JSON.parse(result)
			const parts: string[] = []
			if (parsed.stdout) parts.push(String(parsed.stdout))
			if (parsed.stderr) parts.push('stderr:\n' + String(parsed.stderr))
			if (parsed.result !== undefined) {
				const r = parsed.result
				parts.push(typeof r === 'string' ? r : JSON.stringify(r, null, 2))
			}
			if (parsed.content && Array.isArray(parsed.content)) {
				for (const c of parsed.content) {
					if (c && typeof c === 'object' && 'text' in c) {
						parts.push(String(c.text))
					}
				}
			}
			if (parts.length > 0) return parts.join('\n')
			return JSON.stringify(parsed, null, 2)
		} catch {
			return result
		}
	}
	try {
		return JSON.stringify(result, null, 2)
	} catch {
		return String(result)
	}
}

const scrollToBottom = () => {
	nextTick(() => {
		if (chatPanelRef.value) {
			chatPanelRef.value.scrollTop = chatPanelRef.value.scrollHeight
		}
	})
}

watch(
	() => props.blenderSettings?.mcpHost,
	(newHost) => {
		if (newHost != null && newHost !== hostInput.value) {
			hostInput.value = newHost
		}
	}
)

watch(
	() => props.blenderSettings?.mcpPort,
	(newPort) => {
		if (newPort != null) {
			const numPort = Number(newPort)
			if (!Number.isNaN(numPort) && numPort > 0 && numPort !== Number(portInput.value)) {
				portInput.value = numPort
			}
		}
	}
)

watch(
	() => props.blenderSettings?.blenderPath,
	(newPath) => {
		const v = newPath || ''
		if (v !== blenderPathInput.value) {
			blenderPathInput.value = v
		}
	}
)

// 新消息到达时自动滚动到底部
watch(
	() => chatMessages.value.length,
	() => {
		scrollToBottom()
	}
)

// 流式输出时自动滚动到底部
watch(
	() => {
		const msgs = chatMessages.value
		if (!msgs.length) return ''
		const last = msgs[msgs.length - 1]
		return `${last.id}:${last.content?.length ?? 0}:${last.isThinking ? 'thinking' : ''}:${last.role}`
	},
	() => {
		scrollToBottom()
	}
)

// 正在响应时也保持滚动
watch(
	() => isResponding.value,
	() => {
		scrollToBottom()
	}
)
</script>

<style scoped>
.wf-blender-body {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 6px 8px;
	width: 100%;
	flex: 1;
	min-height: 0;
	align-self: stretch;
	box-sizing: border-box;
	overflow: hidden;
}

.wf-blender-status-bar {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	border-radius: 0;
	cursor: pointer;
	font-size: 11px;
	user-select: none;
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

.wf-blender-status-dot.is-unchecked { background: #888; }
.wf-blender-status-dot.is-checking { background: #f0c040; animation: wf-blender-blink 1s infinite; }
.wf-blender-status-dot.is-no-blender,
.wf-blender-status-dot.is-no-addon,
.wf-blender-status-dot.is-error { background: #e74c3c; }
.wf-blender-status-dot.is-blender-not-running,
.wf-blender-status-dot.is-addon-not-started,
.wf-blender-status-dot.is-disconnected { background: #e87d0d; }
.wf-blender-status-dot.is-connecting { background: #f0c040; animation: wf-blender-blink 1s infinite; }
.wf-blender-status-dot.is-connected { background: #1f9d84; }

.wf-blender-status-text {
	color: var(--vscode-fg, #e0e0e0);
	flex: 1;
}

.wf-blender-status-error {
	color: #e74c3c;
	font-weight: bold;
	cursor: help;
}

.wf-blender-tools-indicator {
	font-size: 10px;
	font-weight: bold;
	flex-shrink: 0;
	width: 16px;
	text-align: center;
}

.wf-blender-tools-indicator.is-ready {
	color: #1f9d84;
}

.wf-blender-tools-indicator.is-not-ready {
	color: #e87d0d;
}

.wf-blender-tools-warning {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 10px;
	color: #e87d0d;
	line-height: 1.4;
	padding: 4px 8px;
	background: color-mix(in srgb, #e87d0d 8%, transparent);
	border-left: 2px solid #e87d0d;
	word-break: break-word;
}

.wf-blender-tools-warning-icon {
	flex-shrink: 0;
	font-size: 11px;
}

.wf-blender-tools-warning-text {
	flex: 1;
	min-width: 0;
}

.wf-blender-hint {
	flex-shrink: 0;
	font-size: 10px;
	color: var(--vscode-fg-muted, #888);
	line-height: 1.4;
	padding: 4px 8px;
	background: color-mix(in srgb, #f0c040 8%, transparent);
	border-left: 2px solid #f0c040;
	word-break: break-word;
}

.wf-blender-conn-config {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	border: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 25%, transparent);
	border-radius: 0;
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-conn-label {
	font-size: 10px;
	color: var(--vscode-fg-muted, #888);
	flex-shrink: 0;
}

.wf-blender-conn-input {
	flex: 1;
	min-width: 0;
	padding: 2px 6px;
	font-size: 11px;
	background: color-mix(in srgb, var(--vscode-input-background, rgba(255,255,255,0.1)) 90%, transparent);
	border: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 30%, transparent);
	color: var(--vscode-fg, #e0e0e0);
	border-radius: 0;
	outline: none;
}

.wf-blender-conn-input:focus {
	border-color: #1f9d84;
}

.wf-blender-conn-port {
	flex: 0 0 70px;
}

.wf-blender-path-config {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	border-top: none;
	border-left: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 25%, transparent);
	border-right: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 25%, transparent);
	border-bottom: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 25%, transparent);
	border-radius: 0;
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-path-input {
	flex: 1;
	min-width: 0;
	padding: 2px 6px;
	font-size: 11px;
	background: color-mix(in srgb, var(--vscode-input-background, rgba(255,255,255,0.1)) 90%, transparent);
	border: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 30%, transparent);
	color: var(--vscode-fg, #e0e0e0);
	border-radius: 0;
	outline: none;
	font-family: inherit;
}

.wf-blender-path-input:focus {
	border-color: #1f9d84;
}

.wf-blender-path-browse {
	flex-shrink: 0;
	width: 24px;
	height: 22px;
	padding: 0;
	font-size: 12px;
	line-height: 1;
	background: color-mix(in srgb, var(--vscode-button-background, #2d3238) 90%, transparent);
	border: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 30%, transparent);
	color: var(--vscode-fg, #e0e0e0);
	cursor: pointer;
	border-radius: 2px;
}

.wf-blender-path-browse:hover {
	background: #1f9d84;
	border-color: #1f9d84;
}

@keyframes wf-blender-blink {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.3; }
}

.wf-blender-chat-panel {
	flex: 1;
	min-height: 0;
	width: 100%;
	min-width: 0;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 4px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
	border: 1px solid color-mix(in srgb, #e87d0d 20%, transparent);
	border-radius: 0;
	box-sizing: border-box;
}

.wf-blender-chat-empty {
	color: var(--vscode-fg-muted, #888);
	font-size: 11px;
	text-align: center;
	padding: 12px 4px;
}

.wf-blender-load-more {
	text-align: center;
	font-size: 11px;
	color: #e87d0d;
	padding: 6px;
	cursor: pointer;
	user-select: none;
	border-radius: 3px;
	transition: background 0.15s;
}

.wf-blender-load-more:hover {
	background: rgba(232, 125, 13, 0.15);
}

.wf-blender-chat-msg {
	font-size: 11px;
	line-height: 1.4;
	max-width: 100%;
}

.wf-blender-chat-msg-bubble {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 4px 6px;
	border-radius: 0;
	max-width: 100%;
	width: 100%;
	box-sizing: border-box;
	word-break: break-word;
	overflow-wrap: break-word;
}

.wf-blender-chat-msg-role {
	font-size: 9px;
	text-transform: uppercase;
	color: var(--vscode-fg-muted, #888);
}

.wf-blender-chat-msg-content {
	color: var(--vscode-fg, #e0e0e0);
	word-break: break-word;
}

.wf-blender-chat-msg-user .wf-blender-chat-msg-bubble {
	background: color-mix(in srgb, #1f9d84 15%, transparent);
	border-left: 2px solid #1f9d84;
}

.wf-blender-chat-msg-assistant .wf-blender-chat-msg-bubble {
	background: color-mix(in srgb, #e87d0d 12%, transparent);
	border-left: 2px solid #e87d0d;
}

.wf-blender-chat-msg-system .wf-blender-chat-msg-bubble {
	background: color-mix(in srgb, #888 10%, transparent);
	border-left: 2px solid #888;
}

.wf-blender-chat-msg-system {
	padding: 3px 6px;
	background: color-mix(in srgb, #888 8%, transparent);
	border-left: 2px solid #888;
	font-size: 10px;
	color: var(--vscode-fg-muted, #888);
	max-width: 100%;
	box-sizing: border-box;
	word-break: break-word;
}

.wf-blender-tool-card {
	border: 1px solid color-mix(in srgb, #3b82f6 35%, transparent);
	background: color-mix(in srgb, #3b82f6 8%, transparent);
	border-left: 2px solid #3b82f6;
	max-width: 100%;
	box-sizing: border-box;
	cursor: pointer;
	user-select: none;
	transition: all 0.15s ease;
}

.wf-blender-tool-card:hover {
	border-color: #3b82f6;
	background: color-mix(in srgb, #3b82f6 14%, transparent);
}

.wf-blender-tool-card.is-running {
	border-color: #f0c040;
	border-left-color: #f0c040;
	background: color-mix(in srgb, #f0c040 8%, transparent);
}

.wf-blender-tool-card.is-running:hover {
	border-color: #f0c040;
}

.wf-blender-tool-card.is-error {
	border-color: #e74c3c;
	border-left-color: #e74c3c;
	background: color-mix(in srgb, #e74c3c 8%, transparent);
}

.wf-blender-tool-card.is-error:hover {
	border-color: #e74c3c;
}

.wf-blender-tool-header {
	display: flex;
	align-items: center;
	gap: 5px;
	padding: 4px 6px;
	font-size: 10px;
}

.wf-blender-tool-status-icon {
	flex-shrink: 0;
	width: 14px;
	text-align: center;
	font-size: 10px;
}

.wf-blender-tool-spinner {
	display: inline-block;
	width: 10px;
	height: 10px;
	border: 2px solid color-mix(in srgb, #f0c040 30%, transparent);
	border-top-color: #f0c040;
	border-radius: 50%;
	animation: wf-blender-spin 0.7s linear infinite;
	vertical-align: middle;
}

@keyframes wf-blender-spin {
	to { transform: rotate(360deg); }
}

.wf-blender-tool-name {
	font-weight: 600;
	color: #3b82f6;
	flex-shrink: 0;
}

.wf-blender-tool-card.is-running .wf-blender-tool-name {
	color: #f0c040;
}

.wf-blender-tool-card.is-error .wf-blender-tool-name {
	color: #e74c3c;
}

.wf-blender-tool-summary {
	flex: 1;
	min-width: 0;
	color: var(--vscode-fg-muted, #888);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 10px;
}

.wf-blender-tool-toggle {
	flex-shrink: 0;
	font-size: 8px;
	color: var(--vscode-fg-muted, #888);
	transition: transform 0.15s ease;
}

.wf-blender-tool-detail {
	padding: 4px 6px 6px;
	border-top: 1px solid color-mix(in srgb, #3b82f6 20%, transparent);
	user-select: text;
	cursor: text;
}

.wf-blender-tool-card.is-running .wf-blender-tool-detail {
	border-top-color: color-mix(in srgb, #f0c040 20%, transparent);
}

.wf-blender-tool-card.is-error .wf-blender-tool-detail {
	border-top-color: color-mix(in srgb, #e74c3c 20%, transparent);
}

.wf-blender-tool-detail-label {
	font-size: 9px;
	color: var(--vscode-fg-muted, #888);
	text-transform: uppercase;
	margin-bottom: 2px;
}

.wf-blender-tool-code-section,
.wf-blender-tool-error-section,
.wf-blender-tool-result-section {
	margin-top: 3px;
}

.wf-blender-tool-code,
.wf-blender-tool-error,
.wf-blender-tool-result {
	margin: 0;
	padding: 4px 6px;
	font-size: 10px;
	font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
	white-space: pre-wrap;
	word-break: break-all;
	line-height: 1.3;
	border-radius: 0;
	overflow: visible;
}

.wf-blender-tool-code {
	background: color-mix(in srgb, #3b82f6 6%, transparent);
	border-left: 2px solid #3b82f6;
	color: #93c5fd;
}

.wf-blender-tool-error {
	background: color-mix(in srgb, #e74c3c 8%, transparent);
	border-left: 2px solid #e74c3c;
	color: #fca5a5;
}

.wf-blender-tool-result {
	background: color-mix(in srgb, #1f9d84 6%, transparent);
	border-left: 2px solid #1f9d84;
	color: #6ee7b7;
}

.wf-blender-caret {
	display: inline-block;
	width: 6px;
	height: 12px;
	background: #e87d0d;
	margin-left: 2px;
	animation: wf-blender-caret-blink 0.8s step-end infinite;
	vertical-align: text-bottom;
}

@keyframes wf-blender-caret-blink {
	0%, 100% { opacity: 1; }
	50% { opacity: 0; }
}

.is-streaming {
	/* no extra style needed, caret indicator handles it */
}

.wf-blender-thinking-indicator {
	display: inline-flex;
	gap: 3px;
	align-items: center;
	padding: 2px 0;
}

.wf-blender-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: #e87d0d;
	animation: wf-blender-dot-bounce 1.2s ease-in-out infinite;
}

.wf-blender-dot:nth-child(2) { animation-delay: 0.15s; }
.wf-blender-dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes wf-blender-dot-bounce {
	0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
	40% { transform: scale(1); opacity: 1; }
}

.wf-blender-import-progress {
	flex-shrink: 0;
	padding: 4px 6px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	border: 1px solid color-mix(in srgb, #1f9d84 30%, transparent);
	border-radius: 0;
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-import-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 10px;
	margin-bottom: 3px;
}

.wf-blender-import-label {
	color: var(--vscode-fg, #e0e0e0);
}

.wf-blender-import-percent {
	color: #1f9d84;
	font-weight: bold;
}

.wf-blender-import-bar-container {
	height: 4px;
	background: rgba(255, 255, 255, 0.1);
	overflow: hidden;
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-import-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, #1f9d84, #2eb8a3);
	transition: width 0.3s ease;
}

.wf-blender-import-bar-fill.is-error {
	background: #e74c3c;
}

.wf-blender-import-bar-fill.is-done {
	background: #22c55e;
}

.wf-blender-import-error {
	color: #e74c3c;
	font-size: 10px;
	margin-top: 2px;
}

.wf-blender-token-indicator {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 3px 8px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-token-bar-container {
	flex: 1;
	height: 3px;
	background: rgba(255, 255, 255, 0.08);
	overflow: hidden;
	border-radius: 2px;
}

.wf-blender-token-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, #3b82f6, #60a5fa);
	transition: width 0.4s ease, background 0.3s ease;
	border-radius: 2px;
}

.wf-blender-token-bar-fill.is-warn {
	background: linear-gradient(90deg, #f59e0b, #fbbf24);
}

.wf-blender-token-bar-fill.is-high {
	background: linear-gradient(90deg, #ef4444, #f87171);
}

.wf-blender-token-bar-fill.is-truncated {
	background: linear-gradient(90deg, #8b5cf6, #a78bfa);
}

.wf-blender-token-label {
	font-size: 9px;
	color: var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.5));
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}

.wf-blender-token-compress-btn {
	flex-shrink: 0;
	width: 20px;
	height: 16px;
	padding: 0;
	font-size: 10px;
	line-height: 1;
	background: transparent;
	border: 1px solid color-mix(in srgb, var(--vscode-fg-muted, #888) 40%, transparent);
	color: var(--vscode-fg-muted, #888);
	cursor: pointer;
	border-radius: 2px;
	transition: all 0.15s ease;
	display: flex;
	align-items: center;
	justify-content: center;
}

.wf-blender-token-compress-btn:hover:not(:disabled) {
	border-color: #8b5cf6;
	color: #8b5cf6;
	background: color-mix(in srgb, #8b5cf6 10%, transparent);
}

.wf-blender-token-compress-btn:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.wf-blender-workspace-indicator {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 96%, transparent);
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-workspace-icon {
	font-size: 11px;
	flex-shrink: 0;
}

.wf-blender-workspace-path {
	flex: 1;
	font-size: 10px;
	color: var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.6));
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: monospace;
}

.wf-blender-workspace-open-btn {
	flex-shrink: 0;
	padding: 2px 8px;
	font-size: 10px;
	border: 1px solid color-mix(in srgb, #10b981 50%, transparent);
	background: color-mix(in srgb, #10b981 15%, transparent);
	color: #10b981;
	border-radius: 2px;
	cursor: pointer;
	transition: all 0.15s ease;
}

.wf-blender-workspace-open-btn:hover {
	background: color-mix(in srgb, #10b981 30%, transparent);
	border-color: #10b981;
}

.wf-blender-workspace-path-placeholder {
	color: var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.35));
	font-style: italic;
}

.wf-blender-workspace-init-btn {
	border-color: color-mix(in srgb, #f59e0b 50%, transparent);
	background: color-mix(in srgb, #f59e0b 15%, transparent);
	color: #f59e0b;
}

.wf-blender-workspace-init-btn:hover:not(:disabled) {
	background: color-mix(in srgb, #f59e0b 30%, transparent);
	border-color: #f59e0b;
}

.wf-blender-workspace-init-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.wf-blender-footer {
	padding: 6px 8px;
	width: 100%;
	box-sizing: border-box;
}

.wf-blender-toolbar {
	display: flex;
	gap: 4px;
	flex-wrap: wrap;
	width: 100%;
}

.wf-blender-btn {
	flex: 1;
	min-width: 0;
	padding: 4px 6px;
	font-size: 11px;
	border: 1px solid color-mix(in srgb, #e87d0d 50%, transparent);
	background: color-mix(in srgb, #e87d0d 15%, transparent);
	color: #e87d0d;
	border-radius: 0;
	cursor: pointer;
	transition: all 0.15s ease;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.wf-blender-btn:hover:not(:disabled) {
	background: color-mix(in srgb, #e87d0d 25%, transparent);
	border-color: #e87d0d;
}

.wf-blender-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.wf-blender-btn.is-connected {
	border-color: color-mix(in srgb, #1f9d84 50%, transparent);
	background: color-mix(in srgb, #1f9d84 15%, transparent);
	color: #1f9d84;
}

.wf-blender-btn.tools {
	border-color: color-mix(in srgb, #3b82f6 50%, transparent);
	background: color-mix(in srgb, #3b82f6 15%, transparent);
	color: #3b82f6;
}

.wf-blender-btn.tools:hover:not(:disabled) {
	background: color-mix(in srgb, #3b82f6 25%, transparent);
	border-color: #3b82f6;
}

.wf-blender-btn.ghost {
	border-color: color-mix(in srgb, var(--vscode-fg-muted, #888) 40%, transparent);
	background: transparent;
	color: var(--vscode-fg-muted, #888);
}

.wf-blender-btn.ghost:hover:not(:disabled) {
	border-color: var(--vscode-fg-muted, #888);
	color: var(--vscode-fg, #e0e0e0);
}

.wf-blender-thinking-card {
	margin: 4px 0;
	border: 1px solid color-mix(in srgb, #8b5cf6 35%, transparent);
	background: color-mix(in srgb, #8b5cf6 8%, transparent);
	border-left: 2px solid #8b5cf6;
	border-radius: 0;
	max-width: 100%;
	box-sizing: border-box;
}

.wf-blender-thinking-card.is-streaming {
	border-color: color-mix(in srgb, #8b5cf6 50%, transparent);
	animation: wf-blender-thinking-pulse 1.5s ease-in-out infinite;
}

@keyframes wf-blender-thinking-pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.7; }
}

.wf-blender-thinking-header {
	display: flex;
	align-items: center;
	gap: 5px;
	padding: 3px 6px;
	font-size: 10px;
	cursor: pointer;
	user-select: none;
}

.wf-blender-thinking-icon {
	font-size: 11px;
}

.wf-blender-thinking-label {
	font-weight: 600;
	color: #a78bfa;
	flex-shrink: 0;
}

.wf-blender-thinking-content {
	padding: 4px 6px 6px;
	border-top: 1px solid color-mix(in srgb, #8b5cf6 20%, transparent);
	user-select: text;
	cursor: text;
}

.wf-blender-thinking-text {
	margin: 0;
	padding: 4px 6px;
	font-size: 10px;
	font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
	white-space: pre-wrap;
	word-break: break-all;
	line-height: 1.3;
	border-radius: 0;
	background: color-mix(in srgb, #8b5cf6 6%, transparent);
	border-left: 2px solid #8b5cf6;
	color: #c4b5fd;
	font-style: italic;
	opacity: 0.85;
	overflow: visible;
}

.wf-blender-command-card {
	border: 1px solid color-mix(in srgb, #6b7280 35%, transparent);
	background: color-mix(in srgb, #6b7280 8%, transparent);
	border-left: 2px solid #6b7280;
	max-width: 100%;
	box-sizing: border-box;
}

.wf-blender-command-card.is-running {
	border-color: color-mix(in srgb, #f0c040 50%, transparent);
	border-left-color: #f0c040;
	background: color-mix(in srgb, #f0c040 8%, transparent);
}

.wf-blender-command-card.is-error {
	border-color: color-mix(in srgb, #e74c3c 50%, transparent);
	border-left-color: #e74c3c;
	background: color-mix(in srgb, #e74c3c 8%, transparent);
}

.wf-blender-command-name {
	color: #9ca3af !important;
}

.wf-blender-command-card.is-running .wf-blender-command-name {
	color: #f0c040 !important;
}

.wf-blender-command-card.is-error .wf-blender-command-name {
	color: #e74c3c !important;
}
</style>
