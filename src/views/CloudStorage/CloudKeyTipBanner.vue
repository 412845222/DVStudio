<template>
	<div class="cs-key-tip">
		<div class="cs-tip-corners" aria-hidden="true">
			<span class="cs-tc tl"></span>
			<span class="cs-tc tr"></span>
			<span class="cs-tc bl"></span>
			<span class="cs-tc br"></span>
		</div>
		<div class="cs-tip-bar" aria-hidden="true"></div>
		<svg viewBox="0 0 16 16" class="cs-tip-icon" aria-hidden="true">
			<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
			<path d="M8 7v3M8 5v.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
		<div class="cs-tip-content">
			<div class="cs-tip-text">{{ t('cloudStorage.config.keyTip', { provider: providerName }) }}</div>
			<div v-if="tipText" class="cs-tip-sub">{{ tipText }}</div>
			<div v-else class="cs-tip-sub">{{ t('cloudStorage.config.keyTipSub') }}</div>
		</div>
		<button class="cs-tip-btn" type="button" @click="openApplyUrl">
			<svg viewBox="0 0 16 16" class="cs-tip-btn-icon" aria-hidden="true">
				<path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
				<path d="M9.5 3.5h3v3M13 3l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			{{ t('cloudStorage.config.applyKey') }}
		</button>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'
import { openExternalUrl } from '../../electronBridge'

const { t } = useI18n()

const props = defineProps<{
	providerName: string
	applyUrl: string
	tipText?: string
}>()

const openApplyUrl = () => {
	if (props.applyUrl) {
		openExternalUrl(props.applyUrl)
	}
}
</script>

<style scoped>
.cs-key-tip {
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 12px 14px 12px 18px;
	margin-bottom: 16px;
	background: color-mix(in srgb, var(--pl-accent) 6%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	color: color-mix(in srgb, var(--pl-accent) 80%, white);
	animation: cs-tip-in 300ms ease-out;
}

@keyframes cs-tip-in {
	from { opacity: 0; transform: translateY(-4px); }
	to { opacity: 1; transform: translateY(0); }
}

.cs-tip-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-tc {
	position: absolute;
	width: 6px;
	height: 6px;
	border-color: var(--pl-accent);
}

.cs-tc.tl {
	top: 2px;
	left: 2px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--pl-accent) 70%, white);
}

.cs-tc.tr {
	top: 2px;
	right: 2px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--pl-accent) 70%, white);
}

.cs-tc.bl {
	bottom: 2px;
	left: 2px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: color-mix(in srgb, var(--pl-accent) 70%, white);
}

.cs-tc.br {
	bottom: 2px;
	right: 2px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: color-mix(in srgb, var(--pl-accent) 70%, white);
}

.cs-tip-bar {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	width: 3px;
	background: linear-gradient(180deg, var(--pl-accent), color-mix(in srgb, var(--pl-accent) 40%, transparent));
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.cs-tip-icon {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
	filter: drop-shadow(0 0 6px color-mix(in srgb, var(--pl-accent) 50%, transparent));
	margin-top: 2px;
}

.cs-tip-content {
	flex: 1;
	min-width: 0;
}

.cs-tip-text {
	font-size: 11px;
	line-height: 1.5;
	color: color-mix(in srgb, var(--pl-accent) 85%, white);
	letter-spacing: 0.3px;
}

.cs-tip-sub {
	font-size: 10px;
	line-height: 1.4;
	color: color-mix(in srgb, var(--pl-accent) 60%, var(--pl-fg-soft));
	margin-top: 4px;
	letter-spacing: 0.2px;
}

.cs-tip-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
	padding: 6px 10px;
	font-size: 10px;
	font-family: inherit;
	color: color-mix(in srgb, var(--pl-accent) 80%, white);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	cursor: pointer;
	transition: all 180ms ease;
	letter-spacing: 0.4px;
	text-transform: uppercase;
	white-space: nowrap;
}

.cs-tip-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 18%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 60%, white);
	color: color-mix(in srgb, var(--pl-accent) 90%, white);
	box-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent) 25%, transparent);
}

.cs-tip-btn-icon {
	width: 10px;
	height: 10px;
}
</style>
