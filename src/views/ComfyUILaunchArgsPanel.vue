<template>
	<div class="comfy-launch-args-panel">
		<div class="sc-panel-frame" aria-hidden="true">
			<span class="corner tl"></span>
			<span class="corner tr"></span>
			<span class="corner bl"></span>
			<span class="corner br"></span>
		</div>

		<div class="clp-header">
			<div class="clp-title">
				<span class="clp-title-dot"></span>
				启动参数
			</div>
			<p class="clp-desc">
				配置 ComfyUI 启动时的命令行参数。点击快捷标签可快速添加常用参数，也可手动输入任意参数。
			</p>
		</div>

		<div class="clp-content">
			<div class="clp-tags-section">
				<div class="clp-section-label">快捷标签</div>
				<div class="clp-tags-row">
					<button
						v-for="tag in coreTags"
						:key="tag.key"
						class="clp-tag-btn"
						:class="{ active: isTagActive(tag.arg) }"
						:title="tag.description"
						@click="toggleTag(tag.arg)"
					>
						<span class="clp-tag-check" v-if="isTagActive(tag.arg)">✓</span>
						<span class="clp-tag-label">{{ tag.label }}</span>
						<span class="clp-tag-arg">{{ tag.arg }}</span>
					</button>
				</div>
			</div>

			<div class="clp-input-section">
				<div class="clp-section-label">
					<span>参数文本</span>
					<span class="clp-hint">（空格分隔，支持手动输入任意参数）</span>
				</div>
				<textarea
					v-model="argsText"
					class="clp-textarea"
					placeholder="例如：--disable-cuda-malloc --enable-manager"
					:disabled="isSaving"
					@input="onTextInput"
				></textarea>
			</div>

			<div class="clp-actions">
				<div class="clp-status" :class="saveStatus">
					<span v-if="saveStatus === 'saved'">✓ 已保存</span>
					<span v-else-if="saveStatus === 'saving'">保存中…</span>
					<span v-else-if="saveStatus === 'error'">✗ 保存失败</span>
					<span v-else>{{ parsedArgs.length }} 个参数</span>
				</div>
				<button class="sc-btn sc-btn-primary" :disabled="isSaving || !dirty" @click="saveArgs">
					<span v-if="!isSaving">保存配置</span>
					<span v-else>保存中…</span>
				</button>
			</div>

			<div v-if="parsedArgs.length > 0" class="clp-preview">
				<div class="clp-section-label">当前生效参数</div>
				<div class="clp-preview-chips">
					<span v-for="(arg, idx) in parsedArgs" :key="idx" class="clp-chip">{{ arg }}</span>
				</div>
			</div>

			<div class="clp-tips">
				<div class="clp-tip-title">💡 提示</div>
				<ul class="clp-tip-list">
					<li>
						<code>--enable-manager</code>
						：启用 ComfyUI-Manager 菜单（需先在「终端」标签页按向导安装 Manager 扩展）
					</li>
					<li>
						<code>--disable-cuda-malloc</code>
						：禁用 CUDA 显存分配策略（DVStudio 默认启用，解决部分显存问题）
					</li>
					<li>
						添加
						<code>--enable-manager</code>
						前请先在终端面板完成 Manager 扩展安装
					</li>
					<li>修改参数后需重启 ComfyUI 服务生效</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

interface CoreTag {
	key: string
	arg: string
	label: string
	description?: string
}

const dweb = (window as any).dweb
const comfySetup = dweb?.comfyui?.setup
const launchArgsApi = comfySetup?.launchArgs

const coreTags = ref<CoreTag[]>([])
const argsText = ref('')
const savedText = ref('')
const isSaving = ref(false)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

const dirty = computed(() => argsText.value.trim() !== savedText.value.trim())

const parsedArgs = computed(() => {
	const text = argsText.value.trim()
	if (!text) return []
	return text.split(/[\s,]+/).filter((t) => t && t.trim())
})

function isTagActive(arg: string) {
	return parsedArgs.value.includes(arg)
}

function toggleTag(arg: string) {
	const current = new Set(parsedArgs.value)
	if (current.has(arg)) {
		current.delete(arg)
	} else {
		current.add(arg)
	}
	argsText.value = Array.from(current).join(' ')
	onTextInput()
}

function onTextInput() {
	if (saveStatus.value === 'saved') {
		saveStatus.value = 'idle'
	}
}

async function loadCoreTags() {
	if (!launchArgsApi?.getCoreTags) return
	try {
		const result = await launchArgsApi.getCoreTags()
		if (Array.isArray(result)) {
			coreTags.value = result
		} else if (result?.ok && Array.isArray(result.tags)) {
			coreTags.value = result.tags
		}
	} catch (err) {
		console.warn('[LaunchArgs] Failed to load core tags:', err)
	}
}

async function loadCurrentArgs() {
	if (!launchArgsApi?.getCurrent) return
	try {
		const result = await launchArgsApi.getCurrent()
		const text = result?.text || result?.launchArgsText || ''
		argsText.value = text
		savedText.value = text
	} catch (err) {
		console.warn('[LaunchArgs] Failed to load current args:', err)
	}
}

async function saveArgs() {
	if (isSaving.value || !launchArgsApi?.save) return
	isSaving.value = true
	saveStatus.value = 'saving'

	try {
		const result = await launchArgsApi.save({ text: argsText.value })
		if (result?.ok) {
			savedText.value = argsText.value
			saveStatus.value = 'saved'
			setTimeout(() => {
				if (saveStatus.value === 'saved') saveStatus.value = 'idle'
			}, 2000)
		} else {
			saveStatus.value = 'error'
		}
	} catch (err) {
		saveStatus.value = 'error'
		console.error('[LaunchArgs] Save failed:', err)
	} finally {
		isSaving.value = false
	}
}

onMounted(() => {
	loadCoreTags()
	loadCurrentArgs()
})
</script>

<style scoped>
.comfy-launch-args-panel {
	position: relative;
	padding: 18px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 60%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 80%, transparent)
	);
	border: 1px solid var(--pl-card-border);
	border-radius: 2px;
	box-shadow:
		0 2px 10px rgba(0, 0, 0, 0.25),
		inset 0 1px 0 color-mix(in srgb, var(--pl-accent) 22%, transparent);
	display: flex;
	flex-direction: column;
	gap: 16px;
	flex: 1;
	min-height: 0;
	overflow-y: auto;
}

.sc-panel-frame {
	position: absolute;
	inset: 0;
	pointer-events: none;
}
.sc-panel-frame .corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: var(--pl-accent);
}
.sc-panel-frame .corner.tl {
	top: 4px;
	left: 4px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-panel-frame .corner.tr {
	top: 4px;
	right: 4px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-panel-frame .corner.bl {
	bottom: 4px;
	left: 4px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}
.sc-panel-frame .corner.br {
	bottom: 4px;
	right: 4px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.clp-header {
	flex-shrink: 0;
}
.clp-title {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 15px;
	font-weight: 700;
	color: var(--pl-fg);
	text-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 30%, transparent);
}
.clp-title-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
}
.clp-desc {
	margin: 6px 0 0;
	font-size: 12px;
	color: var(--pl-fg-soft);
}

.clp-content {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.clp-section-label {
	font-size: 11px;
	letter-spacing: 0.08em;
	color: var(--pl-accent);
	text-transform: uppercase;
	margin-bottom: 8px;
	display: flex;
	align-items: center;
	gap: 8px;
}
.clp-hint {
	font-size: 10px;
	color: var(--pl-fg-soft);
	text-transform: none;
	letter-spacing: 0;
}

.clp-tags-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.clp-tag-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 8px 14px;
	font-size: 12px;
	cursor: pointer;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg-soft) 25%, transparent);
	transition: all 200ms ease;
}
.clp-tag-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 40%, transparent);
	color: var(--pl-fg);
}
.clp-tag-btn.active {
	background: color-mix(in srgb, var(--pl-accent) 18%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	color: var(--pl-fg);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}
.clp-tag-check {
	color: var(--pl-accent);
	font-weight: 700;
	font-size: 11px;
}
.clp-tag-label {
	font-weight: 500;
}
.clp-tag-arg {
	font-size: 10px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	color: var(--pl-fg-soft);
	padding: 1px 6px;
	background: color-mix(in srgb, #000 30%, transparent);
	border-radius: 2px;
}
.clp-tag-btn.active .clp-tag-arg {
	color: var(--pl-accent);
}

.clp-textarea {
	width: 100%;
	min-height: 100px;
	padding: 12px;
	font-size: 12px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	background: color-mix(in srgb, #000 40%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	border-radius: 2px;
	color: var(--pl-fg);
	outline: none;
	resize: vertical;
	line-height: 1.6;
	transition: border-color 200ms ease;
	box-sizing: border-box;
}
.clp-textarea:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}
.clp-textarea::placeholder {
	color: color-mix(in srgb, var(--pl-fg-soft) 50%, transparent);
}
.clp-textarea:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.clp-actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}
.clp-status {
	font-size: 11px;
	color: var(--pl-fg-soft);
}
.clp-status.saved {
	color: #66ff99;
}
.clp-status.saving {
	color: #ffd166;
}
.clp-status.error {
	color: #ff6b6b;
}

.sc-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 34px;
	padding: 0 14px;
	font-size: 12px;
	letter-spacing: 0.04em;
	cursor: pointer;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	color: var(--pl-fg);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	transition:
		border-color 200ms ease,
		background 200ms ease,
		box-shadow 200ms ease;
}
.sc-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, var(--pl-accent) 22%, transparent);
}
.sc-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.sc-btn-primary {
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-accent) 30%, transparent),
		color-mix(in srgb, var(--pl-accent) 15%, transparent)
	);
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	color: #fff;
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.clp-preview-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.clp-chip {
	font-size: 11px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	padding: 4px 10px;
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	border-radius: 2px;
	color: var(--pl-accent);
}

.clp-tips {
	margin-top: 8px;
	padding: 12px 14px;
	background: color-mix(in srgb, var(--pl-cold) 6%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-cold) 20%, transparent);
	border-radius: 2px;
}
.clp-tip-title {
	font-size: 11px;
	color: var(--pl-cold);
	margin-bottom: 8px;
}
.clp-tip-list {
	margin: 0;
	padding-left: 18px;
	font-size: 11px;
	color: var(--pl-fg-soft);
	line-height: 1.7;
}
.clp-tip-list code {
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	padding: 1px 6px;
	background: color-mix(in srgb, #000 30%, transparent);
	border-radius: 2px;
	color: var(--pl-fg);
	font-size: 10px;
}
</style>
