<template>
	<div class="seedance-form">
		<div class="seedance-field">
			<div class="seedance-label">模型</div>
			<select
				class="seedance-input"
				:disabled="sending"
				:value="config.model"
				@change="onModelChange"
			>
				<option v-for="item in videoModelOptions" :key="item.value" :value="item.value">
					{{ item.label }}
				</option>
			</select>
			<div class="seedance-hint">
				{{ modelHint }}
			</div>
		</div>

		<div class="seedance-grid">
			<div class="seedance-field">
				<div class="seedance-label">时长</div>
				<select
					class="seedance-input"
					:disabled="sending"
					:value="String(config.duration)"
					@change="onDurationChange"
				>
					<option v-for="d in durationOptions" :key="d" :value="d">{{ d }}s</option>
				</select>
				<div class="seedance-hint">{{ durationHint }}</div>
			</div>

			<div class="seedance-field">
				<div class="seedance-label">分辨率</div>
				<select
					class="seedance-input"
					:disabled="sending"
					:value="config.resolution"
					@change="onResolutionChange"
				>
					<option value="">模型默认</option>
					<option v-for="value in resolutionOptions" :key="value" :value="value">
						{{ value }}
					</option>
				</select>
			</div>

			<div class="seedance-field">
				<div class="seedance-label">画幅比例</div>
				<select
					class="seedance-input"
					:disabled="sending"
					:value="config.ratio"
					@change="onRatioChange"
				>
					<option value="adaptive">adaptive</option>
					<option value="16:9">16:9</option>
					<option value="9:16">9:16</option>
					<option value="1:1">1:1</option>
					<option value="4:3">4:3</option>
					<option value="3:4">3:4</option>
					<option value="21:9">21:9</option>
				</select>
			</div>

			<div class="seedance-field">
				<div class="seedance-label">参考素材模式</div>
				<select
					class="seedance-input"
					:disabled="sending"
					:value="config.refMode"
					@change="onRefModeChange"
				>
					<option value="auto">自动判断</option>
					<option value="first">首帧约束</option>
					<option value="first-last">首尾帧约束</option>
					<option value="reference">多图参考</option>
				</select>
				<div class="seedance-hint">
					提示词里请显式描述主体、镜头、动作与氛围；若接入多张图，建议使用“图片1 /
					图片2”这种编号叙述。
				</div>
			</div>

			<div class="seedance-field">
				<div class="seedance-label">随机种子</div>
				<input
					class="seedance-input"
					:disabled="sending"
					type="number"
					min="0"
					step="1"
					:value="config.seed ?? ''"
					@input="onSeedInput"
					placeholder="留空则随机"
				/>
			</div>
		</div>

		<div class="seedance-switches">
			<label class="seedance-check">
				<input
					type="checkbox"
					:disabled="sending"
					:checked="config.generateAudio"
					@change="onGenerateAudioChange"
				/>
				生成音频
			</label>
			<label class="seedance-check">
				<input
					type="checkbox"
					:disabled="sending"
					:checked="config.watermark"
					@change="onWatermarkChange"
				/>
				带水印
			</label>
			<label class="seedance-check">
				<input
					type="checkbox"
					:disabled="sending"
					:checked="config.cameraFixed"
					@change="onCameraFixedChange"
				/>
				固定镜头
			</label>
			<label class="seedance-check">
				<input
					type="checkbox"
					:disabled="sending"
					:checked="config.returnLastFrame"
					@change="onReturnLastFrameChange"
				/>
				返回尾帧
			</label>
		</div>
	</div>
</template>

<script lang="ts">
export type SeedanceVideoFormConfig = {
	model: string
	ratio: string
	resolution: string
	refMode: 'auto' | 'first' | 'first-last' | 'reference' | 'recamera'
	useFrames: boolean
	duration: number
	frames?: string
	seed?: string
	templateId?: string
	cameraStrength?: 'weak' | 'medium' | 'strong'
	generateAudio: boolean
	watermark: boolean
	cameraFixed: boolean
	draft: boolean
	returnLastFrame: boolean
	serviceTier: '' | 'default' | 'flex'
	executionExpiresAfter?: string
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

type VideoModelOption = {
	value: string
	label: string
}

const props = defineProps<{
	config: SeedanceVideoFormConfig
	sending?: boolean
}>()

const emit = defineEmits<{
	(e: 'update:config', value: SeedanceVideoFormConfig): void
}>()

const videoModelOptions: VideoModelOption[] = [
	{ value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
	{ value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
	{ value: 'doubao-seedance-2-0-mini-260615', label: 'Seedance 2.0 Mini' },
	{ value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro' },
	{ value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro' },
	{ value: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance 1.0 Pro Fast' },
	{ value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite I2V' },
	{ value: 'doubao-seedance-1-0-lite-t2v-250428', label: 'Seedance 1.0 Lite T2V' },
	{ value: 'jimeng-video-3.0', label: '即梦 视频 3.0' },
	{ value: 'jimeng-video-3.0-pro', label: '即梦 视频 3.0 Pro' }
]

const selectedModel = computed(() => String(props.config.model || '').trim())
const isSeedance20Series = computed(
	() =>
		selectedModel.value === 'doubao-seedance-2-0-260128' ||
		selectedModel.value === 'doubao-seedance-2-0-fast-260128' ||
		selectedModel.value === 'doubao-seedance-2-0-mini-260615'
)
const isSeedance15 = computed(() => selectedModel.value === 'doubao-seedance-1-5-pro-251215')
const isSeedance10Lite = computed(
	() =>
		selectedModel.value === 'doubao-seedance-1-0-lite-i2v-250428' ||
		selectedModel.value === 'doubao-seedance-1-0-lite-t2v-250428'
)
const isJimengVideo = computed(() => selectedModel.value.startsWith('jimeng-video-'))

const durationOptions = computed(() => {
	if (isJimengVideo.value) return [3, 4, 5, 6, 8, 10]
	if (isSeedance20Series.value) return [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
	if (isSeedance15.value) return [4, 5, 6, 7, 8, 9, 10, 11, 12]
	return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
})

const resolutionOptions = computed(() => {
	if (isJimengVideo.value) return ['720p', '1080p']
	if (isSeedance20Series.value) return ['480p', '720p']
	return ['480p', '720p', '1080p']
})

const modelHint = computed(() => {
	if (selectedModel.value === 'doubao-seedance-2-0-fast-260128') {
		return '2.0 Fast 适合快速试稿与频繁迭代；镜头语言和多模态参考能力与 2.0 同系。'
	}
	if (selectedModel.value === 'doubao-seedance-2-0-mini-260615') {
		return '2.0 Mini 是轻量版模型，生成速度更快、成本更低，适合快速验证创意和简单场景。'
	}
	if (selectedModel.value === 'doubao-seedance-2-0-260128') {
		return '2.0 适合更稳定的镜头、动作和角色一致性，支持更强的多模态参考。'
	}
	if (isSeedance15.value) {
		return '1.5 Pro 支持 1080p、Draft 试稿和离线推理，适合先低成本试片再出正式稿。'
	}
	if (isSeedance10Lite.value) {
		return '1.0 Lite 偏轻量低成本，其中 I2V 更适合带图参考，T2V 更适合纯文本起稿。'
	}
	if (selectedModel.value === 'doubao-seedance-1-0-pro-fast-251015') {
		return '1.0 Pro Fast 偏速度，适合快速验证节奏、构图和动作走向。'
	}
	if (selectedModel.value === 'doubao-seedance-1-0-pro-250528') {
		return '1.0 Pro 支持 1080p，适合继续兼容旧工作流和历史提示词。'
	}
	if (selectedModel.value === 'jimeng-video-3.0-pro') {
		return '即梦视频 Pro 走即梦后端链路，适合保留原有即梦视频工作流。'
	}
	if (selectedModel.value === 'jimeng-video-3.0') {
		return '即梦视频 3.0 走即梦后端链路，适合延续旧版即梦视频生成接口。'
	}
	return '按模型能力自动匹配输出规格；若有参考图，请在提示词中明确指定图片1、图片2等编号。'
})

const durationHint = computed(() => {
	if (isSeedance20Series.value) return '当前模型支持 4-15 秒。'
	if (isSeedance15.value) return '当前模型支持 4-12 秒。'
	if (isJimengVideo.value) return '当前即梦视频链路建议优先使用 3-10 秒的短片段。'
	return '当前模型支持 2-12 秒。'
})

const patchConfig = (patch: Partial<SeedanceVideoFormConfig>) => {
	emit('update:config', { ...props.config, ...patch })
}

const onModelChange = (e: Event) => {
	const model = String((e.target as HTMLSelectElement).value || 'doubao-seedance-2-0-260128').trim()
	const nextIsSeedance20 =
		model === 'doubao-seedance-2-0-260128' ||
		model === 'doubao-seedance-2-0-fast-260128' ||
		model === 'doubao-seedance-2-0-mini-260615'
	const nextIsSeedance15 = model === 'doubao-seedance-1-5-pro-251215'
	const nextIsJimeng = model.startsWith('jimeng-video-')
	patchConfig({
		model,
		useFrames: false,
		frames: '',
		draft: nextIsSeedance15 ? props.config.draft : false,
		serviceTier: nextIsSeedance15 ? props.config.serviceTier : '',
		executionExpiresAfter: '',
		templateId: '',
		cameraStrength: 'medium',
		duration: nextIsSeedance20 ? 5 : nextIsJimeng ? 4 : nextIsSeedance15 ? 5 : 3,
		resolution: nextIsSeedance20
			? props.config.resolution || ''
			: props.config.resolution || '720p',
		returnLastFrame: nextIsSeedance15 ? props.config.returnLastFrame : props.config.returnLastFrame
	})
}

const onDurationChange = (e: Event) => {
	const next = Number((e.target as HTMLSelectElement).value || 5) || 5
	const allowed = durationOptions.value
	const fallback = allowed[0] ?? 5
	patchConfig({ duration: allowed.includes(next) ? next : fallback })
}

const onResolutionChange = (e: Event) =>
	patchConfig({ resolution: String((e.target as HTMLSelectElement).value || '').trim() })
const onRatioChange = (e: Event) =>
	patchConfig({
		ratio: String((e.target as HTMLSelectElement).value || 'adaptive').trim()
	})
const onRefModeChange = (e: Event) =>
	patchConfig({
		refMode: String(
			(e.target as HTMLSelectElement).value || 'auto'
		) as SeedanceVideoFormConfig['refMode']
	})
const onSeedInput = (e: Event) =>
	patchConfig({ seed: String((e.target as HTMLInputElement).value || '').trim() })
const onGenerateAudioChange = (e: Event) =>
	patchConfig({ generateAudio: (e.target as HTMLInputElement).checked })
const onWatermarkChange = (e: Event) =>
	patchConfig({ watermark: (e.target as HTMLInputElement).checked })
const onCameraFixedChange = (e: Event) =>
	patchConfig({ cameraFixed: (e.target as HTMLInputElement).checked })
const onReturnLastFrameChange = (e: Event) =>
	patchConfig({ returnLastFrame: (e.target as HTMLInputElement).checked })
</script>

<style scoped>
.seedance-form {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.seedance-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.seedance-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.seedance-label {
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.seedance-input {
	border: 1px solid var(--vscode-border);
	background: rgb(from var(--dweb-defualt) r g b / 0.55);
	color: var(--vscode-fg);
	padding: 6px 8px;
	outline: none;
	border-radius: 0;
}

.seedance-input:focus {
	border-color: var(--vscode-border-accent);
}

.seedance-switches {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 6px 10px;
}

.seedance-check {
	display: flex;
	gap: 6px;
	align-items: center;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}

.seedance-hint {
	margin-top: 4px;
	font-size: 12px;
	color: var(--vscode-fg-muted);
}
</style>
