<template>
	<div class="frame-run-backdrop" @pointerdown.stop @wheel.stop>
		<section class="frame-run-panel" role="dialog" aria-label="组合自动化">
			<header>
				<strong>{{ title }} · 自动化</strong>
				<button @click="$emit('close')">关闭</button>
			</header>
			<p>
				关闭弹窗会终止本次本地会话，不取消外部 ComfyUI
				任务；可立即重新运行。外层输入按已设置的锚点连线传入；可替换单输出素材来源。请核对每步是生成还是使用已有素材。文本或素材步骤接入外层输入时会替换原内容。ComfyUI
				按输出锚点取本次结果；同一锚点多产物使用第一个。
			</p>
			<div v-for="node in members" :key="node.id" class="member">
				<label>
					{{ node.title || node.id }}
					<select
						:disabled="running"
						:value="replacements[node.id] || ''"
						@change="choose(node.id, $event)"
					>
						<option value="">使用组合内原流程</option>
						<option
							v-for="source in sources.filter((s) => s.type === node.type)"
							:key="source.id"
							:value="source.id"
						>
							替换为：{{ source.title || source.id }}
						</option>
					</select>
				</label>
				<select v-if="!replacements[node.id]" :disabled="running" v-model="steps[node.id].action">
					<option v-if="node.type !== 'comfyui'" value="source">
						{{ node.type === 'text' ? '使用当前文本（不生成）' : '使用已有素材（不生成）' }}
					</option>
					<option value="generate">
						{{ node.type === 'comfyui' ? '执行 ComfyUI 工作流' : '按提示词生成' }}
					</option>
				</select>
				<textarea
					v-if="
						node.type !== 'comfyui' &&
						!replacements[node.id] &&
						steps[node.id].action === 'generate'
					"
					:disabled="running"
					v-model="steps[node.id].prompt"
					placeholder="输入本次提示词；留空则使用上游文本"
				/>
			</div>
			<details v-if="automation">
				<summary>外层接口映射（更换成员时保留外部连线）</summary>
				<template
					v-for="direction in ['inputBindings', 'outputBindings'] as const"
					:key="direction"
				>
					<label v-for="binding in automation[direction]" :key="binding.id">
						{{ direction === 'inputBindings' ? '输入' : '输出' }} {{ binding.label || binding.id }}
						<select
							:disabled="running"
							:value="JSON.stringify([binding.nodeId, binding.anchorId])"
							@change="rebind(direction, binding.id, $event)"
						>
							<optgroup
								v-for="member in members"
								:key="member.id"
								:label="member.title || member.id"
							>
								<option
									v-for="port in direction === 'inputBindings' ? member.inputs : member.outputs"
									:key="port.id"
									:value="JSON.stringify([member.id, port.id])"
								>
									{{ port.label || port.id }}
								</option>
							</optgroup>
						</select>
						<select
							v-if="direction === 'inputBindings'"
							:disabled="running"
							:value="binding.bindingMode || 'target-input'"
							@change="
								$emit(
									'mode',
									binding.id,
									($event.target as HTMLSelectElement).value as 'target-input' | 'source-output'
								)
							"
						>
							<option value="target-input">传入成员输入</option>
							<option value="source-output">替换成员素材（单输出）</option>
						</select>
					</label>
				</template>
			</details>
			<p role="status">{{ message }}</p>
			<button :disabled="running" @click="$emit('run', replacements, steps)">验证并运行</button>
			<button :disabled="!running" @click="$emit('stop')">终止本次会话</button>
			<h4>执行记录</h4>
			<p v-if="!records.length">
				暂无记录。首次运行会保存当次参数与输入；过去未记录的操作不会自动还原。
			</p>
			<article v-for="record in records" :key="record.id">
				<span>
					{{ new Date(record.createdAt).toLocaleString() }} ·
					{{ statusLabels[record.status] || record.status }}
				</span>
				<button :disabled="running" @click="$emit('replay', record.id)">按此记录重新执行</button>
				<button
					v-if="record.status === 'failed' || record.status === 'cancelled'"
					:disabled="running"
					@click="$emit('resume', record.id)"
				>
					从失败处继续
				</button>
				<button
					v-if="record.status === 'succeeded'"
					:disabled="running"
					@click="$emit('reuse', record.id)"
				>
					复用结果
				</button>
				<button @click="$emit('inspect', record.id)">查看 / 导出记录</button>
			</article>
			<template v-if="detail">
				<button @click="download">下载记录（含流程参数）</button>
				<pre>{{ JSON.stringify(detail, null, 2) }}</pre>
			</template>
		</section>
	</div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FrameAutomationData } from '../../../aiworkflow/types'
import type { FrameStepChoice } from '../../../views/AIWorkflow/automation/frameExecutionContext'
import type {
	FrameRunSummary,
	FrameRunRecord
} from '../../../views/AIWorkflow/automation/frameRunCoordinator'
const statusLabels: Record<string, string> = {
	preparing: '准备中',
	running: '运行中',
	succeeded: '已成功',
	failed: '失败',
	cancelled: '本次会话已终止',
	interrupted: '会话已中断（可重新运行）',
	submission_unknown: '提交结果不确定（可重新运行）'
}
const props = defineProps<{
	title: string
	frameId: string
	members: {
		id: string
		type: string
		title?: string
		nodeChatDraft?: string
		inputs: { id: string; label?: string }[]
		outputs: { id: string; label?: string }[]
	}[]
	sources: { id: string; type: string; title?: string }[]
	automation?: FrameAutomationData
	running: boolean
	message: string
	records: FrameRunSummary[]
	detail?: FrameRunRecord
}>()
const emit = defineEmits<{
	close: []
	run: [Record<string, string>, Record<string, FrameStepChoice>]
	stop: []
	replay: [string]
	inspect: [string]
	resume: [string]
	reuse: [string]
	mode: [string, 'target-input' | 'source-output']
	rebind: ['inputBindings' | 'outputBindings', string, string, string]
}>()
const steps = ref<Record<string, FrameStepChoice>>({})
const replacements = ref<Record<string, string>>({})
watch(
	() => props.frameId,
	() => {
		replacements.value = {}
		steps.value = Object.fromEntries(
			props.members.map((n) => [
				n.id,
				{
					action: n.type === 'comfyui' || n.nodeChatDraft?.trim() ? 'generate' : 'source',
					prompt: n.nodeChatDraft || ''
				}
			])
		)
	},
	{ immediate: true }
)
function choose(id: string, event: Event) {
	const value = (event.target as HTMLSelectElement).value
	if (value) replacements.value[id] = value
	else delete replacements.value[id]
}
function rebind(direction: 'inputBindings' | 'outputBindings', id: string, event: Event) {
	const [nodeId, anchorId] = JSON.parse((event.target as HTMLSelectElement).value)
	emit('rebind', direction, id, nodeId, anchorId)
}
function download() {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(props.detail, null, 2)], { type: 'application/json' })
	)
	const a = document.createElement('a')
	a.href = url
	a.download = `frame-run-${props.detail?.id}.json`
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<style scoped>
.frame-run-backdrop {
	position: fixed;
	inset: 0;
	background: #0008;
	z-index: 3000;
	display: grid;
	place-items: center;
}
.frame-run-panel {
	background: #20252d;
	color: #eee;
	padding: 24px;
	border-radius: 8px;
	width: min(760px, 90vw);
	max-height: 85vh;
	overflow: auto;
}
header {
	display: flex;
	justify-content: space-between;
}
label,
article {
	display: flex;
	align-items: center;
	gap: 12px;
	margin: 10px 0;
}
select {
	flex: 1;
}
textarea {
	width: 100%;
	min-height: 60px;
	margin-top: 6px;
	box-sizing: border-box;
}
.member {
	border-bottom: 1px solid #475569;
	padding-bottom: 8px;
}
button,
textarea,
select {
	background: #334155;
	color: white;
	border: 1px solid #64748b;
	padding: 6px;
	border-radius: 4px;
}
button:disabled {
	opacity: 0.5;
}
pre {
	max-height: 260px;
	overflow: auto;
	font-size: 11px;
}
</style>
