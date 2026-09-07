<template>
	<div class="harness-config">
		<h2>DeepSeek-Harness 配置</h2>
		<p>选择已有源码，或从自定义 Git 地址准备一份新源码。模型与会话在 Harness 中配置。</p>
		<p v-if="!manager.available.value" role="status">请在 DVStudio 桌面客户端中使用此功能。</p>
		<button type="button" @click="manager.refresh">刷新记录与状态</button>
		<DeepSeekHarnessSourceSelector
			:profiles="manager.profiles.value.records"
			:selected-id="draft.id || ''"
			:active-id="manager.profiles.value.activeProfileId"
			@select="selectRecord"
		/>
		<form @submit.prevent="save">
			<fieldset :disabled="!manager.available.value || manager.locked.value">
				<label>
					记录名称
					<input
						v-model="draft.name"
						maxlength="100"
						required
						placeholder="例如：官方源码 / 我的旧版本"
					/>
				</label>
				<label>
					源码方式
					<select v-model="draft.sourceKind">
						<option value="existing">使用已有本地目录</option>
						<option value="git">从 Git 地址准备</option>
					</select>
				</label>
				<template v-if="draft.sourceKind === 'git'">
					<label>
						HTTPS Git 源码地址
						<input v-model="draft.repoUrl" required type="url" />
					</label>
					<label>
						分支 / 标签 / Commit（可选）
						<input v-model="draft.requestedRef" placeholder="留空使用远程默认分支" />
					</label>
				</template>
				<label>
					{{ draft.sourceKind === 'git' ? '本地目标目录（克隆时必须为空）' : '已有源码目录' }}
					<span class="path-row">
						<input v-model="draft.localPath" required placeholder="绝对路径" />
						<button type="button" @click="choosePath">选择目录</button>
					</span>
				</label>
				<label>
					Node 可执行文件（留空自动检测）
					<input v-model="draft.nodePath" placeholder="例如 C:\nodejs\node.exe" />
				</label>
				<label>
					pnpm 可执行文件 / pnpm.cjs（留空自动检测）
					<input v-model="draft.pnpmPath" placeholder="准备环境时使用源码要求的 pnpm 版本" />
				</label>
				<label>
					本地端口
					<input v-model.number="draft.port" type="number" min="1024" max="65535" required />
				</label>
				<p>仅监听 127.0.0.1；启动不会自动打开浏览器。保存不会安装依赖或重启服务。</p>
				<div class="actions">
					<button type="submit">保存记录</button>
					<button type="button" @click="inspect">检测环境</button>
					<button type="button" :disabled="!draft.localPath" @click="runDiagnose">一键检测</button>
				</div>
			</fieldset>
		</form>
		<div v-if="manager.diagnostics.value" class="diagnostic-section">
			<h3>环境检测结果</h3>
			<DeepSeekHarnessDiagnosticList :result="manager.diagnostics.value" />
			<div class="actions">
				<button
					v-if="manager.diagnostics.value.overall !== 'ready'"
					:disabled="manager.locked.value"
					@click="runAutoSetup"
				>
					一键配置（保存并安装依赖/构建）
				</button>
				<button
					v-if="manager.diagnostics.value.overall === 'ready' && draft.id"
					:disabled="manager.locked.value"
					@click="manager.activateProfile(draft.id!)"
				>
					设为当前源码并启动
				</button>
			</div>
		</div>
		<p v-if="dirty && draft.id">有未保存的修改，请先保存再准备或切换。</p>
		<div class="actions">
			<button
				:disabled="!draft.id || dirty || manager.locked.value"
				@click="manager.activateProfile(draft.id!)"
			>
				设为当前源码
			</button>
			<button :disabled="!draft.id || dirty || manager.locked.value" @click="confirmPrepare = true">
				准备依赖与构建
			</button>
			<button :disabled="!draft.id || dirty || manager.locked.value" @click="remove">
				移除记录（保留源码）
			</button>
		</div>
		<div v-if="confirmPrepare" class="notice" role="alert">
			<p>将运行所选源码的依赖安装和构建脚本；Git 模式下空目录会先克隆源码。请确认该源码可信。</p>
			<button :disabled="manager.locked.value" @click="prepare">开始准备</button>
			<button @click="confirmPrepare = false">取消</button>
		</div>
		<p v-if="manager.preparing.value">
			正在准备环境
			<button @click="manager.cancelPrepare">取消准备</button>
		</p>
		<p role="status">{{ manager.progress.value || message }}</p>
		<div v-if="report" class="notice">
			<p>Harness {{ report.version }} · {{ report.built ? '已构建' : '尚未构建' }}</p>
			<p>Node {{ report.nodeVersion }}（要求 {{ report.nodeRange }}）</p>
			<p>pnpm {{ report.pnpmVersion || report.pnpmError }}（要求 {{ report.packageManager }}）</p>
		</div>
		<p v-if="manager.lastError.value" class="error" role="alert">{{ manager.lastError.value }}</p>
	</div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HarnessServiceManager } from '../../composables/useDeepSeekHarnessServiceManager'
import type { HarnessProfile, HarnessReport } from '../../electronBridge/deepseekHarnessTypes'
import DeepSeekHarnessSourceSelector from './DeepSeekHarnessSourceSelector.vue'
import DeepSeekHarnessDiagnosticList from './DeepSeekHarnessDiagnosticList.vue'
const props = defineProps<{ manager: HarnessServiceManager }>()
const fresh = (): HarnessProfile => ({
	name: '',
	sourceKind: 'existing',
	localPath: '',
	repoUrl: 'https://github.com/deepseek-ai/deepseek-harness.git',
	requestedRef: '',
	nodePath: '',
	pnpmPath: '',
	port: 3080
})
const draft = ref<HarnessProfile>(fresh())
const baseline = ref(JSON.stringify(draft.value))
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const report = ref<HarnessReport>()
const message = ref('')
const confirmPrepare = ref(false)
function selectRecord(id: string) {
	const value = props.manager.profiles.value.records.find((p) => p.id === id)
	draft.value = value ? { ...value } : fresh()
	baseline.value = JSON.stringify(draft.value)
	report.value = undefined
	confirmPrepare.value = false
	message.value = ''
}
async function choosePath() {
	const result = await props.manager.selectPath()
	if (result && !result.cancelled) draft.value.localPath = result.path
}
async function save() {
	const result = await props.manager.saveProfile(draft.value)
	if (result) {
		draft.value = result
		baseline.value = JSON.stringify(result)
		message.value = '已保存。检测通过后可设为当前源码。'
	}
}
async function inspect() {
	report.value = await props.manager.probe(draft.value)
}
async function runDiagnose() {
	if (!draft.value.localPath) return
	if (!draft.value.name) {
		// Auto-name from directory so normalizeProfile passes.
		draft.value.name = draft.value.localPath.split(/[\\/]/).filter(Boolean).pop() || 'Harness'
	}
	await props.manager.diagnose(draft.value)
}
async function runAutoSetup() {
	// Save first (autoSetup requires a stored profile id), then run orchestration.
	if (!draft.value.id || dirty.value) {
		const saved = await props.manager.saveProfile(draft.value)
		if (saved) {
			draft.value = saved
			baseline.value = JSON.stringify(saved)
		} else return
	}
	await props.manager.autoSetup(draft.value)
}
async function prepare() {
	confirmPrepare.value = false
	await props.manager.prepare(draft.value)
	await inspect()
}
async function remove() {
	const result = await props.manager.removeProfile(draft.value)
	if (result) selectRecord('')
}
</script>
<style scoped>
.harness-config {
	overflow: auto;
	padding: 24px;
	background: var(--pl-bg-1);
	border: 1px solid var(--pl-card-border);
	display: flex;
	flex-direction: column;
	gap: 16px;
}
h2,
p {
	margin: 0;
}
p {
	font-size: 13px;
	line-height: 1.6;
}
fieldset {
	border: 0;
	margin: 0;
	padding: 0;
	display: grid;
	gap: 14px;
}
label {
	display: grid;
	gap: 6px;
	font-size: 13px;
}
input,
select,
button {
	font: inherit;
	padding: 9px 12px;
	color: var(--pl-fg);
	background: var(--pl-bg-0);
	border: 1px solid var(--pl-card-border);
	border-radius: 4px;
}
input {
	min-width: 0;
}
button {
	cursor: pointer;
}
button:disabled,
fieldset:disabled {
	opacity: 0.55;
	cursor: default;
}
.path-row,
.actions {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}
.path-row input {
	flex: 1;
}
.notice {
	padding: 12px;
	border: 1px solid var(--pl-accent);
}
.diagnostic-section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.diagnostic-section h3 {
	margin: 0;
	font-size: 14px;
}
.error {
	color: #ff8b8b;
}
</style>
