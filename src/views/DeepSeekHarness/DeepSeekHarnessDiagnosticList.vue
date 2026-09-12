<template>
	<div v-if="result" class="diagnostic-list">
		<div class="summary" :class="result.overall">
			<strong>{{ overallLabel }}</strong>
			<span>{{ overallHint }}</span>
		</div>
		<ul>
			<li v-for="item in result.items" :key="item.key" :class="['item', item.status]">
				<div class="item-head">
					<span class="dot" />
					<strong>{{ item.title }}</strong>
					<span class="status-tag">{{ statusLabel(item.status) }}</span>
				</div>
				<p class="detail">{{ item.detail }}</p>
				<div v-if="item.actions.length" class="actions">
					<template v-for="action in item.actions" :key="action.label">
						<a
							v-if="action.kind === 'link' && action.value"
							:href="action.value"
							target="_blank"
							rel="noopener"
						>
							{{ action.label }}
						</a>
						<code v-else-if="action.kind === 'command'">{{ action.value || action.label }}</code>
						<span v-else>{{ action.label }}</span>
					</template>
				</div>
			</li>
		</ul>
	</div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { HarnessDiagnosticResult } from '../../electronBridge/deepseekHarnessTypes'
const props = defineProps<{ result: HarnessDiagnosticResult | null }>()
const overallLabel = computed(() => {
	switch (props.result?.overall) {
		case 'ready':
			return '环境已就绪'
		case 'auto-fixable':
			return '可自动修复'
		case 'needs-action':
			return '需手动处理'
		default:
			return ''
	}
})
const overallHint = computed(() => {
	switch (props.result?.overall) {
		case 'ready':
			return '可直接启动服务'
		case 'auto-fixable':
			return '点击「一键配置」自动安装依赖并构建'
		case 'needs-action':
			return '请按下方指引处理后重试'
		default:
			return ''
	}
})
function statusLabel(status: string) {
	return status === 'pass' ? '通过' : status === 'warn' ? '警告' : '失败'
}
</script>
<style scoped>
.diagnostic-list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.summary {
	padding: 12px 16px;
	border: 1px solid var(--pl-card-border);
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.summary.ready {
	border-color: #4caf50;
}
.summary.auto-fixable {
	border-color: #ffb74d;
}
.summary.needs-action {
	border-color: #ff8b8b;
}
.summary strong {
	font-size: 15px;
}
.summary span {
	font-size: 12px;
	opacity: 0.8;
}
ul {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.item {
	padding: 10px 12px;
	border: 1px solid var(--pl-card-border);
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.item.pass {
	border-left: 3px solid #4caf50;
}
.item.warn {
	border-left: 3px solid #ffb74d;
}
.item.fail {
	border-left: 3px solid #ff8b8b;
}
.item-head {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
}
.dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
}
.item.pass .dot {
	background: #4caf50;
}
.item.warn .dot {
	background: #ffb74d;
}
.item.fail .dot {
	background: #ff8b8b;
}
.status-tag {
	margin-left: auto;
	font-size: 11px;
	padding: 1px 6px;
	border: 1px solid var(--pl-card-border);
	border-radius: 2px;
	opacity: 0.8;
}
.detail {
	margin: 0;
	font-size: 12px;
	line-height: 1.5;
	opacity: 0.85;
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 12px;
}
.actions a {
	color: var(--pl-accent);
	text-decoration: underline;
}
.actions code {
	padding: 2px 6px;
	background: var(--pl-bg-0);
	border: 1px solid var(--pl-card-border);
	font-family: monospace;
	font-size: 11px;
}
</style>
