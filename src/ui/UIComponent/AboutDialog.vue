<script setup lang="ts">
import ModalDialog from './ModalDialog.vue'
import { getAppInfo, openHomepage, openRepoUrl } from '../../network/appInfo'
import { useAboutDialog } from './aboutDialogStore'
import { useI18n } from '../../i18n'

const { t } = useI18n()
const { aboutOpen, closeAboutDialog } = useAboutDialog()
const info = getAppInfo()

function handleConfirm() {
	closeAboutDialog()
}

function onClose() {
	closeAboutDialog()
}
</script>

<template>
	<ModalDialog
		:open="aboutOpen"
		:title="t('about.title', { appName: info.appName })"
		:confirm-text="t('about.confirm')"
		:close-text="t('about.close')"
		@confirm="handleConfirm"
		@close="onClose"
	>
		<div class="about-content">
			<div class="about-header">
				<img class="about-logo" src="/favicon.ico" alt="" aria-hidden="true" />
				<div class="about-title-wrap">
					<div class="about-app-name">{{ info.appName }}</div>
					<div class="about-version">{{ t('about.version', { version: info.appVersion }) }}</div>
				</div>
			</div>

			<div class="about-info-section">
				<div class="about-info-row">
					<span class="about-info-label">{{ t('about.license') }}</span>
					<span class="about-license-badge">{{ info.license }}</span>
				</div>
				<div class="about-info-row">
					<span class="about-info-label">{{ t('about.copyright') }}</span>
					<span class="about-info-value">{{ info.copyright }}</span>
				</div>
			</div>

			<div class="about-links">
				<button class="about-link-btn" type="button" @click="openHomepage()">
					{{ t('about.officialWebsite') }}
				</button>
				<button class="about-link-btn" type="button" @click="openRepoUrl()">
					{{ t('about.githubRepo') }}
				</button>
			</div>
		</div>
	</ModalDialog>
</template>

<style scoped>
.about-content {
	padding: 4px 4px 8px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.about-header {
	display: flex;
	align-items: center;
	gap: 14px;
}

.about-logo {
	width: 56px;
	height: 56px;
	flex: 0 0 56px;
	border-radius: 12px;
}

.about-title-wrap {
	min-width: 0;
}

.about-app-name {
	font-size: 20px;
	font-weight: 600;
	color: var(--theme-text-primary);
	line-height: 1.3;
}

.about-version {
	font-size: 13px;
	color: var(--theme-text-secondary);
	margin-top: 2px;
}

.about-info-section {
	border: 1px solid var(--theme-border);
	border-radius: 8px;
	padding: 12px 14px;
	background: var(--theme-bg-tertiary);
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.about-info-row {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 13px;
}

.about-info-label {
	color: var(--theme-text-secondary);
	min-width: 56px;
	flex-shrink: 0;
}

.about-info-value {
	color: var(--theme-text-primary);
}

.about-license-badge {
	display: inline-block;
	padding: 1px 8px;
	border-radius: 4px;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-secondary);
	font-weight: 600;
	font-size: 12px;
	color: var(--theme-text-primary);
}

.about-links {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}

.about-link-btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--theme-border);
	border-radius: 6px;
	background: var(--theme-bg-secondary);
	color: var(--theme-text-primary);
	padding: 6px 14px;
	font-size: 13px;
	cursor: pointer;
	transition: border-color 0.15s, background 0.15s;
}

.about-link-btn:hover {
	border-color: var(--theme-accent);
	background: var(--theme-hover-bg);
}
</style>
