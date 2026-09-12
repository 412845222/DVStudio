<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useEnvCheck } from './useEnvCheck'

const emit = defineEmits<{ allReady: [] }>()

const {
	step1,
	step2,
	step3,
	allReady,
	installPlugin,
	startDshService,
	fixModelVision,
	recheckStep,
	runAllChecks
} = useEnvCheck()

const isStarting1 = ref(false)
const isInstalling = ref(false)
const isFixingVision = ref(false)
const hasEmittedReady = ref(false)

onMounted(() => {
	runAllChecks()
})

// 只在首次变为 ready 时 emit，不阻止二次操作
watch(allReady, (ready) => {
	if (ready && !hasEmittedReady.value) {
		hasEmittedReady.value = true
		emit('allReady')
	}
})

async function onStartDsh() {
	isStarting1.value = true
	await startDshService()
	isStarting1.value = false
}

async function onInstallPlugin() {
	isInstalling.value = true
	await installPlugin()
	isInstalling.value = false
}

async function onFixVision() {
	isFixingVision.value = true
	await fixModelVision()
	isFixingVision.value = false
}

async function onRecheckStep(step: 1 | 2 | 3) {
	await recheckStep(step)
}

function iconFor(status: string): string {
	if (status === 'ok') return '✅'
	if (status === 'fail') return '❌'
	if (status === 'checking') return '⏳'
	return '○'
}

// Step 1 始终在非 checking/非 busy 时显示"启动服务"按钮（除非已经 ok）
function step1ActionVisible(status: string): boolean {
	return status !== 'checking' && !isStarting1.value
}

// Step 2 始终显示"安装插件"按钮（无论 ok 还是 fail），除非正在安装中
function step2ActionVisible(status: string): boolean {
	return status !== 'checking' && !isInstalling.value
}

// Step 3 在 fail 时显示"修复"按钮
function step3ActionVisible(status: string): boolean {
	return status !== 'checking' && !isFixingVision.value
}

function step2ActionLabel(status: string): string {
	if (status === 'ok') return '重新安装'
	return '安装插件'
}

function isPrimaryBusy(step: 1 | 2 | 3): boolean {
	if (step === 1) return isStarting1.value
	if (step === 2) return isInstalling.value
	if (step === 3) return isFixingVision.value
	return false
}

function primaryBusyText(step: 1 | 2 | 3): string {
	if (step === 1) return '启动中…'
	if (step === 2) return '安装中…'
	if (step === 3) return '修复中…'
	return '处理中…'
}

async function onPrimaryAction(step: 1 | 2 | 3) {
	if (step === 1) await onStartDsh()
	else if (step === 2) await onInstallPlugin()
	else if (step === 3) await onFixVision()
}
</script>

<template>
	<div class="dc-env-check">
		<div class="dc-env-title">环境检查</div>

		<!-- Step 1: DSH 服务 -->
		<div class="dc-env-step" :class="step1.status">
			<span class="dc-env-icon">{{ iconFor(step1.status) }}</span>
			<div class="dc-env-step-body">
				<div class="dc-env-step-title">DSH 服务</div>
				<div class="dc-env-step-detail">{{ step1.detail || '等待检查' }}</div>
			</div>
			<div class="dc-env-step-actions">
				<button
					v-if="step1ActionVisible(step1.status) && step1.status !== 'ok'"
					class="dc-env-action-btn"
					:disabled="isPrimaryBusy(1)"
					@click="onPrimaryAction(1)"
				>
					{{ isPrimaryBusy(1) ? primaryBusyText(1) : '启动服务' }}
				</button>
				<button
					v-if="step1.status !== 'checking' && !isPrimaryBusy(1)"
					class="dc-env-recheck-btn"
					@click="onRecheckStep(1)"
				>
					重新检查
				</button>
			</div>
		</div>

		<!-- Step 2: DSH 插件 -->
		<div class="dc-env-step" :class="step2.status">
			<span class="dc-env-icon">{{ iconFor(step2.status) }}</span>
			<div class="dc-env-step-body">
				<div class="dc-env-step-title">DSH 插件</div>
				<div class="dc-env-step-detail">{{ step2.detail || '等待检查' }}</div>
			</div>
			<div class="dc-env-step-actions">
				<button
					v-if="step2ActionVisible(step2.status)"
					class="dc-env-action-btn"
					:disabled="isPrimaryBusy(2)"
					@click="onPrimaryAction(2)"
				>
					{{ isPrimaryBusy(2) ? primaryBusyText(2) : step2ActionLabel(step2.status) }}
				</button>
				<button
					v-if="step2.status !== 'checking' && !isPrimaryBusy(2)"
					class="dc-env-recheck-btn"
					@click="onRecheckStep(2)"
				>
					重新检查
				</button>
			</div>
		</div>

		<!-- Step 3: 模型多模态能力 -->
		<div class="dc-env-step" :class="step3.status">
			<span class="dc-env-icon">{{ iconFor(step3.status) }}</span>
			<div class="dc-env-step-body">
				<div class="dc-env-step-title">模型图片理解</div>
				<div class="dc-env-step-detail">{{ step3.detail || '等待检查' }}</div>
			</div>
			<div class="dc-env-step-actions">
				<button
					v-if="step3ActionVisible(step3.status) && step3.status === 'fail'"
					class="dc-env-action-btn"
					:disabled="isPrimaryBusy(3)"
					@click="onPrimaryAction(3)"
				>
					{{ isPrimaryBusy(3) ? primaryBusyText(3) : '一键修复' }}
				</button>
				<button
					v-if="step3.status !== 'checking' && !isPrimaryBusy(3)"
					class="dc-env-recheck-btn"
					@click="onRecheckStep(3)"
				>
					重新检查
				</button>
			</div>
		</div>

		<!-- 全部通过 -->
		<div v-if="allReady" class="dc-env-ready">✅ 环境就绪，正在加载聊天…</div>

		<!-- 全局重新检查按钮（始终显示，支持二次操作） -->
		<div class="dc-env-footer">
			<button class="dc-env-recheck-all-btn" @click="runAllChecks">重新检查全部</button>
		</div>
	</div>
</template>

<style scoped>
.dc-env-check {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px 14px;
	height: 100%;
	overflow-y: auto;
}

.dc-env-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--dc-text, #e0e0e0);
	padding-bottom: 4px;
}

.dc-env-step {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 6px;
	background: var(--dc-bg-card, #252830);
	transition: opacity 0.3s;
}

.dc-env-step.pending {
	opacity: 0.85;
}

.dc-env-step.checking {
	opacity: 0.8;
}

.dc-env-step.fail {
	border-left: 3px solid #e05050;
}

.dc-env-step.ok {
	border-left: 3px solid #50c878;
}

.dc-env-icon {
	font-size: 16px;
	flex-shrink: 0;
	line-height: 1.4;
}

.dc-env-step-body {
	flex: 1;
	min-width: 0;
}

.dc-env-step-title {
	font-size: 12px;
	font-weight: 500;
	color: var(--dc-text, #e0e0e0);
}

.dc-env-step-detail {
	font-size: 11px;
	color: var(--dc-text-muted, #999);
	margin-top: 2px;
	line-height: 1.4;
}

.dc-env-step-actions {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex-shrink: 0;
}

.dc-env-action-btn {
	padding: 4px 10px;
	background: var(--dc-accent, #4a7dff);
	color: #fff;
	border: none;
	border-radius: 4px;
	font-size: 11px;
	cursor: pointer;
	white-space: nowrap;
}

.dc-env-action-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.dc-env-recheck-btn {
	padding: 4px 10px;
	background: transparent;
	color: var(--dc-text-muted, #999);
	border: 1px solid var(--dc-border, #3a3d46);
	border-radius: 4px;
	font-size: 10px;
	cursor: pointer;
	white-space: nowrap;
}

.dc-env-recheck-btn:hover {
	color: var(--dc-text, #e0e0e0);
	border-color: var(--dc-accent, #4a7dff);
}

.dc-env-ready {
	text-align: center;
	font-size: 12px;
	color: #50c878;
	padding: 8px;
}

.dc-env-footer {
	display: flex;
	justify-content: center;
	padding-top: 4px;
}

.dc-env-recheck-all-btn {
	padding: 6px 16px;
	background: transparent;
	color: var(--dc-text-muted, #999);
	border: 1px solid var(--dc-border, #3a3d46);
	border-radius: 4px;
	font-size: 11px;
	cursor: pointer;
}

.dc-env-recheck-all-btn:hover {
	color: var(--dc-text, #e0e0e0);
	border-color: var(--dc-accent, #4a7dff);
}
</style>
