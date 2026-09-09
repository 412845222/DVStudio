<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue'
import { useDirectorConsoleChat, type UploadedAttachment } from './useDirectorConsoleChat'
import DirectorConsoleEnvCheck from './DirectorConsoleEnvCheck.vue'

const {
	messages,
	isLoading,
	isStreaming,
	serviceReady,
	checkServiceReady,
	sendMessage,
	stopStreaming,
	clearChat,
	toggleThinkingCollapsed
} = useDirectorConsoleChat()

const inputText = ref('')
const attachments = ref<UploadedAttachment[]>([])
const messagesContainer = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

// 环境检查状态：未就绪时显示 EnvCheck 组件，就绪后才显示聊天内容
const envReady = ref(false)

function onEnvReady() {
	envReady.value = true
	// 环境就绪后再启动服务状态检查与轮询
	checkServiceReady()
	pollTimer = setInterval(() => {
		if (!serviceReady.value) checkServiceReady()
	}, 5000)
}

onUnmounted(() => {
	if (pollTimer) {
		clearInterval(pollTimer)
		pollTimer = null
	}
})

async function onSend() {
	const text = inputText.value.trim()
	if (!text && attachments.value.length === 0) return
	await sendMessage(text, attachments.value)
	inputText.value = ''
	attachments.value = []
	await nextTick()
	scrollToBottom()
}

function onStop() {
	stopStreaming()
}

function onClear() {
	clearChat()
}

function scrollToBottom() {
	if (messagesContainer.value) {
		messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
	}
}

/** 选择文件（文本/图片等） */
function onFileSelected(e: Event) {
	const input = e.target as HTMLInputElement
	const files = input.files
	if (!files) return
	for (const file of Array.from(files)) {
		readFileAsAttachment(file)
	}
	input.value = ''
}

/** 选择图片 */
function onImageSelected(e: Event) {
	const input = e.target as HTMLInputElement
	const files = input.files
	if (!files) return
	for (const file of Array.from(files)) {
		readFileAsAttachment(file)
	}
	input.value = ''
}

function readFileAsAttachment(file: File) {
	const reader = new FileReader()
	reader.onload = () => {
		attachments.value.push({
			name: file.name,
			type: file.type,
			size: file.size,
			dataUrl: reader.result as string
		})
	}
	reader.readAsDataURL(file)
}

function removeAttachment(idx: number) {
	attachments.value.splice(idx, 1)
}

function formatToolName(name: string): string {
	return name.replace('dc_', '').replace(/_/g, ' ')
}

function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault()
		onSend()
	}
}
</script>

<template>
	<div class="dc-chat-panel">
		<!-- 头部 -->
		<div class="dc-chat-header">
			<span class="dc-chat-title">Agent 分镜助手</span>
			<button v-if="envReady" class="dc-chat-clear-btn" @click="onClear" title="清空对话">
				清空
			</button>
		</div>

		<!-- 环境检查未就绪：显示检查面板 -->
		<DirectorConsoleEnvCheck v-if="!envReady" @all-ready="onEnvReady" />

		<!-- 环境就绪后显示聊天内容 -->
		<template v-else>
			<!-- 服务未就绪提示 -->
			<div v-if="!serviceReady" class="dc-chat-notice">
				DeepSeek-Harness 服务未运行，请先在服务页启动。
			</div>

			<!-- 消息列表 -->
			<div ref="messagesContainer" class="dc-chat-messages">
				<div v-for="msg in messages" :key="msg.id" :class="['dc-chat-msg', msg.role]">
					<!-- 用户消息 -->
					<template v-if="msg.role === 'user'">
						<div v-if="msg.images?.length" class="dc-chat-user-images">
							<img v-for="(img, i) in msg.images" :key="i" :src="img" class="dc-chat-thumb" />
						</div>
						<div v-if="msg.content" class="dc-chat-bubble">{{ msg.content }}</div>
					</template>

					<!-- 助手消息 -->
					<template v-else>
						<!-- 思考过程块（流式展示 reasoning-delta） -->
						<div
							v-if="msg.thinkingContent"
							class="dc-chat-thinking"
							@click="toggleThinkingCollapsed(msg.id)"
						>
							<div class="dc-chat-thinking-header">
								<span class="dc-chat-thinking-title">
									{{ msg.isStreamingThinking ? '思考中...' : '已思考' }}
								</span>
								<span class="dc-chat-thinking-toggle">
									{{ msg.thinkingCollapsed ? '展开' : '收起' }}
								</span>
							</div>
							<div v-show="!msg.thinkingCollapsed" class="dc-chat-thinking-content">
								{{ msg.thinkingContent }}
							</div>
						</div>

						<div v-if="msg.content" class="dc-chat-bubble">{{ msg.content }}</div>
						<div v-if="msg.status === 'streaming'" class="dc-chat-cursor">▍</div>
						<!-- 工具调用记录 -->
						<div v-if="msg.toolCalls?.length" class="dc-chat-tools">
							<div
								v-for="tc in msg.toolCalls"
								:key="tc.toolCallId"
								:class="['dc-chat-tool', tc.status]"
							>
								<span class="dc-chat-tool-icon">
									{{ tc.status === 'running' ? '⏳' : tc.status === 'done' ? '✅' : '❌' }}
								</span>
								<span class="dc-chat-tool-name">{{ formatToolName(tc.tool) }}</span>
								<span v-if="tc.error" class="dc-chat-tool-err">{{ tc.error }}</span>
							</div>
						</div>
					</template>
				</div>
				<div v-if="messages.length === 0" class="dc-chat-empty">
					输入剧本或上传参考图，Agent 将自动搭建分镜
				</div>
			</div>

			<!-- 附件预览 -->
			<div v-if="attachments.length" class="dc-chat-attachments">
				<div v-for="(att, i) in attachments" :key="i" class="dc-chat-att">
					<span v-if="att.type.startsWith('image/')" class="dc-chat-att-icon">🖼️</span>
					<span v-else class="dc-chat-att-icon">📄</span>
					<span class="dc-chat-att-name">{{ att.name }}</span>
					<button class="dc-chat-att-remove" @click="removeAttachment(i)">×</button>
				</div>
			</div>

			<!-- 输入区 -->
			<div class="dc-chat-input-area">
				<button class="dc-chat-upload-btn" title="上传文件" @click="fileInputRef?.click()">
					📎
				</button>
				<input
					ref="fileInputRef"
					type="file"
					class="dc-chat-hidden-input"
					multiple
					accept=".txt,.md,.json,.csv,image/*"
					@change="onFileSelected"
				/>
				<button class="dc-chat-upload-btn" title="上传图片" @click="imageInputRef?.click()">
					🖼️
				</button>
				<input
					ref="imageInputRef"
					type="file"
					class="dc-chat-hidden-input"
					multiple
					accept="image/*"
					@change="onImageSelected"
				/>
				<textarea
					v-model="inputText"
					class="dc-chat-input"
					placeholder="输入剧本描述，或上传剧本文件/参考图…"
					rows="2"
					@keydown="onKeydown"
				/>
				<button
					v-if="!isStreaming"
					class="dc-chat-send-btn"
					:disabled="isLoading || (!inputText.trim() && attachments.length === 0)"
					@click="onSend"
				>
					发送
				</button>
				<button v-else class="dc-chat-stop-btn" @click="onStop">停止</button>
			</div>
		</template>
	</div>
</template>

<style scoped>
.dc-chat-panel {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--dc-bg-soft, #1a1d24);
	border-top: 1px solid var(--dc-border, #2a2d36);
}
.dc-chat-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 12px;
	border-bottom: 1px solid var(--dc-border, #2a2d36);
	flex-shrink: 0;
}
.dc-chat-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--dc-text, #e0e0e0);
}
.dc-chat-clear-btn {
	font-size: 11px;
	padding: 2px 8px;
	background: transparent;
	border: 1px solid var(--dc-border, #3a3d46);
	border-radius: 4px;
	color: var(--dc-text-muted, #999);
	cursor: pointer;
}
.dc-chat-clear-btn:hover {
	color: var(--dc-text, #e0e0e0);
}
.dc-chat-notice {
	padding: 8px 12px;
	font-size: 11px;
	color: #e0a040;
	background: rgba(224, 160, 64, 0.1);
	border-bottom: 1px solid var(--dc-border, #2a2d36);
	flex-shrink: 0;
}
.dc-chat-messages {
	flex: 1;
	overflow-y: auto;
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-height: 0;
}
.dc-chat-msg {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.dc-chat-msg.user {
	align-items: flex-end;
}
.dc-chat-msg.assistant {
	align-items: flex-start;
}
.dc-chat-bubble {
	max-width: 92%;
	padding: 8px 10px;
	border-radius: 8px;
	font-size: 12px;
	line-height: 1.5;
	word-break: break-word;
	white-space: pre-wrap;
}
.dc-chat-msg.user .dc-chat-bubble {
	background: var(--dc-accent, #4a7dff);
	color: #fff;
}
.dc-chat-msg.assistant .dc-chat-bubble {
	background: var(--dc-bg-card, #252830);
	color: var(--dc-text, #e0e0e0);
}
.dc-chat-cursor {
	color: var(--dc-accent, #4a7dff);
	font-size: 12px;
	animation: blink 1s steps(2) infinite;
}
@keyframes blink {
	50% {
		opacity: 0;
	}
}
.dc-chat-user-images {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}
.dc-chat-thumb {
	width: 48px;
	height: 48px;
	object-fit: cover;
	border-radius: 4px;
}
.dc-chat-tools {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.dc-chat-tool {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	background: rgba(74, 125, 255, 0.1);
	border-radius: 4px;
	font-size: 11px;
	color: var(--dc-text, #e0e0e0);
}
.dc-chat-tool.error {
	background: rgba(255, 80, 80, 0.1);
}
.dc-chat-tool-name {
	font-weight: 500;
	text-transform: capitalize;
}
.dc-chat-tool-err {
	color: #ff6b6b;
	font-size: 10px;
}
.dc-chat-empty {
	text-align: center;
	color: var(--dc-text-muted, #666);
	font-size: 12px;
	padding: 20px 10px;
}
.dc-chat-thinking {
	max-width: 92%;
	padding: 6px 10px;
	background: rgba(138, 92, 255, 0.08);
	border-left: 2px solid rgba(138, 92, 255, 0.4);
	border-radius: 4px;
	font-size: 11px;
	color: var(--dc-text-muted, #999);
	cursor: pointer;
}
.dc-chat-thinking-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.dc-chat-thinking-title {
	font-weight: 500;
	color: rgba(178, 142, 255, 0.9);
}
.dc-chat-thinking-toggle {
	font-size: 10px;
	color: var(--dc-text-muted, #666);
}
.dc-chat-thinking-content {
	margin-top: 4px;
	white-space: pre-wrap;
	line-height: 1.5;
	max-height: 200px;
	overflow-y: auto;
}
.dc-chat-attachments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding: 6px 10px;
	border-top: 1px solid var(--dc-border, #2a2d36);
	flex-shrink: 0;
}
.dc-chat-att {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 3px 8px;
	background: var(--dc-bg-card, #252830);
	border-radius: 4px;
	font-size: 11px;
	color: var(--dc-text, #e0e0e0);
}
.dc-chat-att-name {
	max-width: 100px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.dc-chat-att-remove {
	background: none;
	border: none;
	color: var(--dc-text-muted, #999);
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
}
.dc-chat-input-area {
	display: flex;
	align-items: flex-end;
	gap: 6px;
	padding: 8px 10px;
	border-top: 1px solid var(--dc-border, #2a2d36);
	flex-shrink: 0;
}
.dc-chat-upload-btn {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: 1px solid var(--dc-border, #3a3d46);
	border-radius: 4px;
	cursor: pointer;
	font-size: 14px;
	flex-shrink: 0;
}
.dc-chat-upload-btn:hover {
	border-color: var(--dc-accent, #4a7dff);
}
.dc-chat-hidden-input {
	display: none;
}
.dc-chat-input {
	flex: 1;
	min-height: 36px;
	max-height: 80px;
	padding: 8px 10px;
	background: var(--dc-bg-card, #252830);
	border: 1px solid var(--dc-border, #3a3d46);
	border-radius: 4px;
	color: var(--dc-text, #e0e0e0);
	font-size: 12px;
	font-family: inherit;
	resize: none;
	outline: none;
}
.dc-chat-input:focus {
	border-color: var(--dc-accent, #4a7dff);
}
.dc-chat-send-btn,
.dc-chat-stop-btn {
	height: 36px;
	padding: 0 14px;
	border: none;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
	flex-shrink: 0;
}
.dc-chat-send-btn {
	background: var(--dc-accent, #4a7dff);
	color: #fff;
}
.dc-chat-send-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
.dc-chat-stop-btn {
	background: #e05050;
	color: #fff;
}
</style>
